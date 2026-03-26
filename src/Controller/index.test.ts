import Room from '@/Room'
import Pool from '@/Pool'
import Controller from '.'
import Dealer from '@/Dealer'
import { Player } from '@/Player'

describe('class Controller', () => {
  test('function transferControl', async () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const p1 = new Player({
      user: { id: 1, name: 'yt' },
      initialChips: 5000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      controller,
      initialChips: 5000
    })
    room.seat(p1)

    const p2 = new Player({
      lowestBetAmount: 1000,
      user: { id: 2, name: 'ycr' },
      initialChips: 30000,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      lowestBetAmount: 1000,
      user: { id: 3, name: 'wzy' },
      initialChips: 10000,
      controller,
      dealer,
      pool
    })

    const p4 = new Player({
      lowestBetAmount: 1000,
      user: { id: 4, name: 'zhong' },
      initialChips: 20000,
      controller,
      dealer,
      pool
    })
    room.join(p2)
    room.join(p3)
    room.join(p4)
    room.seat(p2)
    room.seat(p3)
    room.seat(p4)
    room.getDealer().setButton(p3)
    // 发牌, 分配角色
    room.ready()

    await controller.start()
    room.getDealer().log()
    expect(controller.activePlayer === p3).toBe(true)
    // p1.log()
    await p3.allIn()
    // p1.log()

    expect(controller.activePlayer === p4).toBe(true)
    // p2.log()
    await p4.allIn()
    // p2.log()

    expect(controller.activePlayer === p1).toBe(true)
    // p3.log()
    await p1.allIn()

    controller.end()
    // expect(p1.getBalance()).toEqual(0)
    // expect(p2.getBalance()).toEqual(10000)
    // expect(p3.getBalance()).toEqual(9000)
    // expect(p4.getBalance()).toEqual(0)
  })

  test('initial status is idle', () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    expect(controller.status).toBe('idle')
  })
})
