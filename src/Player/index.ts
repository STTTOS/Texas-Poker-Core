import type {
  PreAction,
  GameComponent,
  TexasErrorCallback
} from '@/gameContracts'

import Pool from '@/Pool'
import Dealer from '@/Dealer'
import Controller from '@/Controller'
import { getRandomInt } from '@/utils'
import { defaultThinkingTime } from '@/config'
import { StageEnum } from '@/Controller/stage'
import { PlayerTurnTiming } from './turnTiming'
import { resolveAllowedActions } from './allowedActions'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { Poke, RankCategory, RankSignature } from '../Deck/constant'
import { roleMap, RoleEnum, type Role, ActionTypeEnum } from './constant'

export { ActionTypeEnum }

// 玩家的状态
type PlayerStatus =
  // 全押
  | 'allIn'
  // 轮到该玩家的回合
  | 'active'
  // 非玩家回合的状态
  | 'waiting'
  // 弃牌出局
  | 'out'
export type OnlineStatus = 'online' | 'offline'
export type Action = {
  type: ActionType
  payload?: {
    value: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}
// 玩家回合时采取的行动（使用枚举值作为类型）
export type ActionType = ActionTypeEnum

export interface User {
  id: number
  /**
   * 昵称
   */
  name: string
}
export type CallbackOfAction = (
  player: Player,
  isPreFlop?: boolean
) => Promise<void>
export type { Role } from './constant'
export { RoleEnum } from './constant'

/**
 * 玩家
 */
export class Player implements GameComponent {
  /**
   * 玩家当前所处的位置
   */
  #role?: Role
  /**
   * 用户信息
   */
  #userInfo: Pick<User, 'id' | 'name'>
  #pool: Pool
  #dealer: Dealer
  #controller: Controller
  #onlineStatus: OnlineStatus = 'online'
  /**
   * 积分
   */
  #balance = 0
  #status: PlayerStatus = 'waiting'
  /**
   * 默认的思考时间为30s
   */
  #thinkingTime: number
  #action?: Action
  /**
   * 最小下注金额
   */
  #lowestBetAmount: number
  /**
   * 当前阶段的下注总额, 全押筹码不够时可以小于此金额
   */
  #currentStageTotalAmount = 0
  /**
   * 对局总下注额度
   */
  #totalBetAmount = 0
  /**
   * 输赢情况
   */
  #wager = 0
  /**
   * 指针指向上一个玩家, 庄家位的`lastPlayer`为`null`
   */
  #lastPlayer: Player | null = null
  #nextPlayer: Player | null = null

  #turnTiming: PlayerTurnTiming
  /**
   * 思考倒计时归零时的策略（缺省：引擎 `takeDefaultAction`）
   */
  #onThinkingDeadline: (player: Player) => void | Promise<void>
  /**
   * 轮到离线玩家行动时的策略（缺省：1s 后 `takeDefaultAction`）
   */
  #onOfflineTurnStart: (player: Player) => void
  /**
   * 玩家的手牌（2 张）
   */
  #handPokes: Poke[] = []
  /**
   * 与公共牌组合后的最佳五张牌（best 5-card combination）
   */
  #bestFiveCards?: Poke[]
  #rankSignature?: RankSignature
  #rankStrength = 0
  #rankCategory?: RankCategory
  #callback?: (params: PreAction) => void
  /**
   * 用户采取行动
   */
  #callbackOfAction?: CallbackOfAction
  fail: TexasErrorCallback = (error) => {
    throw error
  }

  constructor(options: {
    user: Pick<User, 'id' | 'name'>
    /** 起始筹码，写入 #balance */
    initialChips?: number
    role?: Role
    pool: Pool
    dealer: Dealer
    isOwner?: boolean
    handPokes?: Poke[]
    thinkingTime?: number
    controller: Controller
    lowestBetAmount: number
    lastPlayer?: Player | null
    nextPlayer?: Player | null
    fail?: TexasErrorCallback
    /** 超时/离线时的默认行动策略；不传则保持原有引擎默认行为 */
    actionPolicy?: {
      onThinkingDeadline?: (player: Player) => void
      onOfflineTurnStart?: (player: Player) => void
    }
  }) {
    const {
      lowestBetAmount,
      user,
      lastPlayer = null,
      nextPlayer = null,
      controller,
      dealer,
      pool,
      initialChips = 100,
      thinkingTime = defaultThinkingTime,
      fail,
      actionPolicy
    } = options
    this.#balance = initialChips

    this.#pool = pool
    this.#dealer = dealer
    this.#userInfo = user
    this.#controller = controller
    if (fail) this.fail = fail
    this.#lastPlayer = lastPlayer
    this.#nextPlayer = nextPlayer
    this.#thinkingTime = thinkingTime
    this.#lowestBetAmount = lowestBetAmount
    this.#turnTiming = new PlayerTurnTiming(this.#thinkingTime, () =>
      this.#onThinkingDeadline(this)
    )
    this.#onThinkingDeadline =
      actionPolicy?.onThinkingDeadline ??
      ((player) => {
        void player.takeDefaultAction()
      })
    this.#onOfflineTurnStart =
      actionPolicy?.onOfflineTurnStart ?? (() => void 0)
  }
  get balance() {
    return this.#balance
  }
  set balance(value: number) {
    if (TexasEngineContext.simulation().ignoreBalanceSetter) return
    this.#balance = value
  }

  get currentStageTotalAmount() {
    return this.#currentStageTotalAmount
  }
  set currentStageTotalAmount(value: number) {
    this.#currentStageTotalAmount = value
  }
  get totalBetAmount() {
    return this.#totalBetAmount
  }
  set totalBetAmount(value: number) {
    this.#totalBetAmount = value
  }
  get wager() {
    return this.#wager
  }
  set wager(value: number) {
    this.#wager = value
  }
  get id() {
    return this.#userInfo.id
  }

  get lowestBetAmount() {
    return this.#lowestBetAmount
  }
  get thinkingTime() {
    return this.#thinkingTime
  }
  /**
   * 翻牌前大盲的「选项」: 已下大盲且无人加注, 轮到大盲选择过牌/加注/弃牌(无需再跟注)
   */
  #isBigBlindOptionInPreFlop(): boolean {
    return (
      this.#controller.stage === StageEnum.PRE_FLOP &&
      this.#role === RoleEnum.BB &&
      this.#currentStageTotalAmount >= this.getMaxBetAmountAtCurrentStage()
    )
  }

  /**
   * @description 获取玩家允许的行动列表
   * 防止预期外的行为
   */
  #getAllowedActions(): Array<ActionType> {
    let maxOthersStageBet = 0
    this.#dealer.forEach((p) => {
      if (p !== this && p.#currentStageTotalAmount > maxOthersStageBet) {
        maxOthersStageBet = p.#currentStageTotalAmount
      }
    })
    return resolveAllowedActions({
      selfStatus: this.#status,
      selfBalance: this.balance,
      selfCurrentStageTotal: this.#currentStageTotalAmount,
      dealerActionHistory: this.#dealer.actionHistory,
      maxOthersStageBet,
      isBigBlindPreFlopOption: this.#isBigBlindOptionInPreFlop()
    })
  }

  /**
   * @description 获取剩余的行动思考时间
   */
  getRemainThinkTime() {
    return this.#thinkingTime - this.#turnTiming.countDownTime
  }

  get bestFiveCards(): Poke[] | undefined {
    return this.#bestFiveCards
  }

  set bestFiveCards(value: Poke[] | undefined) {
    this.#bestFiveCards = value
  }

  setNextPlayer(player: Player | null) {
    this.#nextPlayer = player
  }
  get rankSignature(): RankSignature | undefined {
    return this.#rankSignature
  }
  set rankSignature(value: RankSignature) {
    this.#rankSignature = value
    this.#rankCategory = value[0] as RankCategory
  }
  get rankCategory(): RankCategory | undefined {
    return this.#rankCategory
  }
  set rankCategory(value: RankCategory | undefined) {
    this.#rankCategory = value
  }

  getNextPlayer() {
    return this.#nextPlayer
  }

  getLastPlayer() {
    return this.#lastPlayer
  }
  setLastPlayer(player: Player | null) {
    this.#lastPlayer = player
  }

  setStatus(status: PlayerStatus) {
    this.#status = status
  }

  getStatus() {
    return this.#status
  }
  get onlineStatus() {
    return this.#onlineStatus
  }
  set onlineStatus(value: OnlineStatus) {
    this.#onlineStatus = value
  }

  set rankStrength(value: number) {
    this.#rankStrength = value
  }
  get rankStrength() {
    return this.#rankStrength
  }
  onPreAction(callback: (params: PreAction) => void) {
    this.#callback = callback
  }

  reset() {
    this.resetAction()
    this.resetCurrentStageTotalAmount()

    this.#totalBetAmount = 0
    this.#handPokes = []
    this.#bestFiveCards = undefined
    this.#rankStrength = 0
    this.#rankSignature = undefined
    this.#rankCategory = undefined
    this.#status = 'waiting'
    this.#wager = 0

    if (TexasEngineContext.simulation().restoreBalanceOnPlayerReset) {
      this.balance = this.#balance
    }

    this.clearTimer()
  }

  setRole(role: Role) {
    this.#role = role
  }

  async check() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes(ActionTypeEnum.CHECK))
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CHECK))

    this.#action = {
      type: ActionTypeEnum.CHECK
    }
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'check',
      data: { userId: this.#userInfo.id, name: this.#userInfo.name }
    })
    await this.transferControl()
  }

  async fold() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes(ActionTypeEnum.FOLD))
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_FOLD))

    this.#action = {
      type: ActionTypeEnum.FOLD
    }
    this.#status = 'out'
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'fold',
      data: { userId: this.#userInfo.id, name: this.#userInfo.name }
    })
    await this.transferControl()
  }

  async bet(money: number, preFlopDefaultAction = false) {
    if (preFlopDefaultAction === false) this.checkIfCanAct()

    if (
      !this.#getAllowedActions().includes(ActionTypeEnum.BET) &&
      !preFlopDefaultAction
    )
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_BET))

    if (money > this.balance) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE, {
          money,
          balance: this.balance
        })
      )
    }
    if (money < this.#lowestBetAmount && !preFlopDefaultAction) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_BET_BELOW_BB, {
          money,
          lowestBetAmount: this.#lowestBetAmount
        })
      )
    }
    if (money === this.balance) {
      return this.allIn()
    }
    this.#action = {
      type: ActionTypeEnum.BET,
      payload: {
        value: money
      }
    }

    this.#pool.add(this, money)
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'bet',
      data: {
        userId: this.#userInfo.id,
        name: this.#userInfo.name,
        money,
        balance: this.balance
      }
    })
    this.#dealer.addAction(this)

    await this.#callbackOfAction?.(this, preFlopDefaultAction)
    if (!preFlopDefaultAction) await this.transferControl()
    return money
  }

  async raise(money: number) {
    this.checkIfCanAct()
    // 当前轮的最多下注额
    const maxBetAmount = Math.max(
      ...this.#dealer
        .filter((p) => p !== this)
        .map((p) => p.#currentStageTotalAmount)
    )

    if (!this.#getAllowedActions().includes(ActionTypeEnum.RAISE))
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_RAISE))

    if (money > this.balance) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_RAISE_EXCEEDS_BALANCE, {
          money,
          balance: this.balance
        })
      )
    }
    if (money < this.#lowestBetAmount) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_RAISE_BELOW_BB, {
          money,
          lowestBetAmount: this.#lowestBetAmount
        })
      )
    }

    if (money + this.#currentStageTotalAmount <= maxBetAmount) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_RAISE_NOT_INCREASE, {
          maxBetAmount,
          attemptedTotal: money + this.#currentStageTotalAmount
        })
      )
    }
    if (money === this.balance) {
      return this.allIn()
    }

    this.#pool.add(this, money)
    this.#action = {
      type: ActionTypeEnum.RAISE,
      payload: {
        value: money
      }
    }

    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'raise',
      data: { userId: this.#userInfo.id, name: this.#userInfo.name, money }
    })

    await this.transferControl()
  }

  async call() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes(ActionTypeEnum.CALL))
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_CALL))

    // 其他玩家的最大下注金额
    const maxBetAmount = this.getOthersMaxBetAmountAtCurrentStage()
    const moneyShouldPay = maxBetAmount - this.#currentStageTotalAmount
    if (moneyShouldPay <= 0)
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_CALL_INVALID_STATE, {
          moneyShouldPay,
          balance: this.balance,
          maxBet: maxBetAmount
        })
      )
    if (moneyShouldPay > this.balance) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_CALL_EXCEEDS_BALANCE, {
          moneyShouldPay,
          balance: this.balance
        })
      )
    }
    if (moneyShouldPay === this.balance) {
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_CALL_SHOULD_ALL_IN)
      )
    }

    this.#action = {
      type: ActionTypeEnum.CALL,
      payload: {
        value: moneyShouldPay
      }
    }

    this.#pool.add(this, moneyShouldPay)
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)

    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'call',
      data: {
        userId: this.#userInfo.id,
        name: this.#userInfo.name,
        moneyShouldPay
      }
    })
    await this.transferControl()
  }

  async allIn() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes(ActionTypeEnum.ALL_IN)) {
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_CANNOT_ALL_IN))
    }

    // 其他玩家持有筹码的最大值, 全押金额不可超过该值
    // const maxAllInAmount = this.getMaxAllInAmount()
    // const moneyShouldPay = Math.min(
    //   Math.max(
    //     maxAllInAmount - this.#currentStageTotalAmount,
    //     this.#lowestBetAmount
    //   ),
    //   this.balance
    // )

    // fix: 允许玩家全押所有筹码, 多的进入边池就行
    const moneyShouldPay = this.balance
    if (moneyShouldPay <= 0)
      return this.fail(
        new TexasError(TexasCoreErrorCode.PLAYER_ALL_IN_INVALID, {
          moneyShouldPay,
          balance: this.balance
        })
      )
    this.#pool.add(this, moneyShouldPay)
    this.#action = {
      type: ActionTypeEnum.ALL_IN,
      payload: {
        value: moneyShouldPay
      }
    }

    this.#status = 'allIn'
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'all_in',
      data: {
        userId: this.#userInfo.id,
        name: this.#userInfo.name,
        moneyShouldPay,
        balance: this.balance
      }
    })
    await this.transferControl()
    return moneyShouldPay
  }

  /**
   * 获取其他玩家在当前阶段的最大下注额
   */
  getOthersMaxBetAmountAtCurrentStage() {
    return Math.max(
      ...this.getOtherPlayers().map((p) => p.#currentStageTotalAmount)
    )
  }

  /**
   *
   * @description 获取当前阶段的最大下注额
   */
  getMaxBetAmountAtCurrentStage() {
    return Math.max(
      ...this.#dealer.map((player) => player.#currentStageTotalAmount)
    )
  }

  /**
   * @description 获取其他玩家的最大下注能力
   * @returns
   */
  getMaxAllInAmount() {
    return Math.max(
      ...this.getOtherPlayers().map(
        (player) => player.balance + player.#currentStageTotalAmount
      )
    )
  }

  /**
   * @description 获取除自己外的其他玩家
   */
  getOtherPlayers() {
    return this.#dealer.filter((player) => player !== this)
  }

  /**
   * @description 调用此方法, 知道该玩家是否需要继续行动
   */
  actionable() {
    if (this.#status === 'allIn' || this.#status === 'out') return false

    if (!this.#action) return true

    // 翻牌前大盲具有最后行动权: 仅下过盲注视为未行动, 须给一次选择机会
    if (
      this.#isBigBlindOptionInPreFlop() &&
      this.#action.type === ActionTypeEnum.BET
    )
      return true

    // 当前的下注金额已经等于最大下注额
    return (
      this.#currentStageTotalAmount !== this.getMaxBetAmountAtCurrentStage()
    )
  }

  /**
   * @description 重置action, 需要在每一个新的阶段
   * 以及游戏结束后调用
   */
  resetAction() {
    this.#action = undefined
  }

  getAllowedActions() {
    return this.#getAllowedActions()
  }

  // 根据条件找到上一个满足条件的玩家
  returnLatestPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.getLastPlayer()
    while (current) {
      if (filter(current)) return current
      current = current.getLastPlayer()
    }
    return null
  }

  // 根据条件找到下一个满足条件的玩家
  returnNextPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.getNextPlayer()
    while (current) {
      if (filter(current)) return current
      current = current.getNextPlayer()
    }
    return null
  }

  getAction() {
    return this.#action
  }

  getRole() {
    return this.#role
  }
  getUserInfo() {
    return this.#userInfo
  }

  checkIfCanAct() {
    if (this.#controller.status !== 'in_hand')
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_NOT_IN_HAND))
    if (this.#status !== 'active')
      return this.fail(new TexasError(TexasCoreErrorCode.PLAYER_NO_CONTROL))
  }

  toString() {
    return `id: ${this.#userInfo.id}, role: ${roleMap.get(this.#role!)};name: ${
      this.#userInfo.name || this.#userInfo.id
    };balance: ${this.balance}`
  }
  log(prefix: string = '') {
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'log',
      data: { line: prefix + this.toString() }
    })
  }

  setHandPokes(pokes: Poke[]) {
    this.#handPokes = pokes
  }
  getHandPokes(): Poke[] {
    return this.#handPokes
  }

  earn(money: number) {
    this.#balance += money
    this.#wager = money - this.totalBetAmount

    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'earn',
      data: { userId: this.#userInfo.id, name: this.#userInfo.name, money }
    })
  }

  // 游戏推进到下个阶段后, 需要将此字段清空
  resetCurrentStageTotalAmount() {
    this.#currentStageTotalAmount = 0
  }

  clearTimer() {
    this.#turnTiming.clear()
  }

  onStatusChange() {}
  async transferControl() {
    this.clearTimer()
    this.removeControl()

    const shouldEndGame = this.#controller.tryToEndGame()
    if (shouldEndGame) {
      return
    }
    // 应该是先推送玩家采取了什么行动
    // 再推送Next-stage事件
    // 最后才触发onPreAction事件

    // 在移交控制权之前, 需要校验游戏是否该进入下个阶段
    const canAdvanceToNextStage =
      await this.#controller.tryToAdvanceGameToNextStage()
    if (canAdvanceToNextStage) return

    // 移交给下一个可以行动的玩家
    const nextPlayerToGetController = this.returnNextPlayerIf(
      (player) => player.getStatus() === 'waiting'
    )
    if (!nextPlayerToGetController)
      return this.fail(
        new TexasError(TexasCoreErrorCode.INTERNAL_NO_NEXT_PLAYER)
      )

    await this.#controller.transferControlTo(nextPlayerToGetController)
  }

  __testTakeAction() {
    const actions = this.#getAllowedActions()
    const index = getRandomInt(0, actions.length - 1)

    this[actions[index]](800)
  }
  async takeDefaultAction() {
    if (TexasEngineContext.simulation().randomPickOnDefaultAction) {
      this.__testTakeAction()
      return
    }
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'default_action',
      data: {
        userId: this.#userInfo.id,
        name: this.#userInfo.name,
        allowedActions: this.#getAllowedActions()
      }
    })
    if (this.#getAllowedActions().includes(ActionTypeEnum.CHECK)) {
      await this.check()
    } else {
      await this.fold()
    }
  }
  continue() {
    if (TexasEngineContext.simulation().immediateDefaultActionOnTurn) {
      void this.takeDefaultAction()
      return
    }
    // 如果当前玩家是离线状态, 延时一秒后直接采取默认行为
    // if (this.#onlineStatus === 'offline') {
    //   this.#onOfflineTurnStart(this)
    //   return
    // }
    this.#turnTiming.resumeCountdownIfNeeded()
  }
  onAction(callback: CallbackOfAction) {
    this.#callbackOfAction = callback
  }

  pause() {
    this.removeControl()
  }

  removeControl() {
    if (this.#status === 'active') {
      this.#status = 'waiting'
    }
    this.clearTimer()
  }

  /**
   * 行动前可下注区间：
   * - max：当前筹码（全下上限）
   * - min：补齐到「其他玩家本轮已下注」的最大值所需筹码；若无需补齐（≤0）则用 `lowestBetAmount`；最后与 max 取小，避免 min > 余额
   */
  getRestrict() {
    const max = this.balance

    let maxOthersStageTotal = 0
    this.#dealer.forEach((p) => {
      if (p !== this && p.#currentStageTotalAmount > maxOthersStageTotal) {
        maxOthersStageTotal = p.#currentStageTotalAmount
      }
    })

    const callGap = maxOthersStageTotal - this.#currentStageTotalAmount
    const rawMin = callGap > 0 ? callGap : this.#lowestBetAmount

    return {
      min: Math.min(rawMin, max),
      max
    }
  }

  getControl() {
    // 如果余额不够, 则只能下注剩余余额(all-in)
    // 最大值是好计算的
    // 最小值就是跟注的金额
    const allowedActions = this.#getAllowedActions()
    TexasEngineContext.emitTrace({
      channel: 'player',
      name: 'got_control',
      data: {
        userId: this.#userInfo.id,
        name: this.#userInfo.name,
        allowedActions
      }
    })
    // 行动前校验
    this.#callback?.({
      allowedActions,
      userId: this.#userInfo.id,
      restrict: this.getRestrict()
    })
    this.#status = 'active'

    this.continue()
  }
}

/** 在线状态与倒计时由引擎维护；具体「到时/离线」如何处理由此策略外置（缺省与历史行为一致） */
export type PlayerActionPolicy = {
  onThinkingDeadline?: (player: Player) => void | Promise<void>
  onOfflineTurnStart?: (player: Player) => void
}

export default Player
