// 控制游戏的进程
// class Game
import Room from './Room'
import Pool from './Pool'
import Dealer from './Dealer'
import Controller from './Controller'
import { User, Player } from './Player'

// 在表单中填入一些基本的信息
// 比如大盲注
// 最大玩家数量
// 是否允许观战
interface CreateRoomInputArgs {
  lowestBetAmount: number
  maximumCountOfPlayers: number
  allowPlayersToWatch: boolean
}
const initialGame = ({
  lowestBetAmount,
  maximumCountOfPlayers,
  allowPlayersToWatch
}: CreateRoomInputArgs) => {
  const dealer = new Dealer(lowestBetAmount)
  const controller = new Controller(dealer)
  const pool = new Pool()
  const room = new Room(dealer, allowPlayersToWatch, maximumCountOfPlayers)

  return {
    room,
    pool,
    dealer,
    controller,
    createPlayer(userInfo: User) {
      return new Player({
        user: userInfo,
        lowestBetAmount: dealer.getLowestBetAmount(),
        controller
      })
    },
    start() {
      room.startGame()
      controller.start()
    },
    async settle() {
      // 先结束游戏
      controller.end()
      dealer.settle()

      // 计算并分配奖池
      await pool.pay()
      pool.reset()
      // 荷官重置各玩家的手牌, 行为, 以及下注金额
      dealer.reset()
    }
  }
}

export { initialGame }
