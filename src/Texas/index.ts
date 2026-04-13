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
  maximumCountOfPlayers: number
  initialChips: number
  user: User
  thinkingTime?: number
}

export type { TexasDomainEvent, HandDomainEvent, SessionDomainEvent }
export type { TableCommand } from '@/domain/tableCommand'

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
      controller,
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
   * 业务层解释器消费此列表做持久化 / WS / 节奏；Core 内不执行副作用。
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

  #assertDealerPlayersMeetBigBlind() {
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

  setPlayerRoles(type: 'initial' | 'rotate' = 'initial') {
    this.#assertDealerPlayersMeetBigBlind()

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

  unlockSeats() {
    this.room.unlockSeats()
  }

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

  end() {
    if (this.controller.status === 'idle')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_END_NOT_STARTED))

    this.controller.end()
  }

  settle() {
    const potTotal = this.pool.totalAmount
    this.pool.pay()
    const allocations = Array.from(this.pool.bills.entries()).map(
      ([userId, amount]) => ({ userId, amount })
    )
    this.controller.recordPotAwarded(potTotal, allocations)
  }

  /** 队列头为 `turn_handoff` 时消费并发出 `TurnOffered`。 */
  flushPendingTurnHandoff(): void {
    this.controller.flushPendingTurnHandoff()
  }

  /** 窥视当前待消费的流程队列（拷贝）。 */
  getPendingFlowOps(): PendingFlowOpKind[] {
    return this.controller.getPendingFlowOps()
  }

  /** 消费队列头的一项 `stage_advance`（进街一步或跑马路一步）。 */
  applyPendingStageAdvance(): void {
    this.controller.applyPendingStageAdvance()
  }

  /** 无节拍排空流程队列（单测、批处理脚本用）。 */
  flushAllPendingFlowOps(): void {
    this.controller.drainPendingFlowOpsSync()
  }

  /**
   * 统一指令入口（阶段 5）：规则执行经 `handBettingActions`，不直接依赖 `Player#fold` 等公开方法。
   * 行动合法性由 `checkIfCanAct` 等校验（含 `activePlayer` / `in_hand` / 座位 `active`）。
   * 超时：弃牌用 `FoldDueToTimeout`，可过牌时用 `CheckDueToTimeout`（均先 `setPendingTurnEndedReason('timeout')`）。
   */
  async dispatchCommand(cmd: TableCommand): Promise<void> {
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

    switch (cmd.type) {
      case 'Fold':
        await executeFold(actor)
        break
      case 'FoldDueToTimeout':
        this.controller.setPendingTurnEndedReason('timeout')
        await executeFold(actor)
        break
      case 'CheckDueToTimeout':
        this.controller.setPendingTurnEndedReason('timeout')
        await executeCheck(actor)
        break
      case 'Check':
        await executeCheck(actor)
        break
      case 'Call':
        await executeCall(actor)
        break
      case 'Bet':
        await executeBet(actor, cmd.amount)
        break
      case 'Raise':
        await executeRaise(actor, cmd.additionalAmount)
        break
      case 'AllIn':
        await executeAllIn(actor)
        break
      default: {
        const _exhaustive: never = cmd
        return _exhaustive
      }
    }
  }

  reset() {
    this.pool.reset()
    this.controller.reset()
    this.dealer.reset()
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
