import Pool from '@/Pool'
import Dealer from '@/Dealer'
import Controller from '@/Controller'
import { getRandomInt } from '@/utils'
import { Poke } from '../Deck/constant'

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
type OnlineStatus = 'online' | 'offline' | 'quit'
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
export type Action = ActionWithOutPayload | ActionWithPayload
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
  #thinkingTime = 1
  #countDownTime = this.#thinkingTime
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
  #dealer: Dealer
  #pool: Pool
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
    controller,
    dealer,
    pool
  }: {
    lowestBetAmount: number
    role?: Role
    user: User
    lastPlayer?: Player | null
    nextPlayer?: Player | null
    handPokes?: Poke[]
    controller: Controller
    dealer: Dealer
    pool?: Pool
  }) {
    if (user.balance < lowestBetAmount) {
      throw new Error('筹码小于大盲注, 不可参与游戏')
    }
    this.#balance = user.balance
    this.#lowestBetAmount = lowestBetAmount
    this.#userInfo = user
    this.#lastPlayer = lastPlayer
    this.#nextPlayer = nextPlayer
    this.#dealer = dealer

    this.#controller = controller
    this.#pool = pool || new Pool()
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
    this.#status = 'waiting'

    this.clearTimer()
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
    console.log(this.#userInfo.name, '过牌')
    this.transferControl()
  }

  fold() {
    if (!this.#getAllowedActions().includes('fold')) throw new Error('不可弃牌')

    this.#action = {
      type: 'fold'
    }
    this.#status = 'out'
    console.log(this.#userInfo.name, '弃牌')
    this.transferControl()
  }

  bet(money: number, preFlopDefaultAction = false) {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('bet') && !preFlopDefaultAction)
      throw new Error('不可下注')

    if (money > this.#balance) {
      throw new Error('下注金额不可大于筹码总数')
    }
    if (money < this.#lowestBetAmount && !preFlopDefaultAction) {
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
    console.log(
      this.#userInfo.name,
      '下注金额:',
      money,
      '剩余筹码:',
      this.#balance
    )
    this.#pool.add(this, money, this.#controller.stage)
    this.transferControl()
    return money
  }

  raise(_money: number) {
    if (!this.#getAllowedActions().includes('raise'))
      throw new Error('不可加注')

    if (_money > this.#balance) {
      throw new Error('加注金额不可大于筹码总数')
    }
    if (_money < this.#lowestBetAmount) {
      throw new Error('加注金额不可小于大盲注')
    }

    const maxBetAmount = Math.max(
      ...this.#dealer
        .filter((p) => p !== this)
        .map((p) => p.getCurrentStageTotalAmount())
    )
    // if (money + this.#currentStageTotalAmount <= maxBetAmount) {
    //   throw Error('必须加注更多的金额')
    // }
    const money = maxBetAmount + 200
    this.#action = {
      type: 'raise',
      payload: {
        value: money
      }
    }
    this.#balance -= money
    this.#currentStageTotalAmount += money

    console.log(this.#userInfo.name, '加注', money)

    this.#pool.add(this, money, this.#controller.stage)
    this.transferControl()
  }

  call() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('call')) throw new Error('不可跟注')

    // 其他玩家的最大下注金额
    const maxBetAmount = Math.max(
      ...this.#dealer
        .filter((p) => p !== this)
        .map((p) => p.getCurrentStageTotalAmount())
    )
    const moneyShouldPay = maxBetAmount - this.getCurrentStageTotalAmount()
    if (moneyShouldPay <= 0) throw new Error('数据异常, 请手动下注')
    if (moneyShouldPay > this.#balance) {
      throw new Error('跟注金额不可大于筹码总数')
    }
    this.#action = {
      type: 'call',
      payload: {
        value: moneyShouldPay
      }
    }
    this.#balance -= moneyShouldPay
    this.#currentStageTotalAmount += moneyShouldPay

    console.log(this.#userInfo.name, '跟注:', moneyShouldPay)
    this.#pool.add(this, moneyShouldPay, this.#controller.stage)
    this.transferControl()
  }

  /**
   * @description allIn跟上一个玩家的选择没有任何关系
   */
  allIn() {
    this.checkIfCanAct()
    if (!this.#getAllowedActions().includes('allIn')) {
      throw new Error('不可全押')
    }

    // 其他玩家持有筹码的最大值, 全押金额不可超过该值
    const maxAllInAmount = Math.max(
      ...this.#dealer
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
      type: 'allIn',
      payload: {
        value: money
      }
    }
    this.#currentStageTotalAmount += money
    this.#balance -= money

    this.#status = 'allIn'
    console.log(
      this.#userInfo.name,
      '全押:',
      money,
      '剩余筹码: ',
      this.#balance
    )
    this.#pool.add(this, money, this.#controller.stage)
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
  #getAllowedActions(): Array<ActionType> {
    const helper = (lastPlayer: Player | null): ActionType[] => {
      if (this.#status === 'allIn' || this.#status === 'out') return []

      // 当前阶段第一位非`fold`行动的玩家
      if (!lastPlayer || !lastPlayer.#action)
        return ['bet', 'allIn', 'fold', 'check']

      // 上个玩家弃牌了, 需要知道上一个采取行动的玩家, 采取的是什么行动
      if (lastPlayer.#action?.type === 'fold') {
        const player = this.#dealer.findReverse(
          (player) => player.getStatus() !== 'out' && !!player.getAction(),
          lastPlayer
        )
        console.log('上一个行动的玩家:', player?.getUserInfo().name)
        return helper(player)
      }

      if (lastPlayer.#action.type === 'check')
        return ['allIn', 'bet', 'check', 'fold']

      // 前置all-in校验
      // 其他玩家的最大下注额
      const maxBetAmount = Math.max(
        ...this.#dealer!.filter((p) => p !== this).map((player) =>
          player.getCurrentStageTotalAmount()
        )
      )
      if (this.#balance + this.#currentStageTotalAmount <= maxBetAmount) {
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
    return helper(this.#lastPlayer)
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

  getBalance() {
    return this.#balance
  }
  getRole() {
    return this.#role
  }
  getUserInfo() {
    return {
      ...this.#userInfo,
      // 余额需要用实时的, 而不是来自于数据库
      balance: this.#balance
    }
  }

  checkIfCanAct() {
    if (this.#status !== 'active') throw new Error('不可行动')
  }
  toString() {
    return `status: ${this.#status};name: ${
      this.#userInfo.name || this.#userInfo.id
    };balance: ${this.#balance}`
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

  // TODO: 需要先写到数据库
  async earn(money: number) {
    this.#balance += money
    this.#userInfo.balance += money
    console.log(this.#userInfo.name, '分得奖池金额:', money)
  }

  // 游戏推进到下个阶段后, 需要将此字段清空
  resetCurrentStageTotalAmount() {
    this.#currentStageTotalAmount = 0
  }

  clearTimer() {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
      this.#countDownTime = this.#thinkingTime
    }
  }

  onStatusChange() {}
  transferControl() {
    this.clearTimer()
    this.removeControl()

    const shouldEndGame = this.#controller.tryToEndGame()
    if (shouldEndGame) return
    // 在移交控制权之前, 需要校验游戏是否该进入下个阶段
    const canAdvanceToNextStage = this.#controller.tryToAdvanceGameToNextStage()
    if (canAdvanceToNextStage) return

    // 移交给下一个可以行动的玩家
    const nextPlayerToGetController = this.returnNextPlayerIf(
      (player) => player.getStatus() === 'waiting'
    )
    if (!nextPlayerToGetController)
      throw new Error('游戏发生异常, 将控制权移交给不存在的玩家')

    this.#controller.transferControlToNext(nextPlayerToGetController)
  }

  __testTakeAction() {
    const actions = this.#getAllowedActions()
    console.log('可以行动的列表', actions.toString())
    const index = getRandomInt(0, actions.length - 1)

    this[actions[index]](800)
  }
  takeDefaultAction() {
    this.__testTakeAction()
    return
    if (this.#getAllowedActions().includes('check')) {
      this.check()
    } else {
      this.fold()
    }
  }
  continue() {
    this.#timer = setInterval(() => {
      if (this.#countDownTime === 0 && this.#timer) {
        this.takeDefaultAction()
        return
      }
      this.#countDownTime--
    }, 5)
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
    console.log('玩家', this.#userInfo.name, '获得控制权')
    this.#status = 'active'

    // this.__testTakeAction()
    this.continue()
  }
}
export default Player
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
