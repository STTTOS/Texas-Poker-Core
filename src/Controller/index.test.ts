import Room from '@/Room'
import Controller from '.'
import Dealer from '@/Dealer'
import { Player } from '@/Player'

describe('class Controller', () => {
  test('function transferControl', () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, p1)

    const p2 = new Player({
      lowestBetAmount: 1000,
      user: { id: 2, balance: 30000 },
      controller,
      dealer
    })
    const p3 = new Player({
      lowestBetAmount: 1000,
      user: { id: 3, balance: 10000 },
      controller,
      dealer
    })

    const p4 = new Player({
      lowestBetAmount: 1000,
      user: { id: 4, balance: 20000 },
      controller,
      dealer
    })
    room.join(p2)
    room.join(p3)
    room.join(p4)
    room.getDealer().setButton(p3)
    // 发牌, 分配角色
    room.ready()
    // room.getDealer().log()

    controller.start()
    room.getDealer().log()
    expect(controller.activePlayer === p1).toBe(true)
    // p1.log()
    p1.bet(4000)
    // p1.log()

    expect(controller.activePlayer === p2).toBe(true)
    // p2.log()
    p2.allIn()
    // p2.log()

    expect(controller.activePlayer === p3).toBe(true)
    // p3.log()
    p3.allIn()

    expect(controller.activePlayer === p4).toBe(true)
    p4.allIn()
    controller.end()
    expect(p1.getBalance()).toEqual(1000)
    expect(p2.getBalance()).toEqual(10_000)
    expect(p3.getBalance()).toEqual(0)
    expect(p4.getBalance()).toEqual(0)
  })
})
