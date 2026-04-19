import type { CanonicalTableSession } from './canonicalTableSession'

import Texas from '@/Texas'
import { captureTableSnapshot } from './tableSnapshot'
import { TexasEngineContext } from '@/TexasEngineContext'
import { reduceCanonicalTableSession } from './canonicalTableSession'
import { applyTableCommandThenFlushAllPendingFlowOps } from './applyTableCommand'
import {
  freezeTableStateV1FromLive,
  applyTableCommandWithStateV1,
  assertTableMatchesStateV1Snapshot,
  reduceCanonicalSessionToTableStateV1
} from './tableStateV1'

describe('TableStateV1 (immutable snapshot + trace around live Texas)', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.37)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    TexasEngineContext.reset()
  })

  test('applyTableCommandWithStateV1 chains Call+Check matching imperative', () => {
    const t = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    const p1 = t.room.owner
    const p2 = t.createPlayer({ id: 2, name: 'b' })
    t.room.seat(p1)
    t.room.join(p2)
    t.room.seat(p2)
    t.setPlayerRoles('initial', { buttonUserId: 1 })
    void [...t.start(), ...t.flushAllPendingFlowOps()]
    t.dealCards()

    const prior = freezeTableStateV1FromLive(t)
    const uCall = t.controller.activePlayer!.getUserInfo().id
    const r1 = applyTableCommandWithStateV1(
      t,
      prior,
      { type: 'Call', playerId: uCall },
      { flushAllPending: true }
    )
    const uCheck = t.controller.activePlayer!.getUserInfo().id
    const r2 = applyTableCommandWithStateV1(
      t,
      r1.next,
      { type: 'Check', playerId: uCheck },
      { flushAllPending: true }
    )

    const tRef = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    const a = tRef.room.owner
    const b = tRef.createPlayer({ id: 2, name: 'b' })
    tRef.room.seat(a)
    tRef.room.join(b)
    tRef.room.seat(b)
    tRef.setPlayerRoles('initial', { buttonUserId: 1 })
    void [...tRef.start(), ...tRef.flushAllPendingFlowOps()]
    tRef.dealCards()
    const refCall = tRef.controller.activePlayer!.getUserInfo().id
    const s1 = applyTableCommandThenFlushAllPendingFlowOps(tRef, {
      type: 'Call',
      playerId: refCall
    })
    const refCheck = tRef.controller.activePlayer!.getUserInfo().id
    const s2 = applyTableCommandThenFlushAllPendingFlowOps(tRef, {
      type: 'Check',
      playerId: refCheck
    })
    const imperativeTrace = [...s1.events, ...s2.events]
    const imperativeFinal = captureTableSnapshot(tRef)
    tRef.room.checkIfCloseRoom()
    t.room.checkIfCloseRoom()

    expect(r2.next.eventTrace).toEqual(imperativeTrace)
    expect(r2.next.snapshot).toEqual(imperativeFinal)
    expect(r1.stepEvents).toEqual(s1.events)
    expect(r2.stepEvents).toEqual(s2.events)
  })

  test('assertTableMatchesStateV1Snapshot throws on stale snapshot', () => {
    const t = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    t.room.seat(t.room.owner)
    const prior = freezeTableStateV1FromLive(t)
    const stale = {
      ...prior,
      snapshot: { ...prior.snapshot, handId: 'ghost-hand' }
    }
    expect(() => assertTableMatchesStateV1Snapshot(t, stale)).toThrow(
      /out of sync/
    )
  })

  test('reduceCanonicalSessionToTableStateV1 wraps reduceCanonicalTableSession', () => {
    const session: CanonicalTableSession = {
      create: {
        lowestBetAmount: 1000,
        maximumCountOfPlayers: 7,
        initialChips: 50_000,
        user: { id: 1, name: 'a' }
      },
      bootstrap: [
        { kind: 'seat_owner' },
        { kind: 'join_user', user: { id: 2, name: 'b' } },
        { kind: 'seat_user_by_id', userId: 2 },
        { kind: 'set_player_roles', mode: 'initial', buttonUserId: 1 },
        { kind: 'start_hand' },
        { kind: 'flush_all_pending_flow_ops' },
        { kind: 'deal_cards' }
      ],
      commandSteps: []
    }
    const r = reduceCanonicalTableSession(session)
    const v1 = reduceCanonicalSessionToTableStateV1(session)
    expect(v1.schemaVersion).toBe(1)
    expect(v1.snapshot).toEqual(r.finalSnapshot)
    expect(v1.eventTrace).toEqual(r.events)
  })
})
