import Texas from '@/Texas'
import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import { applyTableCommand } from './applyTableCommand'
import { TexasEngineContext } from '@/TexasEngineContext'
import { reducePotFromDomainEvents } from './domainEventReadModel'

describe('applyTableCommand (facade toward apply state and events)', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  test('returns events and snapshotAfter without extra I/O', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    const p3 = texas.createPlayer({ id: 3, name: 'c' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.join(p3)
    texas.room.seat(p2)
    texas.room.seat(p3)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardown = texas
    void texas.start()
    void texas.flushPendingTurnHandoff()

    const ap = texas.controller.activePlayer!
    const uid = ap.getUserInfo().id
    const { events, snapshotAfter } = applyTableCommand(texas, {
      type: 'Fold',
      playerId: uid
    })

    expect(
      events.some(
        (e) =>
          e.type === 'PlayerActed' &&
          e.payload.userId === uid &&
          e.payload.actionType === ActionTypeEnum.FOLD
      )
    ).toBe(true)
    const row = snapshotAfter.players.find((r) => r.userId === uid)
    expect(row?.status).toBe('out')
  })

  test('PotUpdated projection matches snapshot pot (events vs read model)', () => {
    const texas = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.seat(p2)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardown = texas
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]
    texas.dealCards()

    const first = texas.controller.activePlayer!
    const { events, snapshotAfter } = applyTableCommand(texas, {
      type: 'Call',
      playerId: first.getUserInfo().id
    })

    expect(events.some((e) => e.type === 'PotUpdated')).toBe(true)
    expect(texas.controller.stage).toBe(StageEnum.PRE_FLOP)
    const fromEvents = reducePotFromDomainEvents(events)
    expect(fromEvents.totalAmount).toBe(snapshotAfter.potTotal)
    const key = (c: Readonly<{ userId: number; amount: number }>) =>
      `${c.userId}:${c.amount}`
    expect(new Set(fromEvents.contributions.map(key))).toEqual(
      new Set(snapshotAfter.contributions.map(key))
    )
  })
})
