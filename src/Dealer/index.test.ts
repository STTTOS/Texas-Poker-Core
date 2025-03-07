import Dealer from '.'
import { Player } from '@/Player'

describe('dealer', () => {
  test('Game init successfully', () => {
    const dealer = new Dealer(200)
    const lowestBetAmount = dealer.getLowestBetAmount()

    dealer.join(
      new Player({ user: { id: 2, balance: 40000 }, lowestBetAmount })
    )
    dealer.join(
      new Player({ user: { id: 3, balance: 40000 }, lowestBetAmount })
    )
    dealer.start()

    expect(dealer.getDeck().getCards().length).toEqual(52)
    expect(dealer.getDeck().getPokes().commonPokes.length).toEqual(5)
    expect(dealer.getDeck().getPokes().handPokes.length).toEqual(2)
    expect(dealer.getPlayersCount()).toEqual(2)
    expect(dealer.getLowestBetAmount()).toEqual(200)
  })
})
