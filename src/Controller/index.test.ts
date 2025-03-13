import Room from '@/Room'
import Controller from '.'
import Dealer from '@/Dealer'
import { Player } from '@/Player'

const dealer = new Dealer(1000)
const controller = new Controller(dealer)
const p1 = new Player({
  user: { id: 1, balance: 5000 },
  lowestBetAmount: dealer.getLowestBetAmount(),
  controller
})
const room = new Room(p1, dealer)

const p2 = new Player({
  lowestBetAmount: 1000,
  user: { id: 2, balance: 30000 },
  controller
})
const p3 = new Player({
  lowestBetAmount: 1000,
  user: { id: 3, balance: 10000 },
  controller
})

const p4 = new Player({
  lowestBetAmount: 1000,
  user: { id: 4, balance: 20000 },
  controller
})
describe('class Controller', () => {
  test('function transferControl', () => {
    room.addPlayer(p2)
    room.addPlayer(p3)
    room.addPlayer(p4)
    room.getDealer().setButton(p3)
    // 发牌, 分配角色
    room.ready()
    // room.getDealer().log()

    controller.start()

    expect(controller.getActivePlayer() === p1).toBe(true)
    // p1.log()
    p1.bet(4000)
    // p1.log()

    expect(controller.getActivePlayer() === p2).toBe(true)
    // p2.log()
    p2.allIn(dealer)
    // p2.log()

    expect(controller.getActivePlayer() === p3).toBe(true)
    // p3.log()
    p3.allIn(dealer)

    // 控制权移交到了p4手上, 需要清除计时器
    p4.clearTimer()
    controller.end()
  })
})
