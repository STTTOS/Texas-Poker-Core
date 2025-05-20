import Pool from '@/Pool'
import Room from '@/Room'
import Dealer from '@/Dealer'
import TexasError from '@/error'
import Player, { User, ActionType, CallbackOfAction } from '@/Player'
import Controller, {
  CallbackOfGameEnd,
  CallbackOnNextStage
} from '@/Controller'

// 在表单中填入一些基本的信息
// 比如大盲注
// 最大玩家数量
// 是否允许观战
export interface CreateRoomInputArgs {
  lowestBetAmount: number
  maximumCountOfPlayers: number
  allowPlayersToWatch: boolean
  // 需要传入用户信息, 在创建房间时同时指定房主
  user: User
  // 玩家的思考时间, 单位: s
  thinkingTime?: number
}
export interface PreAction {
  userId: number
  allowedActions: ActionType[]
  restrict?: {
    min: number
    max: number
  }
}
export type TexasErrorCallback = (error: TexasError) => never
// 组件基类
export interface GameComponent {
  reportError?(error: TexasError): void
}

class GameEventEmitter {
  protected errorCallback?: (error: TexasError) => void
  onError(callback: (error: TexasError) => void) {
    this.errorCallback = callback
  }
}
class Texas extends GameEventEmitter {
  pool: Pool
  room: Room
  dealer: Dealer
  controller: Controller
  handleError: (error: TexasError) => never

  constructor({
    user,
    thinkingTime,
    lowestBetAmount,
    allowPlayersToWatch,
    maximumCountOfPlayers
  }: CreateRoomInputArgs) {
    super()

    // 使用箭头函数, 防止this指向问题
    this.handleError = (error: TexasError) => {
      this.errorCallback?.(error)
      throw error
    }
    const dealer = new Dealer(lowestBetAmount, this.handleError)
    const controller = new Controller(dealer, this.handleError)
    const pool = new Pool(this.handleError)
    const owner = new Player({
      user,
      pool,
      dealer,
      controller,
      thinkingTime,
      lowestBetAmount,
      reportError: this.handleError
    })
    const room = new Room(
      dealer,
      owner,
      controller,
      allowPlayersToWatch,
      maximumCountOfPlayers,
      this.handleError
    )
    this.pool = pool
    this.room = room
    this.dealer = dealer
    this.controller = controller
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

  // 设置各个玩家的初始角色
  ready() {
    this.room.ready()
  }

  async start() {
    if (this.room.getPlayersBySeatStatus('on-set').length < 2)
      this.handleError(new TexasError(2100, '玩家数量不足, 无法开始游戏'))

    if (this.room.status === 'unReady')
      this.handleError(new TexasError(2100, '玩家位置未确认, 无法进行游戏'))

    if (this.controller.status !== 'waiting')
      this.handleError(new TexasError(2100, '游戏已经开始, 请勿重复开始游戏'))

    this.resetBeforeGameStart()
    this.dealer.dealCards()
    await this.controller.start()
  }

  // 测试阶段方法, 手动结束游戏
  end() {
    if (this.controller.status === 'waiting')
      this.handleError(new TexasError(2100, '游戏还未开始, 无法结束游戏'))

    this.controller.end()
  }

  async settle() {
    this.dealer.settle()
    // 计算并分配奖池
    await this.pool.pay()
  }

  reset() {
    this.pool.reset()
    this.dealer.reset()
    this.controller.reset()
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
      ...this,
      user: userInfo,
      thinkingTime: this.room.owner.thinkingTime,
      lowestBetAmount: this.dealer.lowestBetAmount,
      reportError: this.handleError
    })
  }
}

export default Texas
