import Texas from '.'

describe('entery', () => {
  test('game start and settle successfully', async () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      allowPlayersToWatch: true,
      user: { id: 1, balance: 5000, name: 'ycr' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, balance: 10_000, name: 'yt' })
    const p3 = texas.createPlayer({ id: 3, balance: 5000, name: 'wyz' })
    texas.room.join(p2)
    texas.room.join(p3)
    texas.dealer.setButton(p1)

    texas.ready()
    await texas.start()

    expect(() => texas.ready()).toThrow('玩家位置已确认,请勿重复设置')
    expect(texas.start()).rejects.toThrow('游戏已经开始, 请勿重复开始游戏')

    texas.controller.end()
    await texas.settle()
    texas.reset()
    expect(p1.balance + p2.balance + p3.balance).toEqual(20_000)
  })
})
