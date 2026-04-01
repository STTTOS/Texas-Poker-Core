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
      user: { id: 1, name: 'ycr' },
      initialChips: 18000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p2 = new Player({
      user: { id: 2, name: 'yt' },
      initialChips: 5000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      user: { id: 3, name: 'wyz' },
      initialChips: 10_000,
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room({
      dealer,
      owner: p1,
      controller,
      initialChips: 18000
    })
    room.seat(p1)

    room.join(p2)
    room.join(p3)
    room.seat(p2)
    room.seat(p3)
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

  describe('getRestrict', () => {
    test('min is min(lowestBet, balance, smallest positive currentStageTotal on table)', () => {
      const dealer = new Dealer(1000)
      const controller = new Controller(dealer)
      const pool = new Pool()
      const lowest = dealer.lowestBetAmount
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 8000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 8000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      const p3 = new Player({
        user: { id: 3, name: 'c' },
        initialChips: 8000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.join(p3)
      dealer.setButton(p1)

      // 短码只下了 300，另一人满额 1000，第三人本轮尚未下
      p1.currentStageTotalAmount = 300
      p2.currentStageTotalAmount = 1000
      p3.currentStageTotalAmount = 0

      const r = p3.getRestrict()
      expect(r.max).toBe(8000)
      expect(r.min).toBe(300)
    })

    test('when no positive currentStageTotal on table, min uses lowestBetAmount in the triple min', () => {
      const dealer = new Dealer(1000)
      const controller = new Controller(dealer)
      const pool = new Pool()
      const lowest = dealer.lowestBetAmount
      const p1 = new Player({
        user: { id: 1, name: 'a' },
        initialChips: 5000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'b' },
        initialChips: 5000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.setButton(p1)
      p1.currentStageTotalAmount = 0
      p2.currentStageTotalAmount = 0

      const r = p1.getRestrict()
      expect(r.max).toBe(5000)
      expect(r.min).toBe(lowest)
    })

    test('max equals player balance only', () => {
      const dealer = new Dealer(500)
      const controller = new Controller(dealer)
      const pool = new Pool()
      const lowest = dealer.lowestBetAmount
      const p1 = new Player({
        user: { id: 1, name: 'x' },
        initialChips: 350,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      const p2 = new Player({
        user: { id: 2, name: 'y' },
        initialChips: 10_000,
        lowestBetAmount: lowest,
        controller,
        dealer,
        pool
      })
      dealer.join(p1)
      dealer.join(p2)
      dealer.setButton(p1)
      p1.currentStageTotalAmount = 0
      p2.currentStageTotalAmount = 2000

      expect(p1.getRestrict().max).toBe(350)
    })
  })
})
