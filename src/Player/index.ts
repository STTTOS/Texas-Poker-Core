import Dealer from '@/Dealer'
import Controller from '@/Controller'
import { Poke } from '../Deck/constant'

// 玩家的状态
type PlayerStatus =
  // 全押
  | 'all-in'
  // 轮到该玩家的回合
  | 'active'
  // 非玩家回合的状态
  | 'waiting'
  // 弃牌出局
  | 'out'
type OnlineStatus = 'online' | 'offline'
interface ActionWithOutPayload {
  type: Extract<ActionType, 'check' | 'fold'>
}
interface ActionWithPayload {
  type: Exclude<ActionType, 'check' | 'fold'>
  payload: {
    value: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}
type Action = ActionWithOutPayload | ActionWithPayload
// 玩家回合时采取的行动
type ActionType =
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
  | 'all-in'

export interface User {
  id: number
  balance: number
}

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
export class Player {
  /**
   * 玩家当前所处的位置
   */
  #role?: Role
  #userInfo: User
  #controller: Controller
  #onlineStatus: OnlineStatus = 'online'
  /**
   * 积分
   */
  #balance: number
  #status: PlayerStatus = 'waiting'
  /**
   * 默认的思考时间为30s
   */
  #countDownTime = 30
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

  #isLast: boolean = false
  #timer: NodeJS.Timeout | null = null
  /**
   * 玩家的手牌
   */
  #handPokes: Poke[] = []
  #presentation: string | undefined

  constructor({
    lowestBetAmount,
    user,
    lastPlayer = null,
    nextPlayer = null,
    controller
  }: {
    lowestBetAmount: number
    role?: Role
    user: User
    lastPlayer?: Player | null
    nextPlayer?: Player | null
    handPokes?: Poke[]
    controller: Controller
  }) {
    if (user.balance < lowestBetAmount) {
      throw new Error('筹码小于大盲注, 不可参与游戏')
    }
    this.#balance = user.balance
    this.#lowestBetAmount = lowestBetAmount
    this.#userInfo = user
    this.#lastPlayer = lastPlayer
    this.#nextPlayer = nextPlayer

    this.#controller = controller
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
  // getIsLast() {
  //   return this.#isLast
  // }
  getLowestBetAmount() {
    return this.#lowestBetAmount
  }

  #changeActionStatus(action: Action) {
    this.#action = action
  }

  setStatus(status: PlayerStatus) {
    this.#status = status
  }
  setIsLast(value: boolean) {
    this.#isLast = value
  }
  getCurrentStageTotalAmount() {
    return this.#currentStageTotalAmount
  }
  getStatus() {
    return this.#status
  }
  getOnlineStatus() {
    return this.#onlineStatus
  }

  reset() {
    this.resetAction()
    this.resetCurrentStageTotalAmount()
    this.#handPokes = []
    this.#presentation = undefined
    this.clearTimer()
  }
  /**
   * @description 当前玩家采取的行动
   */
  takeAction(action: Action) {
    if (this.#status === 'all-in') {
      throw new Error('不可行动')
    }
    this.#action = action
  }
  setRole(role: Role) {
    this.#role = role
  }

  check() {
    if (!this.#getAllowedActions().includes('check'))
      throw new Error('不可过牌')

    this.#action = {
      type: 'check'
    }
    this.#status = 'waiting'
    this.transferControl()
  }

  fold() {
    if (!this.#getAllowedActions().includes('fold')) throw new Error('不可弃牌')

    this.#action = {
      type: 'fold'
    }
    this.#status = 'out'
    this.transferControl()
  }

  // TODO: 需调用api直接支付
  bet(money: number) {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('bet')) throw new Error('不可下注')

    if (money > this.#balance) {
      throw new Error('下注金额不可大于筹码总数')
    }
    if (money < this.#lowestBetAmount) {
      throw new Error('下注金额不可小于大盲注')
    }
    this.#action = {
      type: 'bet',
      payload: {
        value: money
      }
    }
    this.#balance -= money
    this.#currentStageTotalAmount += money
    this.#status = 'waiting'
    this.transferControl()
    console.log(
      this.getUserInfo().id,
      '下注金额:',
      money,
      '剩余筹码:',
      this.#balance
    )

