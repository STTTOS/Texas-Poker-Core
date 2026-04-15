import type { Poke } from '@/Deck/constant'
import type { TableCommand } from '@/domain/tableCommand'
import type {
  HandDomainEvent,
  TexasDomainEvent,
  SessionDomainEvent
} from '@/domain/handDomainEvents'

import Pool from '@/Pool'
import Room from '@/Room'
import Dealer from '@/Dealer'
import Player, { User } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import Controller, { type PendingFlowOpKind } from '@/Controller'
import {
  TexasEngineContext,
  type TexasEngineGlobalOptions
} from '@/TexasEngineContext'
import {
  executeBet,
  executeCall,
  executeFold,
  executeAllIn,
  executeCheck,
  executeRaise
} from '@/Player/handBettingActions'

/** 当前引擎角色表最多支持 10 人桌；更大人数需扩展 playerRoleSetMap */
const SUPPORTED_MAX_TABLE_PLAYERS = 10

export interface CreateRoomInputArgs {
  lowestBetAmount: number
  /** 房间内最大人数（观战 + 入座），与引擎上桌人数上限取 min */
  maximumCountOfPlayers: number
  initialChips: number
  user: User
  thinkingTime?: number
}

export type { TexasDomainEvent, HandDomainEvent, SessionDomainEvent }
export type { TableCommand } from '@/domain/tableCommand'

/**
 * 单桌会话：房间、奖池、荷官与 {@link Controller}。
 * 玩家行动走 {@link dispatchCommand}；规则产出经 {@link drainDomainEvents} 取出，进街/交权节奏由 {@link getPendingFlowOps} 队列 + 业务消费 API 驱动。
 */
class Texas {
  pool: Pool
  room: Room
  dealer: Dealer
  controller: Controller
  #sessionSeq = 0
  #sessionEvents: SessionDomainEvent[] = []
  fail: (error: TexasError) => never
  handleError: (error: TexasError) => never

  constructor({
    user,
    thinkingTime,
    lowestBetAmount,
    maximumCountOfPlayers,
    initialChips
  }: CreateRoomInputArgs) {
    this.fail = (error: TexasError) => {
      throw error
    }
    this.handleError = this.fail
    const cappedMaxPlayers = Math.min(
      maximumCountOfPlayers,
      SUPPORTED_MAX_TABLE_PLAYERS
    )
    const dealer = new Dealer(lowestBetAmount, this.fail, {
      maxTablePlayers: cappedMaxPlayers
    })
    const pool = new Pool(this.fail)
    const controller = new Controller(dealer, pool, this.fail)
    const owner = new Player({
      user,
      initialChips,
      pot: pool,
      dealerRing: dealer,
      handSession: controller,
      thinkingTime,
      stakes: dealer.stakes,
      fail: this.fail
    })
    const room = new Room({
      dealer,
      owner,
      initialChips,
      maximumCountOfPlayers: cappedMaxPlayers,
      fail: this.fail
    })
    this.pool = pool
    this.room = room
    this.dealer = dealer
    this.controller = controller
  }

  /**
   * 取出自上次 drain 以来累积的领域事件（会话级 + 本手级），并清空缓冲。
   * 业务在持久化/WS 后应按节拍调用 {@link applyPendingStageAdvance} / {@link flushPendingTurnHandoff}（或封装好的 drain），否则队列堆积、下一行动方无法 `getControl`。
   */
  drainDomainEvents(): TexasDomainEvent[] {
    const session = this.#sessionEvents.splice(0)
    const hand = this.controller.drainHandEvents()
    return [...session, ...hand]
  }

