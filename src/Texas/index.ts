import type { Poke } from '@/Deck/constant'
import type { TableCommand } from '@/domain/tableCommand'
import type {
  HandDomainEvent,
  TexasDomainEvent
} from '@/domain/handDomainEvents'

import Pool from '@/Pool'
import Room from '@/Room'
import Dealer from '@/Dealer'
import Player, { User, ActionTypeEnum } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import Controller, { type PendingFlowOp } from '@/Controller'
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
}

export type { TexasDomainEvent, HandDomainEvent }
export type { TableCommand } from '@/domain/tableCommand'
export {
  parseTableCommandFromJson,
  parseTableCommandFromUnknown
} from '@/domain/tableCommandParse'

/**
 * 单桌会话：房间、奖池、荷官与 {@link Controller}。
 * 规则入口（{@link dispatchCommand}、`start`、`dealCards`、队列消费等）**同步返回**本步产生的
 * {@link TexasDomainEvent}，与文档中 `apply → events[]` 形态对齐；仍可用 {@link drainDomainEvents} 取出
 * 未经上述 API 消费的缓冲（少见）。进街/交权节奏由 {@link getPendingFlowOps} + `flush*` / `apply*` 驱动。
 */
class Texas {
  pool: Pool
  room: Room
  dealer: Dealer
  controller: Controller
  fail: (error: TexasError) => never
  handleError: (error: TexasError) => never

