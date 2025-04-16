import Room from '@/Room'
import Pool from '@/Pool'
import { Player } from '.'
import Dealer from '@/Dealer'
import Controller from '@/Controller'

describe('class Player', () => {
  test('function allIn', async () => {
    const dealer = new Dealer(1000)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const p1 = new Player({
      user: { id: 1, balance: 18000, name: 'ycr' },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p2 = new Player({
      user: { id: 2, balance: 5000, name: 'yt' },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      user: { id: 3, balance: 10_000, name: 'wyz' },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room(dealer, p1, controller)

    room.join(p2)
    room.join(p3)
    room.getDealer().setButton(p2)
    room.ready()
    // 庄家: p3
    await controller.start()

    await p3.call()
    await p1.allIn()
    await p2.allIn()
    controller.end()

    expect(p1.balance).toEqual(8000)
    expect(p2.balance).toEqual(0)
    expect(p3.balance).toEqual(9000)
  })
})