  #nextSessionSeq() {
    this.#sessionSeq += 1
    return this.#sessionSeq
  }

  /**
   * @deprecated 无限德州（NL）仅表示下注无上限，**允许短码**；全员筹码 ≥ 大盲属于产品/风控策略。
   * `setPlayerRoles` **不再**调用；若业务仍要在开桌前强制校验，可在 `setPlayerRoles` 前自行调用。
   */
  assertSeatedPlayersMeetBigBlind(): void {
    const bigBlind = this.dealer.lowestBetAmount
    for (const player of this.dealer.players) {
      if (player.balance < bigBlind) {
        this.fail(
          new TexasError(
            TexasCoreErrorCode.SESSION_SET_ROLES_BALANCE_BELOW_BB,
            {
              userId: player.getUserInfo().id,
              balance: player.balance,
              bigBlind
            }
          )
        )
      }
    }
  }

  /**
   * 轮换/初始角色并缓冲 `RolesAssigned`（会话级事件）。
   * 不在此校验「全员 ≥ 大盲」；短码上桌见 {@link assertSeatedPlayersMeetBigBlind}（已废弃，仅业务自选）。
   */
  setPlayerRoles(type: 'initial' | 'rotate' = 'initial') {
    if (type === 'initial') {
      this.room.initialRoles()
    } else {
      this.room.rotateRoles()
    }
    const players = this.dealer
      .getPlayersByActionSequence()
      .map((p, index) => ({
        userId: p.getUserInfo().id,
        name: p.getUserInfo().name,
        role: p.getRole()!,
        actionIndex: index
      }))
    this.#sessionEvents.push({
      type: 'RolesAssigned',
      payload: { seq: this.#nextSessionSeq(), players }
    })
  }

  /**
   * 按当前庄位与环上人数重算 SB/BB/UTG…（委托 {@link Dealer.reArrangeRoles}）。
   * `Dealer.join` / `remove` 在环变化后**已**各自调用一次；业务可在批量 `seat`/`remove` 后再调本方法，与最后一次入/离座效果一致，便于**统一向客户端推送角色**（本方法**不**写入 `RolesAssigned` 会话事件，需自行读 `dealer` / `setPlayerRoles` 式快照）。
   */
  reArrangeRoles(): void {
    this.dealer.reArrangeRoles()
  }

  /** 发手牌并缓冲 `HoleCardsDealt`（会话级事件）。 */
  dealCards() {
    this.dealer.dealCards()
    const byUserId: Record<number, Poke[]> = {}
    for (const p of this.dealer.players) {
      byUserId[p.getUserInfo().id] = p.getHandPokes()
    }
    this.#sessionEvents.push({
      type: 'HoleCardsDealt',
      payload: { seq: this.#nextSessionSeq(), byUserId }
    })
  }

  lockSeats() {
    this.room.lockSeats()
  }

  unlockSeats() {
    this.room.unlockSeats()
  }

  /**
   * 开始本手：`HandStarted` / 盲注等事件进入缓冲，且队列入队首人 `turn_handoff`。
   * 须随后 drain 并消费队列，首条 `TurnOffered` 才会出现。
   */
  start() {
    if (this.room.getPlayersBySeatStatus('on-set').length < 2)
      this.fail(
        new TexasError(TexasCoreErrorCode.SESSION_START_MIN_SEATED, {
          min: 2
        })
      )

    if (this.room.status === 'seats_open')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_START_SEATS_OPEN))

    if (this.controller.status !== 'idle')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_START_NOT_IDLE))

    this.controller.start()
  }

  /** 强制结束本手到 `between_hands`；状态校验由 {@link Controller.end} 负责（非 `in_hand` 时 `CTRL_END_NOT_IN_HAND`）。 */
  end() {
    this.controller.end()
  }

  /** 中央池分配给赢家并缓冲 `PotAwarded`（通常在解释 `HandEnded` 时调用）。 */
  settle() {
    const potTotal = this.pool.totalAmount
    this.pool.pay()
    const allocations = Array.from(this.pool.bills.entries()).map(
      ([userId, amount]) => ({ userId, amount })
    )
    this.controller.recordPotAwarded(potTotal, allocations)
  }

  /** 委托 {@link Controller.flushPendingTurnHandoff}；队头非 `turn_handoff` 时 Controller 侧静默 no-op。 */
  flushPendingTurnHandoff(): void {
    this.controller.flushPendingTurnHandoff()
  }

  /** 流程队列快照（`stage_advance` | `turn_handoff`），不改变状态。 */
  getPendingFlowOps(): PendingFlowOpKind[] {
    return this.controller.getPendingFlowOps()
  }

  /** 委托 {@link Controller.applyPendingStageAdvance}；队头错误时抛 `CTRL_FLOW_PENDING_MISMATCH`。 */
  applyPendingStageAdvance(): void {
    this.controller.applyPendingStageAdvance()
  }

  /** 委托 {@link Controller.drainPendingFlowOpsSync}；无 sleep，直至队列为空。 */
  flushAllPendingFlowOps(): void {
    this.controller.drainPendingFlowOpsSync()
  }

  /**
   * 统一指令入口：经 `handBettingActions` 落账并触发 `transferControl` 链。
   * 调用后须 **drain 领域事件** 并按产品节拍 **消费 `pendingFlowOps`**；在队头为 `turn_handoff` 时须先
   * {@link flushPendingTurnHandoff}，否则当前 `activePlayer` 会因 {@link Player.checkIfCanAct} 拒绝自愿指令（防 HTTP 抢跑）。
   * 超时：`FoldDueToTimeout` / `CheckDueToTimeout`（内部 `setPendingTurnEndedReason('timeout')`，且跳过「已开示思考权」校验）。
   */
  dispatchCommand(cmd: TableCommand): void {
    const playerId = cmd.playerId
    const actor = this.dealer.players.find(
      (p) => p.getUserInfo().id === playerId
    )
    if (!actor)
      this.fail(
        new TexasError(TexasCoreErrorCode.SESSION_DISPATCH_PLAYER_NOT_FOUND, {
          playerId
        })
      )

    if (this.room.getPlayerSeatStatus(actor) !== 'on-set') {
      this.fail(
        new TexasError(TexasCoreErrorCode.SESSION_DISPATCH_PLAYER_NOT_ON_SET, {
          playerId
        })
      )
    }

    switch (cmd.type) {
      case 'Fold':
        executeFold(actor)
        break
      case 'FoldDueToTimeout':
        this.controller.setPendingTurnEndedReason('timeout')
        executeFold(actor, { skipTurnOfferRequirement: true })
        break
      case 'CheckDueToTimeout':
        this.controller.setPendingTurnEndedReason('timeout')
        executeCheck(actor, { skipTurnOfferRequirement: true })
        break
      case 'Check':
        executeCheck(actor)
        break
      case 'Call':
        executeCall(actor)
        break
      case 'Bet':
        executeBet(actor, cmd.amount)
        break
      case 'Raise':
        executeRaise(actor, cmd.additionalAmount)
        break
      case 'AllIn':
        executeAllIn(actor)
        break
      default: {
        const _exhaustive: never = cmd
        return _exhaustive
      }
    }
  }

  /**
   * 清理奖池、荷官与本手控制器状态；并将房间 {@link Room.unlockSeats}，
   * 以便在下一手 `setPlayerRoles` 之前可 `seat` / `watch` / `remove`。
   */
  reset() {
    this.pool.reset()
    this.controller.reset()
    this.dealer.reset()
    this.room.unlockSeats()
    this.#sessionSeq = 0
    this.#sessionEvents = []
  }

  resetBeforeGameStart() {
    this.reset()
  }

  getDefaultBet() {
    return this.controller.defaultBets
  }

  createPlayer(userInfo: User) {
    return new Player({
      user: userInfo,
      initialChips: this.room.initialChips,
      pot: this.pool,
      dealerRing: this.dealer,
      handSession: this.controller,
      thinkingTime: this.room.owner.thinkingTime,
      stakes: this.dealer.stakes,
      fail: this.fail
    })
  }

  static configureEngine(patch: Partial<TexasEngineGlobalOptions>): void {
    TexasEngineContext.configure(patch)
  }

  static resetEngineContext(): void {
    TexasEngineContext.reset()
  }
}

export default Texas
