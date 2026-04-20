import Texas from '@/Texas'
import { interpret } from '@/orchestration/interpret'
import { TexasEngineContext } from '@/TexasEngineContext'
import { applyTableCommand } from '@/engine/applyTableCommand'
import { createInMemoryDomainEventStore } from './domainEventPersistence'
import { createAppendDomainEventsHandler } from './appendDomainEventsInterpretHandler'

describe('createAppendDomainEventsHandler', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  test('persists each event from apply through interpret', async () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
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
    texas.dealCards()
    void texas.start()
    void texas.flushPendingTurnHandoff()

    const { events } = applyTableCommand(texas, {
      type: 'Fold',
      playerId: texas.controller.activePlayer!.getUserInfo().id
    })

    const { store, getRows } = createInMemoryDomainEventStore()
    await interpret(events, {}, [
      createAppendDomainEventsHandler('room-1', store)
    ])

    const rows = getRows()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.every((r) => r.tableId === 'room-1')).toBe(true)
    expect(rows.some((r) => r.eventType === 'PlayerActed')).toBe(true)
  })
})
