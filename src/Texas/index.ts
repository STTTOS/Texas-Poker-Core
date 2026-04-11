import type { Poke } from '@/Deck/constant'
import type { PreAction } from '@/gameContracts'

import Pool from '@/Pool'
import Room from '@/Room'
import Dealer from '@/Dealer'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import Player, { User, Role, CallbackOfAction } from '@/Player'
import {
  TexasEngineContext,
  type TexasEngineGlobalOptions
} from '@/TexasEngineContext'
import Controller, {
  CallbackOfGameEnd,
  CallbackOnNextStage,
  type TexasTurnPacingHooks
} from '@/Controller'

// 在表单中填入一些基本的信息
// 比如大盲注
// 最大玩家数量
/** 当前引擎角色表最多支持 10 人桌；更大人数需扩展 playerRoleSetMap */
const SUPPORTED_MAX_TABLE_PLAYERS = 10

export interface CreateRoomInputArgs {
  lowestBetAmount: number
  /** 单桌最大入座人数（不超过引擎支持上限） */
  maximumCountOfPlayers: number
  /** 入座玩家起始筹码 */
  initialChips: number
  // 需要传入用户信息, 在创建房间时同时指定房主
  user: User
  // 玩家的思考时间, 单位: s
  thinkingTime?: number
  /**
   * 与业务层节奏对齐：在 core 固定时点 `await`，宜在钩子内 `sleep` 或发 WS。
   * 勿在 `onPreAction` / `onNextStage` 再叠一层相同时长的定时推送。
   */
  beforeStageAdvance?: TexasTurnPacingHooks['beforeStageAdvance']
  beforeNextPlayerTurn?: TexasTurnPacingHooks['beforeNextPlayerTurn']
}
export type { PreAction } from '@/gameContracts'

export type RolesAssignedEvent = {
  players: Array<{
    userId: number
    name: string
    role: Role
    actionIndex: number
  }>
}

export type CardsDealtEvent = {
  players: Array<{ userId: number; name: string; handPokes: Poke[] }>
}

/** 会话级领域事件（与 `onRolesAssigned` / `onDealCards` / `onGameEnd` / `onNextStage` 同源数据，可多订阅） */
export type TexasEngineEvent =
  | { type: 'roles_assigned'; payload: RolesAssignedEvent }
  | { type: 'cards_dealt'; payload: CardsDealtEvent }
  | {
      type: 'hand_completed'
      payload: Parameters<CallbackOfGameEnd>[0]
    }
  | {
      type: 'stage_advanced'
      payload: Parameters<CallbackOnNextStage>[0]
    }

export type TexasEngineEventListener = (event: TexasEngineEvent) => void

export type { TexasErrorCallback, GameComponent } from '@/gameContracts'

class Texas {
  pool: Pool
  room: Room
  dealer: Dealer
  controller: Controller
  protected errorCallback?: (error: TexasError) => void
  protected rolesAssignedCallback?: (event: RolesAssignedEvent) => void
  protected cardsDealtCallback?: (event: CardsDealtEvent) => void
  #engineEventListeners = new Set<TexasEngineEventListener>()
  /** 标准 fail-fast 入口：先通知 onError，再 throw */
  fail: (error: TexasError) => never
  /** @deprecated 历史命名；等价于 fail */
  handleError: (error: TexasError) => never

  constructor({
    user,
    thinkingTime,
    lowestBetAmount,
    maximumCountOfPlayers,
    initialChips,
    beforeStageAdvance,
    beforeNextPlayerTurn
  }: CreateRoomInputArgs) {
    // 使用箭头函数, 防止this指向问题
    this.fail = (error: TexasError) => {
      this.errorCallback?.(error)
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
    const controller = new Controller(dealer, this.fail, {
      beforeStageAdvance,
      beforeNextPlayerTurn
    })
    const pool = new Pool(this.fail)
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

    this.controller.onGameEnd((payload) => {
      this.#emitEngineEvent({ type: 'hand_completed', payload })
    })
    this.controller.onNextStage((payload) => {
      this.#emitEngineEvent({ type: 'stage_advanced', payload })
    })
  }

  /** 统一领域事件（与 `onRolesAssigned` 等并存；适合日志/WS/多模块订阅） */
  subscribeEngineEvents(listener: TexasEngineEventListener): () => void {
    this.#engineEventListeners.add(listener)
    return () => {
      this.#engineEventListeners.delete(listener)
    }
  }

  #emitEngineEvent(event: TexasEngineEvent) {
    for (const listener of this.#engineEventListeners) {
      listener(event)
    }
  }