    return money
  }

  // TODO: 需调用api直接支付
  raise(money: number, dealer: Dealer) {
    if (!this.#getAllowedActions(dealer).includes('raise'))
      throw new Error('不可加注')

    if (money > this.#balance) {
      throw new Error('加注金额不可大于筹码总数')
    }
    if (money < this.#lowestBetAmount) {
      throw new Error('加注金额不可小于大盲注')
    }

    const maxBetAmount = Math.max(
      ...dealer
        .filter((p) => p !== this)
        .map((p) => p.getCurrentStageTotalAmount())
    )
    if (money + this.#currentStageTotalAmount <= maxBetAmount) {
      throw Error('必须加注更多的金额')
    }
    this.#action = {
      type: 'raise',
      payload: {
        value: money
      }
    }
    this.#balance -= money
    this.#currentStageTotalAmount += money
    this.#status = 'waiting'

    this.transferControl()
  }

  // TODO: 需调用api直接支付
  call(dealer: Dealer) {
    this.checkIfCanAct()
    if (!this.#getAllowedActions(dealer).includes('call'))
      throw new Error('不可跟注')

    // 其他玩家的最大下注金额
    const maxBetAmount = Math.max(
      ...dealer
        .filter((p) => p !== this)
        .map((p) => p.getCurrentStageTotalAmount())
    )
    const moneyShouldPay = maxBetAmount - this.getCurrentStageTotalAmount()
    if (moneyShouldPay <= 0) throw new Error('数据异常, 请手动下注')
    if (moneyShouldPay > this.#balance) {
      throw new Error('跟注金额不可大于筹码总数')
    }
    console.log(this.#userInfo.id, '跟注', moneyShouldPay)
    this.#action = {
      type: 'call',
      payload: {
        value: moneyShouldPay
      }
    }
    this.#balance -= moneyShouldPay
    this.#currentStageTotalAmount += moneyShouldPay
    this.#status = 'waiting'

    this.transferControl()
  }

  // TODO: 需调用api直接支付
  /**
   * @description all-in跟上一个玩家的选择没有任何关系
   */
  allIn(dealer: Dealer) {
    this.checkIfCanAct()
    if (!this.#getAllowedActions(dealer).includes('all-in')) {
      throw new Error('不可全押')
    }

    // 其他玩家持有筹码的最大值, 全押金额不可超过该值
    const maxAllInAmount = Math.max(
      ...dealer
        .filter((p) => p !== this)
        .map(
          (player) => player.getBalance() + player.getCurrentStageTotalAmount()
        )
    )
    const moneyShouldPay = maxAllInAmount - this.#currentStageTotalAmount

    if (moneyShouldPay <= 0) throw new Error('数据异常,请手动下注')

    // 如果需要支付的金额大余额, 则全押剩余的所有金额
    const money = Math.min(moneyShouldPay, this.#balance)
    this.#action = {
      type: 'all-in',
      payload: {
        value: money
      }
    }
    this.#currentStageTotalAmount += money
    this.#balance -= money
    this.#status = 'all-in'
    console.log(this.#userInfo.id, '全押:', money, '剩余筹码: ', this.#balance)
    this.transferControl()
    return money
  }

  resetAction() {
    this.#action = undefined
  }
  getAllowedActions() {
    return this.#getAllowedActions()
  }

  /**
   * @description 根据上一个玩家, 计算可以行动的行动列表
   * @param lastPlayer
   */
  #getAllowedActions(dealer?: Dealer): Array<ActionType> {
    const helper = (lastPlayer: Player | null): ActionType[] => {
      if (this.#status === 'all-in') return []

      // 当前阶段第一位非`fold`行动的玩家
      if (!lastPlayer || !lastPlayer.#action)
        return ['bet', 'all-in', 'fold', 'check']

      // 需要根据指针找到最近采取行动的玩家
      if (lastPlayer.#action?.type === 'fold') {
        const player = this.returnLatestPlayerIf(
          (player) => player.#action?.type !== 'fold'
        )
        return helper(player)
      }

      if (lastPlayer.#action.type === 'check')
        return ['all-in', 'bet', 'check', 'fold']

      // 前置校验: 余额无法call住上一个玩家, 只能all-in
      if (
        this.#balance + this.#currentStageTotalAmount <=
        lastPlayer.#currentStageTotalAmount
      ) {
        return ['all-in', 'fold']
      }

      if (lastPlayer.#action!.type === 'bet') {
        return ['call', 'raise', 'all-in', 'fold']
      }

      if (lastPlayer.#action?.type === 'raise') {
        return ['call', 'raise', 'all-in', 'fold']
      }

      // TODO: 这部分逻辑需要优化
      if (lastPlayer.#action?.type === 'all-in') {
        // 其他玩家的最大下注额
        const maxBetAmount = Math.max(
          ...dealer!
            .filter((p) => p !== this)
            .map((player) => player.getCurrentStageTotalAmount())
        )
        if (this.#balance + this.#currentStageTotalAmount <= maxBetAmount) {
          return ['all-in', 'fold']
        }
        return ['call', 'raise', 'fold', 'all-in']
      }

      // 上个玩家的行为是: call
      return ['call', 'raise', 'fold', 'all-in']
    }
    return helper(this.#lastPlayer)
  }

  returnLatestPlayerIf(filter: (player: Player) => boolean): Player | null {
    let current = this.getLastPlayer()
    while (current) {
      if (filter(current)) return current
      current = current.getLastPlayer()
    }
    return null
  }

  getAction() {
    return this.#action
  }

  getBalance() {
    return this.#balance
  }
  getRole() {
    return this.#role
  }
  getUserInfo() {
    return this.#userInfo
  }

  checkIfCanAct() {
    if (this.#status !== 'active') throw new Error('不可行动')
  }
  toString() {
    return `status: ${this.#status};id: ${this.#userInfo.id};balance: ${
      this.#balance
    }`
  }
  log(prefix: string = '') {
    console.log(prefix + this.toString())
  }

  setHandPokes(pokes: Poke[]) {
    this.#handPokes = pokes
  }
  getHandPokes() {
    return this.#handPokes
  }

  // TODO: api call
  async earn(money: number) {
    this.#balance += money
    this.#userInfo.balance += money
    console.log(this.#userInfo.id, '分得奖池金额:', money)
  }

  // 游戏推进到下个阶段后, 需要将此字段清空
  resetCurrentStageTotalAmount() {
    this.#currentStageTotalAmount = 0
  }

  clearTimer() {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
  }

  transferControl() {
    this.clearTimer()

    // 在移交控制权之前, 需要校验游戏是否该进入下个阶段
    const canAdvanceToNextStage = this.#controller.tryToAdvanceGameToNextStage()
    if (canAdvanceToNextStage) return

    this.#controller.transferControlToNext(this.getNextPlayer())
  }

  continue() {
    this.#timer = setInterval(() => {
      this.#countDownTime--
      if (this.#countDownTime === 0 && this.#timer) {
        //  TODO: 超时采取的默认行为
        this.transferControl()
      }
    }, 1000)
  }
  pause() {
    this.clearTimer()
  }
  removeControl() {
    if (this.#status === 'active') {
      this.#status = 'waiting'
    }
    this.clearTimer()
  }
  getControl() {
    this.#status = 'active'
    this.continue()
  }
}
// 庄家
// const p1 = new Player(200, "button", { id: 1, balance: 20000 }, null);
// const p2 = new Player(200, "small-blind", { id: 2, balance: 30000 }, p1);
// const p3 = new Player(200, "small-blind", { id: 3, balance: 5000 }, p2);
// const p4 = new Player(200, "under-the-gun1", { id: 3, balance: 5000 }, p3);

// p2.takeAction("fold");

// p1.takeAction("check");
// p3.takeAction("bet");
// p4.takeAction("bet");

// const l = p3.returnLatestPlayerIf((player) => player.getAction() !== "check");
// l?.log();

// const dealer = new Dealer(5000)
// const controller = new Controller(dealer)
// const p = new Player({
//   lowestBetAmount: 500,
//   user: { id: 1, balance: 5000 },
//   controller
// })
