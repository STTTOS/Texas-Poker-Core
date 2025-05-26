import Pool from '@/Pool'
import Dealer from '@/Dealer'
import { roleMap } from './constant'
import TexasError from '@/TexasError'
import Controller from '@/Controller'
import { getRandomInt } from '@/utils'
import { Poke } from '../Deck/constant'
import { defaultThinkingTime } from '@/config'
import { PreAction, GameComponent, TexasErrorCallback } from '@/Texas'

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
export type OnlineStatus = 'online' | 'offline' | 'quit'
export type Action = {
  type: ActionType
  payload?: {
    value: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}
// 玩家回合时采取的行动
export type ActionType =
  // 过牌
  | 'check'
  // 弃牌
  | 'fold'
  // 加注
  | 'raise'
  // 下注
  | 'bet'
  // 跟注
  | 'call'
  // 全押
  | 'allIn'

export interface User {
  id: number
  /**
   * 账户余额
   */
  balance: number
  /**
   * 昵称
   */
  name?: string
  /**
   * 用户头像
   */
  avatar?: string
}
export type CallbackOfAction = (
  player: Player,
  isPreFlop?: boolean
) => Promise<void>
export type Role =
  | 'button'
  | 'small-blind'
  | 'big-blind'
  | `under-the-gun${number | ''}`
  | `middle-position${number | ''}`
  | 'hi-jack'
  | 'cut-off'

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
  #userInfo: User
  #pool: Pool
  #dealer: Dealer
  #controller: Controller
  #onlineStatus: OnlineStatus = 'online'
  /**
   * 积分
   */
  // balance: number
  #status: PlayerStatus = 'waiting'
  /**
   * 默认的思考时间为30s
   */
  #thinkingTime: number
  /**
   * 计时器
   */
  #countDownTime: number
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
   * 指针指向上一个玩家, 庄家位的`lastPlayer`为`null`
   */
  #lastPlayer: Player | null = null
  #nextPlayer: Player | null = null

  #timer: NodeJS.Timeout | null = null
  /**
   * 玩家的手牌
   */
  #handPokes: Poke[] = []
  #presentation: string | undefined
  #callback?: (params: PreAction) => void
  /**
   * 用户采取行动
   */
  #callbackOfAction?: CallbackOfAction
  reportError: TexasErrorCallback

  constructor({
    lowestBetAmount,
    user,
    lastPlayer = null,
    nextPlayer = null,
    controller,
    dealer,
    pool,
    thinkingTime = defaultThinkingTime,
    reportError = (error) => {
      throw error
    }
  }: {
    user: User
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
    reportError?: TexasErrorCallback
  }) {
    if (user.balance < lowestBetAmount) {
      reportError(new TexasError(2003, '筹码小于大盲注, 不可参与游戏'))
    }
    this.#pool = pool
    this.#dealer = dealer
    this.#userInfo = user
    this.#controller = controller
    this.reportError = reportError
    this.#lastPlayer = lastPlayer
    this.#nextPlayer = nextPlayer
    this.#thinkingTime = thinkingTime
    this.#lowestBetAmount = lowestBetAmount
    this.#countDownTime = this.#thinkingTime
  }
  get balance() {
    return this.#userInfo.balance
  }
  set balance(value: number) {
    // 测试环境不改变真是余额
    if (process.env.PROJECT_ENV === 'dev') return
    this.#userInfo.balance = value
  }

  get currentStageTotalAmount() {
    return this.#currentStageTotalAmount
  }
  set currentStageTotalAmount(value: number) {
    this.#currentStageTotalAmount = value
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
   * @description 获取玩家允许的行动列表
   * 防止预期外的行为
   */
  #getAllowedActions(): Array<ActionType> {
    const helper = (lastPlayer?: Player | null): ActionType[] => {
      if (this.#status === 'allIn' || this.#status === 'out') return []

      // 当前阶段第一位非`fold`行动的玩家
      if (!lastPlayer || !lastPlayer.#action)
        return ['bet', 'allIn', 'fold', 'check']

      // 上个玩家弃牌了, 需要知道最近采取行动的玩家
      if (lastPlayer.#action?.type === 'fold') {
        const player = [...this.#dealer.actionHistory]
          .reverse()
          .find((player) => player.getStatus() !== 'out')
        return helper(player)
      }

      if (lastPlayer.#action.type === 'check')
        return ['allIn', 'bet', 'check', 'fold']

      // 前置all-in校验
      // 其他玩家的最大下注额
      const maxBetAmount = Math.max(
        ...this.#dealer!.filter((p) => p !== this).map(
          (player) => player.#currentStageTotalAmount
        )
      )
      if (this.balance + this.#currentStageTotalAmount <= maxBetAmount) {
        return ['allIn', 'fold']
      }

      if (lastPlayer.#action!.type === 'bet') {
        return ['call', 'raise', 'allIn', 'fold']
      }

      if (lastPlayer.#action?.type === 'raise') {
        return ['call', 'raise', 'allIn', 'fold']
      }

      if (lastPlayer.#action.type === 'allIn') {
        return ['call', 'raise', 'allIn', 'fold']
      }
      // 上个玩家的行为是: call
      return ['call', 'raise', 'fold', 'allIn']
    }
    const result = helper(
      this.#dealer.actionHistory[this.#dealer.actionHistory.length - 1]
    )
    return result
  }

  /**
   * @description 获取剩余的行动思考时间
   */
  getRemainThinkTime() {
    return this.#thinkingTime - this.#countDownTime
  }

  setNextPlayer(player: Player | null) {
    this.#nextPlayer = player
  }
  setPresentation(presentation: string) {
    this.#presentation = presentation
  }
  getPresentation() {
    return this.#presentation
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

  onPreAction(callback: (params: PreAction) => void) {
    this.#callback = callback
  }

  reset() {
    this.resetAction()
    this.resetCurrentStageTotalAmount()
    this.#handPokes = []
    this.#presentation = undefined
    this.#status = 'waiting'

    if (process.env.PROJECT_ENV === 'dev') this.balance = this.#userInfo.balance

    this.clearTimer()
  }

  setRole(role: Role) {
    this.#role = role
  }

  async check() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('check'))
      this.reportError(new TexasError(2003, '不可过牌'))

    this.#action = {
      type: 'check'
    }
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    console.log(this.#userInfo.name, '过牌')
    this.transferControl()
  }

  async fold() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('fold'))
      this.reportError(new TexasError(2003, '不可弃牌'))

    this.#action = {
      type: 'fold'
    }
    this.#status = 'out'
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    console.log(this.#userInfo.name, '弃牌')
    this.transferControl()
  }

  async bet(money: number, preFlopDefaultAction = false) {
    if (preFlopDefaultAction === false) this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('bet') && !preFlopDefaultAction)
      this.reportError(new TexasError(2003, '不可下注'))

    if (money > this.balance) {
      this.reportError(new TexasError(2003, '下注金额不可大于筹码总数'))
    }
    if (money < this.#lowestBetAmount && !preFlopDefaultAction) {
      this.reportError(new TexasError(2003, '下注金额不可小于大盲注'))
    }
    this.#action = {
      type: 'bet',
      payload: {
        value: money
      }
    }

    this.#pool.add(this, money)
    console.log(
      this.#userInfo.name,
      '下注金额:',
      money,
      '剩余筹码:',
      this.balance
    )
    this.#dealer.addAction(this)

    await this.#callbackOfAction?.(this, preFlopDefaultAction)
    if (!preFlopDefaultAction) this.transferControl()
    return money
  }

  async raise(money: number) {
    this.checkIfCanAct()
    const maxBetAmount = Math.max(
      ...this.#dealer
        .filter((p) => p !== this)
        .map((p) => p.#currentStageTotalAmount)
    )

    if (!this.#getAllowedActions().includes('raise'))
      this.reportError(new TexasError(2003, '不可加注'))

    if (money > this.balance) {
      this.reportError(new TexasError(2003, '加注金额不可大于余额'))
    }
    if (money < this.#lowestBetAmount) {
      this.reportError(new TexasError(2003, '加注金额不可小于大盲注'))
    }

    if (money + this.#currentStageTotalAmount <= maxBetAmount) {
      if (process.env.PROJECT_ENV === 'prd')
        this.reportError(new TexasError(2003, '必须加注更多的金额'))
      else await this.call()
    }

    this.#pool.add(this, money)
    this.#action = {
      type: 'raise',
      payload: {
        value: money
      }
    }

    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    console.log(this.#userInfo.name, '加注', money)

    this.transferControl()
  }

  async call() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('call'))
      this.reportError(new TexasError(2003, '不可跟注'))

    // 其他玩家的最大下注金额
    const maxBetAmount = this.getOthersMaxBetAmountAtCurrentStage()
    const moneyShouldPay = maxBetAmount - this.#currentStageTotalAmount
    if (moneyShouldPay <= 0)
      this.reportError(
        new TexasError(
          2003,
          `数据异常, 请手动下注, try to call: ${moneyShouldPay}, balance: ${this.balance}, maxBet: ${maxBetAmount}`
        )
      )
    if (moneyShouldPay > this.balance) {
      this.reportError(new TexasError(2003, '跟注金额不可大于筹码总数'))
    }
    this.#action = {
      type: 'call',
      payload: {
        value: moneyShouldPay
      }
    }

    this.#pool.add(this, moneyShouldPay)
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)

    console.log(this.#userInfo.name, '跟注:', moneyShouldPay)
    this.transferControl()
  }

  async allIn() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('allIn')) {
      this.reportError(new TexasError(2003, '不可全押'))
    }

    // 其他玩家持有筹码的最大值, 全押金额不可超过该值
    const maxAllInAmount = this.getMaxAllInAmount()
    const moneyShouldPay = Math.min(
      Math.max(
        maxAllInAmount - this.#currentStageTotalAmount,
        this.#lowestBetAmount
      ),
      this.balance
    )

    if (moneyShouldPay <= 0)
      this.reportError(
        new TexasError(
          2003,
          `数据异常,请手动下注, try to allIn: ${moneyShouldPay}; balance: ${this.balance}`
        )
      )

    this.#pool.add(this, moneyShouldPay)
    this.#action = {
      type: 'allIn',
      payload: {
        value: moneyShouldPay
      }
    }

    this.#status = 'allIn'
    this.#dealer.addAction(this)
    await this.#callbackOfAction?.(this)
    console.log(
      this.#userInfo.name,
      '全押:',
      moneyShouldPay,
      '剩余筹码: ',
      this.balance
    )
    this.transferControl()
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
    if (this.#controller.status !== 'on')
      this.reportError(new TexasError(2003, '游戏不在进行中, 不可行动'))
    if (this.#status !== 'active')
      this.reportError(new TexasError(2003, '没有控制权, 无法行动'))
  }

  toString() {
    return `id: ${this.#userInfo.id}, role: ${roleMap.get(this.#role!)};name: ${
      this.#userInfo.name || this.#userInfo.id
    };balance: ${this.balance}`
  }
  log(prefix: string = '') {
    console.log(prefix + this.toString())
  }

  setHandPokes(pokes: Poke[]) {
    this.#handPokes = pokes
  }
  getHandPokes(): Poke[] {
    return this.#handPokes
  }

  earn(money: number) {
    this.balance += money

    console.log(this.#userInfo.name, '分得奖池金额:', money)
  }

  // 游戏推进到下个阶段后, 需要将此字段清空
  resetCurrentStageTotalAmount() {
    this.#currentStageTotalAmount = 0
  }

  clearTimer() {
    if (this.#timer) {
      clearInterval(this.#timer)
      this.#timer = null
      this.#countDownTime = this.#thinkingTime
    }
  }

  onStatusChange() {}
  transferControl() {
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
    const canAdvanceToNextStage = this.#controller.tryToAdvanceGameToNextStage()
    if (canAdvanceToNextStage) return

    // 移交给下一个可以行动的玩家
    const nextPlayerToGetController = this.returnNextPlayerIf(
      (player) => player.getStatus() === 'waiting'
    )
    if (!nextPlayerToGetController)
      this.reportError(
        new TexasError(2000, '游戏发生异常, 将控制权移交给不存在的玩家')
      )

    this.#controller.transferControlTo(nextPlayerToGetController)
  }

  __testTakeAction() {
    const actions = this.#getAllowedActions()
    const index = getRandomInt(0, actions.length - 1)

    this[actions[index]](800)
  }
  takeDefaultAction() {
    if (process.env.PROJECT_ENV === 'dev') {
      this.__testTakeAction()
      return
    }
    console.log(
      this.#userInfo.name,
      '超时默认行动(allowedActions):',
      this.#getAllowedActions()
    )
    if (this.#getAllowedActions().includes('check')) {
      this.check()
    } else {
      this.fold()
    }
  }
  continue() {
    if (process.env.PROJECT_ENV === 'dev') {
      this.takeDefaultAction()
      return
    }
    // 如果当前玩家是离线状态, 延时一秒后直接采取默认行为
    if (this.#onlineStatus === 'offline') {
      setTimeout(() => {
        this.takeDefaultAction()
      }, 1000)
      return
    }
    if (!this.#timer)
      this.#timer = setInterval(() => {
        if (this.#countDownTime === 0 && this.#timer) {
          this.takeDefaultAction()
          return
        }
        this.#countDownTime--
      }, 1000)
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
   * @description 获取行动前的min~max 下注金额范围
   */
  getRestrict() {
    const max = Math.min(
      this.getMaxAllInAmount() - this.#currentStageTotalAmount,
      this.balance
    )

    // 计算出跟注的金额
    const moneyShouldCall =
      this.getOthersMaxBetAmountAtCurrentStage() - this.#currentStageTotalAmount
    // 如果跟注金额小于0, 则使用盲注金额
    const min =
      moneyShouldCall <= 0
        ? Math.min(this.#lowestBetAmount, this.balance)
        : moneyShouldCall
    return {
      min,
      max
    }
  }

  getControl() {
    // 如果余额不够, 则只能下注剩余余额(all-in)
    // 最大值是好计算的
    // 最小值就是跟注的金额
    const allowedActions = this.#getAllowedActions()
    console.log(
      this.#userInfo.name,
      '获得控制权, 允许的行动列表: ',
      allowedActions
    )
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
export default Player
