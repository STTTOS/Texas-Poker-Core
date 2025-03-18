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
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })

    const p2 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    pool.add(p1, 1000, 'pre-flop')
    pool.add(p2, 2000, 'pre-flop')

    expect(pool.betRecords.get('pre-flop')?.get(p1)).toEqual(1000)
    expect(pool.betRecords.get('pre-flop')?.get(p2)).toEqual(2000)
  })

  test('function calculateStage', () => {
    const pool = new Pool()
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })

    const p2 = new Player({
      user: { id: 2, balance: 10000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const p3 = new Player({
      user: { id: 3, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const p4 = new Player({
      user: { id: 4, balance: 4000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    pool.add(p1, 1000, 'pre-flop')
    pool.add(p2, 2000, 'pre-flop')
    pool.add(p3, 4000, 'pre-flop')
    pool.add(p4, 4000, 'pre-flop')

    pool.calculateStage('pre-flop')
    expect(pool.mainPool).toEqual(4000)
    expect(pool.pots.size).toEqual(2)
    expect(pool.getSpecificPot(new Set([p2, p3, p4]))).toEqual(3000)

    expect(pool.getSpecificPot(new Set([p3, p4]))).toEqual(4000)
  })

  test('function settle & (getter)totalAmount', () => {
    const pool = new Pool()
    const dealer = new Dealer(500)
    const controller = new Controller(dealer)
    const p1 = new Player({
      user: { id: 1, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const room = new Room(dealer)
    room.addPlayer(p1)

    const p2 = new Player({
      user: { id: 2, balance: 10000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const p3 = new Player({
      user: { id: 3, balance: 5000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    const p4 = new Player({
      user: { id: 4, balance: 4000 },
      lowestBetAmount: dealer.getLowestBetAmount(),
      controller
    })
    room.addPlayer(p1)
    room.addPlayer(p2)
    room.addPlayer(p3)
    room.addPlayer(p4)

    room.startGame()
    room.settle()
    pool.add(p1, 1000, 'pre-flop')
    pool.add(p2, 2000, 'pre-flop')
    pool.add(p3, 4000, 'pre-flop')
    pool.add(p4, 4000, 'pre-flop')

    pool.add(p1, 1000, 'flop')
    pool.add(p2, 2000, 'flop')
    pool.add(p3, 2000, 'flop')
    pool.add(p4, 2000, 'flop')

    const result = pool.settle()
    expect(result.values().reduce(sum, 0)).toEqual(18_000)
    expect(pool.totalAmount).toEqual(18_000)
  })
})