  onError(callback: (error: TexasError) => void) {
    this.errorCallback = callback
  }
  onRolesAssigned(callback: (event: RolesAssignedEvent) => void) {
    this.rolesAssignedCallback = callback
  }
  onDealCards(callback: (event: CardsDealtEvent) => void) {
    this.cardsDealtCallback = callback
  }

  onPreAction(callback: (params: PreAction) => void) {
    this.dealer.forEach((player) => {
      player.onPreAction(callback)
    })
  }
  onGameEnd(callback: CallbackOfGameEnd) {
    this.controller.onGameEnd(callback)
  }

  onNextStage(callback: CallbackOnNextStage) {
    this.controller.onNextStage(callback)
  }

  onGameStart(callback: () => Promise<void>) {
    this.controller.onGameStart(callback)
  }

  /**
   * 监听玩家采取行动
   */
  onAction(callback: CallbackOfAction) {
    this.dealer.forEach((player) => player.onAction(callback))
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

  /**
   * 设置玩家角色并锁定座位（原 ready）。
   * - `Room.initialRoles()` 会校验入座人数、并调用 `Dealer.initialRoles()`
   * - 成功后会触发 `onRolesAssigned` 事件
   */
  setPlayerRoles(type: 'initial' | 'rotate' = 'initial') {
    this.#assertDealerPlayersMeetBigBlind()

    if (type === 'initial') {
      this.room.initialRoles()
    } else {
      this.room.rotateRoles()
    }
    const rolesPayload = {
      players: this.dealer.getPlayersByActionSequence().map((p, index) => ({
        userId: p.getUserInfo().id,
        name: p.getUserInfo().name,
        role: p.getRole()!,
        actionIndex: index
      }))
    }
    this.rolesAssignedCallback?.(rolesPayload)
    this.#emitEngineEvent({ type: 'roles_assigned', payload: rolesPayload })
  }

  /**
   * 发牌（对外暴露给业务层）。
   * - 成功后会触发 `onDealCards` 事件
   */
  dealCards() {
    this.dealer.dealCards()
    const dealtPayload = {
      players: this.dealer.players.map((p) => ({
        userId: p.getUserInfo().id,
        name: p.getUserInfo().name,
        handPokes: p.getHandPokes()
      }))
    }
    this.cardsDealtCallback?.(dealtPayload)
    this.#emitEngineEvent({ type: 'cards_dealt', payload: dealtPayload })
  }
  unlockSeats() {
    this.room.unlockSeats()
  }
  async start() {
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

    await this.controller.start()
  }

  // 测试阶段方法, 手动结束游戏
  end() {
    if (this.controller.status === 'idle')
      this.fail(new TexasError(TexasCoreErrorCode.SESSION_END_NOT_STARTED))

    this.controller.end()
  }

  settle() {
    this.pool.pay()
  }

  reset() {
    this.pool.reset()
    this.controller.reset()
    this.dealer.reset()
  }

  /**
   *@description 在游戏开始时重置所有状态
   *目前没有考虑游戏异常结束的情况
   *所以需要在游戏开始时调用此方法去重置状态
   */
  resetBeforeGameStart() {
    this.reset()
  }

  // 获取默认下注行为
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

  /** 进程级配置（trace、仿真开关等），建议在应用启动时调用一次 */
  static configureEngine(patch: Partial<TexasEngineGlobalOptions>): void {
    TexasEngineContext.configure(patch)
  }

  static resetEngineContext(): void {
    TexasEngineContext.reset()
  }
}

export default Texas
