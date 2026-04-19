import Texas from '@/Texas'
import { captureTableSnapshot } from './tableSnapshot'
import { TexasEngineContext } from '@/TexasEngineContext'
import { captureSeatUserIdsInActionOrder } from './dealerRingReadModel'

describe('dealerRingReadModel', () => {
  let teardown: Texas | undefined

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
  })

  test('captureSeatUserIdsInActionOrder matches captureTableSnapshot players order', () => {
    const texas = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 20_000,
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

    const snap = captureTableSnapshot(texas)
    const ids = captureSeatUserIdsInActionOrder(texas.dealer)
    expect(ids).toEqual(snap.players.map((p) => p.userId))
  })
})
