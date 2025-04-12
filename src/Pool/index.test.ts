import Pool from '.'
import Room from '@/Room'
import Dealer from '@/Dealer'
import { sum } from '@/utils'
import { Player } from '@/Player'
import Controller from '@/Controller'

describe('class pool', () => {
  test('function add', () => {
    const pool = new Pool()
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })

    const p2 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    console.log(p1.balance, 'p1ba')
    pool.add(p1, 1000, 'pre_flop')
    pool.add(p2, 2000, 'pre_flop')

    expect(pool.betRecords.get('pre_flop')?.get(p1)).toEqual(1000)
    expect(pool.betRecords.get('pre_flop')?.get(p2)).toEqual(2000)
  })

  test('function calculateStage', () => {
    const pool = new Pool()
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })

    const p2 = new Player({
      user: { id: 2, balance: 10000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      user: { id: 3, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p4 = new Player({
      user: { id: 4, balance: 4000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    pool.add(p1, 1000, 'pre_flop')
    pool.add(p2, 2000, 'pre_flop')
    pool.add(p3, 4000, 'pre_flop')
    pool.add(p4, 4000, 'pre_flop')

    pool.calculateStage('pre_flop')
    expect(pool.pots.size).toEqual(3)
    expect(pool.getSpecificPot(new Set([p1, p2, p3, p4]))).toEqual(4000)
    expect(pool.getSpecificPot(new Set([p2, p3, p4]))).toEqual(3000)

    expect(pool.getSpecificPot(new Set([p3, p4]))).toEqual(4000)
  })

  test('function settle & (getter)totalAmount', () => {
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const pool = new Pool()
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const room = new Room(dealer, p1, controller)
    const p2 = new Player({
      user: { id: 2, balance: 10000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p3 = new Player({
      user: { id: 3, balance: 5000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    const p4 = new Player({
      user: { id: 4, balance: 4000 },
      lowestBetAmount: dealer.lowestBetAmount,
      controller,
      dealer,
      pool
    })
    room.join(p2)
    room.join(p3)
    room.join(p4)

    room.ready()
    dealer.dealCards()
    dealer.settle()

    pool.add(p1, 1000, 'pre_flop')
    pool.add(p2, 2000, 'pre_flop')
    pool.add(p3, 4000, 'pre_flop')
    pool.add(p4, 4000, 'pre_flop')

    const result = pool.settle()
    expect(Array.from(result.values()).reduce(sum, 0)).toEqual(11_000)
    expect(pool.totalAmount).toEqual(11_000)
  })
})
