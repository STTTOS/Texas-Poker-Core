import Controller from '@/Controller'
import { Poke } from '../Deck/constant'

// 玩家的状态
type PlayerStatus =
  // 全押
  | 'all-in'
  // 轮到该玩家的回合
  | 'active'
  // 离线
  | 'off-line'
  // 非玩家回合的状态
  | 'waiting'
  // 弃牌出局
  | 'out'

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
    console.log(this.getUserInfo().id, '下注金额:', money)
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
  }

  // TODO: 需调用api直接支付
  raise(money: number, lastPlayer: Player) {
    if (!this.#getAllowedActions().includes('raise'))
      throw new Error('不可加注')

    if (money > this.#balance) {
      throw new Error('加注金额不可大于筹码总数')
    }
    if (money < this.#lowestBetAmount) {
      throw new Error('加注金额不可小于大盲注')
    }
    if (
      money + this.#currentStageTotalAmount <=
      lastPlayer.#currentStageTotalAmount
    ) {
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

  resetAction() {
    this.#action = undefined
  }
  // TODO: 需调用api直接支付
  call() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('call')) throw new Error('不可跟注')

    // 需要找到上一个行动的玩家
    const player = this.returnLatestPlayerIf(
      (player) =>
        player.#action?.type !== 'fold' && player.#action?.type !== 'check'
    )!

    // TODO: 这里还有特殊情况, 处理all-in金额小于大盲注的情况
    const moneyShouldPay =
      player.#currentStageTotalAmount - this.#currentStageTotalAmount
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
  allIn() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('all-in')) {
      throw new Error('不可全押')
    }

    console.log(this.#userInfo.id, '全押', this.#balance)
    this.#action = {
      type: 'all-in',
      payload: {
        value: this.#balance
      }
    }
    this.#currentStageTotalAmount += this.#balance
    this.#balance = 0
    this.#status = 'all-in'

    this.transferControl()
  }

  getAllowedActions() {
    return this.#getAllowedActions()
  }

  /**
   * @description 根据上一个玩家, 计算可以行动的行动列表
   * @param lastPlayer
   */
  #getAllowedActions(
    lastPlayer: Player | null = this.#lastPlayer
  ): Array<ActionType> {
    if (this.#status === 'all-in') return []

    // 当前阶段第一位行动的玩家
    if (!lastPlayer?.getAction()) return ['bet', 'all-in', 'fold', 'check']

    if (lastPlayer.#action?.type === 'check')
      return ['all-in', 'bet', 'check', 'fold']

    if (lastPlayer.#action?.type === 'bet') {
      if (this.#balance <= lastPlayer.#action.payload.value) {
        return ['all-in', 'fold']
      }
      return ['call', 'raise', 'all-in', 'fold']
    }

    if (lastPlayer.#action?.type === 'raise') {
      if (this.#balance <= lastPlayer.#action.payload.value) {
        return ['all-in', 'fold']
      }
      return ['call', 'raise', 'all-in', 'fold']
    }

    // 需要根据指针找到最近采取行动的玩家
    if (lastPlayer.#action?.type === 'fold') {
      const player = this.returnLatestPlayerIf(
        (player) => player.#action?.type !== 'fold'
      )
      return this.#getAllowedActions(player)
    }

    if (lastPlayer.#action?.type === 'all-in') {
      if (this.#balance <= lastPlayer.#action.payload.value) {
        return ['all-in', 'fold']
      }
      return ['call', 'raise', 'fold', 'all-in']
    }

    // call
    return ['call', 'raise', 'fold', 'all-in']
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
  // pay(money: number) {}

  earn(money: number) {
    console.log(money)
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
  getControl() {
    this.#status = 'active'

    this.#timer = setTimeout(() => {
      this.#countDownTime--
      if (this.#countDownTime === 0 && this.#timer) {
        //  TODO: 超时采取的默认行为
        this.transferControl()
      }
    }, 30 * 1000)
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
