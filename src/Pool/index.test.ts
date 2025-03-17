import Pool from '.'
import Dealer from '@/Dealer'
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

    expect(pool.getBetHistory().get('pre-flop')?.get(p1)).toEqual(1000)
    expect(pool.getBetHistory().get('pre-flop')?.get(p2)).toEqual(2000)
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
    expect(pool.getMainPool()).toEqual(4000)
    expect(pool.getPots().length).toEqual(2)
    expect(pool.getPots()[0].amount).toEqual(3000)
    expect(pool.getPots()[0].players).toEqual(new Set([p2, p3, p4]))

    expect(pool.getPots()[1].amount).toEqual(4000)
    expect(pool.getPots()[1].players).toEqual(new Set([p3, p4]))
  })

  test('function settle', () => {
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

    pool.add(p1, 1000, 'flop')
    pool.add(p2, 2000, 'flop')
    pool.add(p3, 2000, 'flop')
    pool.add(p4, 2000, 'flop')

    const { mainPool, sidePool } = pool.settle()
    expect(mainPool).toEqual(8000)
    expect(sidePool).toEqual(10_000)
  })
})
