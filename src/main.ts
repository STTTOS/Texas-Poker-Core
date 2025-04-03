// 控制游戏的进程
// class Game
import Room from './Room'
import Pool from './Pool'
import Dealer from './Dealer'
import { User, Player } from './Player'
import { ActionType } from './Player/index'
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
  lowestBetAmount,
  maximumCountOfPlayers,
  allowPlayersToWatch,
  user
}: CreateRoomInputArgs) => {
  const dealer = new Dealer(lowestBetAmount)
  const controller = new Controller(dealer)
  const pool = new Pool()
  const owner = new Player({ user, lowestBetAmount, controller, dealer, pool })
  const room = new Room(
    dealer,
    owner,
    allowPlayersToWatch,
    maximumCountOfPlayers
  )
  let callbackOfEnd: CallbackOfGameEnd

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
        user: userInfo,
        lowestBetAmount: dealer.getLowestBetAmount()
      })
    },
    // 设置各个玩家的初始角色
    ready() {
      if (room.status === 'on') throw new Error('玩家角色已确认, 请勿重复设置')

      room.ready()
    },
    start() {
      if (room.status === 'unReady')
        throw new Error('玩家位置未确认, 无法开始游戏')

      if (controller.status == 'on')
        throw new Error('游戏已经开始, 请勿重复操作')

      // 庄家发牌
      if (!dealer.button) throw new Error('游戏未指定庄家, 无法发牌')

      room.start()
      dealer.dealCards()
      controller.onGameEnd((params) => {
        this.end()
        console.log('触发游戏结束, 游戏状态: ', controller.status)
        callbackOfEnd?.(params)
      })
      controller.start()
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
      callbackOfEnd = callback
    },
    onNextStage(callback: CallbackOnNextStage) {
      controller.onNextStage(callback)
    },
    takeAction(player: Player, action: ActionType, amount = 0) {
      player[action](amount)
      pool.add(player, amount, controller.stage)
    },
    // 测试阶段方法, 手动结束游戏
    end() {
      if (room.status === 'waiting' || room.status === 'unReady')
        throw new Error('游戏还未开始')

      controller.end()
      room.reset()
    },
    async settle() {
      this.end()

      dealer.settle()
      // 计算并分配奖池
      await pool.pay()

      pool.reset()
      dealer.reset()
    }
  }
}

export { initialGame }
