import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import Texas from '@/Texas'
import { captureTableSnapshot } from './tableSnapshot'
import { TexasEngineContext } from '@/TexasEngineContext'
import { projectCompositeReadModel } from '@/replay/projectCompositeReadModel'
import {
  applyTableCommand,
  applyTableCommandThenFlushAllPendingFlowOps
} from './applyTableCommand'
import {
  type CanonicalTableSession,
  reduceCanonicalTableSession,
  parseCanonicalTableSessionFromJson
} from './canonicalTableSession'

describe('reduceCanonicalTableSession (immutable program → events + snapshot clones)', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.37)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    TexasEngineContext.reset()
  })

  test('two runs with same session yield deep-equal events and final snapshot', () => {
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
    const a = reduceCanonicalTableSession(session)
    const b = reduceCanonicalTableSession(session)
    expect(a.events).toEqual(b.events)
    expect(a.finalSnapshot).toEqual(b.finalSnapshot)
    expect(a.snapshotAfterBootstrap).toEqual(b.snapshotAfterBootstrap)
  })

  test('matches imperative Texas path (HU call + check)', () => {
    TexasEngineContext.reset()
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
    const imperativeBootstrapEvents: TexasDomainEvent[] = [
      ...t.setPlayerRoles('initial', { buttonUserId: 1 }),
      ...[...t.start(), ...t.flushAllPendingFlowOps()],
      ...t.dealCards()
    ]
    const uCall = t.controller.activePlayer!.getUserInfo().id
    const step1 = applyTableCommandThenFlushAllPendingFlowOps(t, {
      type: 'Call',
      playerId: uCall
    })
    const uCheck = t.controller.activePlayer!.getUserInfo().id
    const step2 = applyTableCommandThenFlushAllPendingFlowOps(t, {
      type: 'Check',
      playerId: uCheck
    })
    const imperativeEvents = [
      ...imperativeBootstrapEvents,
      ...step1.events,
      ...step2.events
    ]
    const imperativeFinal = captureTableSnapshot(t)
    const imperativeComposite = projectCompositeReadModel(imperativeEvents)
    t.room.checkIfCloseRoom()
    TexasEngineContext.reset()

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
      commandSteps: [
        { cmd: { type: 'Call', playerId: uCall }, flushAllPending: true },
        { cmd: { type: 'Check', playerId: uCheck }, flushAllPending: true }
      ]
    }
    const got = reduceCanonicalTableSession(session)
    expect(got.events).toEqual(imperativeEvents)
    expect(got.finalSnapshot).toEqual(imperativeFinal)
    expect(projectCompositeReadModel(got.events)).toEqual(imperativeComposite)
  })

  test('parseCanonicalTableSessionFromJson round-trips and matches direct reduce', () => {
    const session: CanonicalTableSession = {
      create: {
        lowestBetAmount: 500,
        maximumCountOfPlayers: 7,
        initialChips: 5000,
        user: { id: 1, name: 'a' }
      },
      bootstrap: [
        { kind: 'seat_owner' },
        { kind: 'invite_seat_user', user: { id: 2, name: 'b' } },
        { kind: 'invite_seat_user', user: { id: 3, name: 'c' } },
        { kind: 'set_player_roles', mode: 'initial', buttonUserId: 1 },
        { kind: 'start_hand' },
        { kind: 'flush_pending_turn_handoff' }
      ],
      commandSteps: []
    }
    const json = JSON.stringify({ schemaVersion: 1, ...session })
    const parsed = parseCanonicalTableSessionFromJson(json)
    expect(reduceCanonicalTableSession(parsed)).toEqual(
      reduceCanonicalTableSession(session)
    )
  })

  test('3-max fold path matches imperative (invite_seat_user + single handoff)', () => {
    TexasEngineContext.reset()
    const t = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 7,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    const o = t.room.owner
    const p2 = t.createPlayer({ id: 2, name: 'b' })
    const p3 = t.createPlayer({ id: 3, name: 'c' })
    t.room.seat(o)
    t.room.join(p2)
    t.room.join(p3)
    t.room.seat(p2)
    t.room.seat(p3)
    const imperativeBoot = [
      ...t.setPlayerRoles('initial', { buttonUserId: 1 }),
      ...t.start(),
      ...t.flushPendingTurnHandoff()
    ]
    const uid = t.controller.activePlayer!.getUserInfo().id
    const { events: foldEv } = applyTableCommand(t, {
      type: 'Fold',
      playerId: uid
    })
    const imperativeEvents = [...imperativeBoot, ...foldEv]
    const imperativeFinal = captureTableSnapshot(t)
    t.room.checkIfCloseRoom()
    TexasEngineContext.reset()

    const session: CanonicalTableSession = {
      create: {
        lowestBetAmount: 500,
        maximumCountOfPlayers: 7,
        initialChips: 5000,
        user: { id: 1, name: 'a' }
      },
      bootstrap: [
        { kind: 'seat_owner' },
        { kind: 'invite_seat_user', user: { id: 2, name: 'b' } },
        { kind: 'invite_seat_user', user: { id: 3, name: 'c' } },
        { kind: 'set_player_roles', mode: 'initial', buttonUserId: 1 },
        { kind: 'start_hand' },
        { kind: 'flush_pending_turn_handoff' }
      ],
      commandSteps: [{ cmd: { type: 'Fold', playerId: uid } }]
    }
    const got = reduceCanonicalTableSession(session)
    expect(got.events).toEqual(imperativeEvents)
    expect(got.finalSnapshot).toEqual(imperativeFinal)
  })

  test('parseCanonicalTableSessionFromJson rejects bad JSON', () => {
    expect(() => parseCanonicalTableSessionFromJson('not json')).toThrow(
      /Invalid canonical table session JSON/
    )
    expect(() =>
      parseCanonicalTableSessionFromJson(
        JSON.stringify({
          schemaVersion: 99,
          create: {
            lowestBetAmount: 500,
            maximumCountOfPlayers: 7,
            initialChips: 5000,
            user: { id: 1, name: 'a' }
          },
          bootstrap: [],
          commandSteps: []
        })
      )
    ).toThrow(/schemaVersion/)
  })
})
