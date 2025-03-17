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
})
