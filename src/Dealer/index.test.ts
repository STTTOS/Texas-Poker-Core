import Dealer from '.'
import Pool from '@/Pool'
import { Player } from '@/Player'
import Controller from '@/Controller'

describe('dealer', () => {
  test('Game init successfully', () => {
    const dealer = new Dealer(200)
    const lowestBetAmount = dealer.lowestBetAmount
    const controller = new Controller(dealer)
    const pool = new Pool()
    dealer.join(
      new Player({
        user: { id: 2, balance: 40000 },
        lowestBetAmount,
        controller,
        dealer,
        pool
      })
    )
    dealer.join(
      new Player({
        user: { id: 3, balance: 40000 },
        lowestBetAmount,
        controller,
        dealer,
        pool
      })
    )
    dealer.setRoles()
    dealer.dealCards()
    dealer.settle()

    expect(dealer.deck.getCards().length).toEqual(52)
    expect(dealer.deck.getPokes().commonPokes.length).toEqual(5)
    expect(dealer.deck.getPokes().handPokes.length).toEqual(2)
    expect(dealer.count).toEqual(2)
    expect(dealer.lowestBetAmount).toEqual(200)
  })
})
