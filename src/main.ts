// 控制游戏的进程
// class Game
import Room from './Room'
import Pool from './Pool'
import Dealer from './Dealer'
import { ActionType } from './Player/index'
import { User, Player, CallbackOfAction } from './Player'
import Controller, {
  CallbackOfGameEnd,
  CallbackOnNextStage
} from './Controller'

// 在表单中填入一些基本的信息
// 比如大盲注
// 最大玩家数量
// 是否允许观战
interface CreateRoomInputArgs {
  lowestBetAmount: number
  maximumCountOfPlayers: number
  allowPlayersToWatch: boolean
  // 需要传入用户信息, 在创建房间时同时指定房主
  user: User
  /**
   * 是否需要在超时 采取默认行动
   */
  shouldTakeDefaultAction?: boolean
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
const initialGame = ({
  user,
  thinkingTime,
  lowestBetAmount,
  allowPlayersToWatch,
  maximumCountOfPlayers,
  shouldTakeDefaultAction
}: CreateRoomInputArgs) => {
  const dealer = new Dealer(lowestBetAmount)
  const controller = new Controller(dealer)
  const pool = new Pool()
  const owner = new Player({
    user,
    lowestBetAmount,
    controller,
    dealer,
    pool,
    shouldTakeDefaultAction,
    thinkingTime
  })
  const room = new Room(
    dealer,
    owner,
    controller,
    allowPlayersToWatch,
    maximumCountOfPlayers
  )
  return {
    room,
    pool,
    dealer,
    controller,
    createPlayer(userInfo: User) {
      return new Player({
        pool,
        dealer,
        controller,
        thinkingTime,
        user: userInfo,
        shouldTakeDefaultAction,
        lowestBetAmount: dealer.lowestBetAmount
      })
    },
    // 设置各个玩家的初始角色
    ready() {
      room.ready()
    },
    async start() {
      if (room.status === 'unReady')
        throw new Error('玩家位置未确认, 无法进行游戏')

      if (controller.status !== 'waiting')
        throw new Error('游戏已经开始, 请勿重复操作')

      this.resetBeforeGameStart()

      dealer.dealCards()
      await controller.start()
    },
    // 获取默认下注行为
    getDefaultBet() {
      return controller.defaultBets
    },

    onPreAction(callback: (params: PreAction) => void) {
      this.dealer.forEach((player) => {
        player.onPreAction(callback)
      })
    },
    onGameEnd(callback: CallbackOfGameEnd) {
      this.controller.onGameEnd(callback)
    },
    onNextStage(callback: CallbackOnNextStage) {
      controller.onNextStage(callback)
    },
    onGameStart(callback: () => Promise<void>) {
      this.controller.onGameStart(callback)
    },
    /**
     * 监听玩家采取行动
     */
    onAction(callback: CallbackOfAction) {
      dealer.forEach((player) => player.onAction(callback))
    },
    // 测试阶段方法, 手动结束游戏
    end() {
      if (controller.status === 'waiting')
        throw new Error('游戏还未开始, 无法结束游戏')

      controller.end()
    },

    async settle() {
      dealer.settle()
      // 计算并分配奖池
      await pool.pay()
    },
    reset() {
      pool.reset()
      dealer.reset()
      controller.reset()
    },
    /**
     *@description 在游戏开始时重置所有状态
     *目前没有考虑游戏异常结束的情况
     *所以需要在游戏开始时调用此方法去重置状态
     */
    resetBeforeGameStart() {
      pool.reset()
      dealer.reset()
      controller.reset()
    }
  }
}

export { initialGame }
