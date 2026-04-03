import { StageEnum } from '@/Controller'
import Texas, { type CardsDealtEvent, type RolesAssignedEvent } from '@/Texas'

describe('entery', () => {
  test('game start and settle successfully', async () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'ycr' }
    })
    const rolesEvents: RolesAssignedEvent[] = []
    const dealEvents: CardsDealtEvent[] = []
    texas.onRolesAssigned((e) => rolesEvents.push(e))
    texas.onDealCards((e) => dealEvents.push(e))
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'yt' })
    const p3 = texas.createPlayer({ id: 3, name: 'wyz' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)

    texas.setPlayerRoles()
    await texas.start()

    expect(rolesEvents.length).toBe(1)
    expect(rolesEvents[0].players.length).toBeGreaterThanOrEqual(2)
    expect(dealEvents.length).toBe(1)
    expect(dealEvents[0].players.every((p) => p.handPokes.length === 2)).toBe(
      true
    )

    expect(() => texas.setPlayerRoles()).toThrow('玩家位置已确认,请勿重复设置')
    expect(texas.start()).rejects.toThrow('游戏已经开始, 请勿重复开始游戏')

    texas.controller.end()
    texas.controller.settleRankingsThroughStage(StageEnum.RIVER)
    texas.settle()
    texas.reset()
    expect(p1.balance + p2.balance + p3.balance).toEqual(15_000)
  })
})