  constructor({
    user,
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
   * 取出自上次 drain 以来累积的领域事件，并清空缓冲。
   * 业务在持久化/WS 后应按节拍调用 {@link applyPendingStageAdvance} / {@link flushPendingTurnHandoff}（或封装好的 drain），否则队列堆积、下一行动方无法 `getControl`。
   */
  drainDomainEvents(): TexasDomainEvent[] {
    return this.controller.drainHandEvents()
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
   * 分配角色并缓冲 `RolesAssigned`（与本手同一 `handId`，经 {@link Controller.prepareHandTape}）。
   * - **`initial`**：仅 `Room.initialRoles`（荷官 `setButton` + `setOthers`，定庄 + 锁座）；**不**再调 {@link reArrangeRoles}。
   *   若传入 `options.buttonUserId`，则 `Room.initialRoles(该玩家)`，**不再**随机定庄（与先 `dealer.setButton` 再本方法且省略 options 的旧写法等价）。
   * - **`rearrange`**：仅 {@link reArrangeRoles}（须已有庄位）；按人数表重算 SB/BB/UTG…（忽略 `options.buttonUserId`）。
   * **移庄**：请局末在 `reset()` 解锁后显式 {@link rotateRolesForNewHand}，不再通过本方法 `rotate` 分支。
   * 不在此校验「全员 ≥ 大盲」；短码上桌见 {@link assertSeatedPlayersMeetBigBlind}（已废弃，仅业务自选）。
   */
  setPlayerRoles(
    type: 'initial' | 'rearrange' = 'initial',
    options?: Readonly<{ buttonUserId?: number }>
  ): TexasDomainEvent[] {
    if (type === 'initial') {
      let buttonPlayer: Player | undefined
      if (options?.buttonUserId != null) {
        buttonPlayer = this.room.getPlayerById(options.buttonUserId)
        if (!buttonPlayer) {
          this.fail(
            new TexasError(
              TexasCoreErrorCode.SESSION_DISPATCH_PLAYER_NOT_FOUND,
              {
                playerId: options.buttonUserId
              }
            )
          )
        }
      }
      this.room.initialRoles(buttonPlayer)
    } else {
      this.reArrangeRoles()
    }
    const players = this.dealer
      .getPlayersByActionSequence()
      .map((p, index) => ({
        userId: p.getUserInfo().id,
        name: p.getUserInfo().name,
        role: p.getRole()!,
        actionIndex: index
      }))
    this.controller.prepareHandTape()
    this.controller.recordRolesAssigned(players)
    return this.drainDomainEvents()
  }

  /**
   * 按当前庄位与环上人数重算 SB/BB/UTG…（委托 {@link Dealer.reArrangeRoles}）。
   * `Dealer.join` / `remove` 在环变化后**已**各自调用一次；业务可在批量 `seat`/`remove` 后再调本方法，与最后一次入/离座效果一致，便于**统一向客户端推送角色**（本方法**不**写入 `RolesAssigned` 会话事件，需自行读 `dealer` / `setPlayerRoles` 式快照）。
   */
  reArrangeRoles(): void {
    this.dealer.reArrangeRoles()
  }

  /**
   * 局末/局间**移庄**（委托 {@link Room.rotateRoles} → `Dealer.rotateRolesForNewHand`），**不**改变 `Room.status`。
   * 须在 **`Texas.reset()` 等已 `unlockSeats`**、`Room.status === 'seats_open'` 时调用；下一手开盘前由业务再 {@link lockSeats}。
   */
  rotateRolesForNewHand(): void {
    this.room.rotateRoles()
  }

  /** 发手牌并缓冲 `HoleCardsDealt`（与本手同一 `handId`；若尚未 `setPlayerRoles` 则会先 `prepareHandTape`）。 */
  dealCards(): TexasDomainEvent[] {
    this.controller.prepareHandTape()
    this.dealer.dealCards()
    const byUserId: Record<number, Poke[]> = {}
    for (const p of this.dealer.players) {
      byUserId[p.getUserInfo().id] = p.getHandPokes()
    }
    this.controller.recordHoleCardsDealt(byUserId)
    return this.drainDomainEvents()
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
  start(): TexasDomainEvent[] {
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
    return this.drainDomainEvents()
  }

  /** 强制结束本手到 `between_hands`；状态校验由 {@link Controller.end} 负责（非 `in_hand` 时 `CTRL_END_NOT_IN_HAND`）。 */
  end(): TexasDomainEvent[] {
    this.controller.end()
    return this.drainDomainEvents()
  }

  /** 中央池分配给赢家并缓冲 `PotAwarded`（通常在解释 `HandEnded` 时调用）。 */
  settle(): TexasDomainEvent[] {
    const potTotal = this.pool.totalAmount
    this.pool.pay()
    const allocations = Array.from(this.pool.bills.entries()).map(
      ([userId, amount]) => ({ userId, amount })
    )
    this.controller.recordPotAwarded(potTotal, allocations)
    return this.drainDomainEvents()
  }

  /** 委托 {@link Controller.flushPendingTurnHandoff}；队头非 `turn_handoff` 时 Controller 侧静默 no-op。 */
  flushPendingTurnHandoff(): TexasDomainEvent[] {
    this.controller.flushPendingTurnHandoff()
    return this.drainDomainEvents()
  }

  /** 流程队列快照（对象化 `stage_advance` / `turn_handoff`），不改变状态。 */
  getPendingFlowOps(): PendingFlowOp[] {
    return this.controller.getPendingFlowOps()
  }

  /** 委托 {@link Controller.applyPendingStageAdvance}；队头错误时抛 `CTRL_FLOW_PENDING_MISMATCH`。 */
  applyPendingStageAdvance(): TexasDomainEvent[] {
    this.controller.applyPendingStageAdvance()
    return this.drainDomainEvents()
  }

  /** 委托 {@link Controller.drainPendingFlowOpsSync}；无 sleep，直至队列为空。 */
  flushAllPendingFlowOps(): TexasDomainEvent[] {
    this.controller.drainPendingFlowOpsSync()
    return this.drainDomainEvents()
  }

  /**
   * 当前是否可对 `userId` 下发 `{ type: 'FoldDueToLeave', playerId: userId }` 并成功改变牌局
   *（不落账、不抛错）。仅当前行动方可离场弃牌；非 `in_hand`（含暂停）为 `false`。
   * 还须 {@link Player.getAllowedActions} 含 `FOLD`（与 `executeFold` 一致）。
   */
  canFoldDueToLeave(userId: number): boolean {
    const actor = this.dealer.players.find((p) => p.getUserInfo().id === userId)
    if (!actor) return false
    if (this.room.getPlayerSeatStatus(actor) !== 'on-set') return false
    if (this.controller.status !== 'in_hand') return false

    const st = actor.getStatus()
    if (st === 'out' || st === 'allIn') return false
    // 防御性校验：仅 `eligible` 可离场
    if (st !== 'eligible') return false

    if (this.controller.activePlayer !== actor) return false
    return actor.getAllowedActions().includes(ActionTypeEnum.FOLD)
  }

  /**
   * 统一指令入口：经 `handBettingActions` 落账并触发 `transferControl` 链。
   * 调用后须 **drain 领域事件** 并按产品节拍 **消费 `pendingFlowOps`**；自愿行动前须先消费队头 handoff，
   * 否则 `activePlayer === null` 会被 {@link Player.checkIfCanAct} 拒绝（防 HTTP 抢跑）。
   * 超时：`FoldDueToTimeout` / `CheckDueToTimeout`（须为当前行动方；`setPendingTurnEndedReason('timeout')` + 跳过思考权门闩）。
   * 离场：`FoldDueToLeave`（仅当前行动方；`TurnEnded.reason` 为 `leave`）；可先 {@link canFoldDueToLeave}。
   * 入座大盲：`PostBigBlind`（见 {@link Controller.postBigBlindForJoiningPlayer}）。
   */
  dispatchCommand(cmd: TableCommand): TexasDomainEvent[] {
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
      case 'FoldDueToLeave':
        this.controller.setPendingTurnEndedReason('leave')
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
      case 'PostBigBlind':
        this.controller.postBigBlindForJoiningPlayer(actor)
        break
      default: {
        const _exhaustive: never = cmd
        return _exhaustive
      }
    }
    return this.drainDomainEvents()
  }

  /**
   * 清理奖池、荷官与本手控制器状态；并将房间 {@link Room.unlockSeats}，
   * 以便局间可 `seat` / `watch` / `remove`，并可按需 {@link rotateRolesForNewHand}、`reArrangeRoles`；下一手 `start()` 前须再由业务 {@link lockSeats}。
   */
  reset() {
    this.pool.reset()
    this.controller.reset()
    this.dealer.reset()
    this.room.unlockSeats()
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
