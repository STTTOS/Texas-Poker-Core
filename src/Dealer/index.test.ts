import Dealer from '.'

describe('dealer', () => {
  test('Game init successfully', () => {
    const dealer = new Dealer({ id: 1, balance: 5000 }, 200)
    dealer.join({ id: 2, balance: 40000 })
    dealer.join({ id: 3, balance: 10000 })
    dealer.start()

    expect(dealer.getDeck().getCards().length).toEqual(52)
    expect(dealer.getDeck().getPokes().commonPokes.length).toEqual(5)
    expect(dealer.getDeck().getPokes().handPokes.length).toEqual(3)
    expect(dealer.getPlayersCount()).toEqual(3)
    expect(dealer.getLowestBeAmount()).toEqual(200)
  })
})
