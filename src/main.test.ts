import { initialGame } from './main'

describe('entery', () => {
  test.only('game start and settle successfully', async () => {
    const texas = initialGame({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      allowPlayersToWatch: true,
      user: { id: 1, balance: 5000, name: 'ycr' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, balance: 10_000, name: 'yt' })
    texas.room.join(p2)
    texas.dealer.setButton(p1)

    texas.ready()
    texas.start()

    expect(() => texas.ready()).toThrow('游戏正在进行中')

    await texas.settle()

    expect(p1.getBalance() + p2.getBalance()).toEqual(15_000)
  })
})
