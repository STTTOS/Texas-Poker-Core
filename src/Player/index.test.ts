import Room from '@/Room'
import { Player } from '.'
import Dealer from '@/Dealer'
import Controller from '@/Controller'

describe('class Player', () => {
  test('function allIn', () => {
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 18000, name: 'ycr' },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const p2 = new Player({
      user: { id: 2, balance: 5000, name: 'yt' },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const p3 = new Player({
      user: { id: 3, balance: 10_000, name: 'wyz' },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller,
      dealer
    })
    const room = new Room(dealer, p1)

    room.join(p2)
    room.join(p3)
    room.getDealer().setButton(p2)
    room.ready()
    controller.start()

    p3.call()
    p1.allIn()
    p2.allIn()
    dealer.logPlayers()

    controller.end()

    expect(p1.getBalance()).toEqual(8000)
    expect(p2.getBalance()).toEqual(0)
    expect(p3.getBalance()).toEqual(9500)
  })
})
