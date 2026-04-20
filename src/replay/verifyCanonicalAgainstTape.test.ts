import type { CanonicalTableSession } from '@/engine/canonicalTableSession'

import { TexasEngineContext } from '@/TexasEngineContext'
import { toPersistedDomainEventRows } from './domainEventPersistence'
import { reduceCanonicalTableSession } from '@/engine/canonicalTableSession'
import { verifyCanonicalSessionAgainstPersistedRows } from './verifyCanonicalAgainstTape'

describe('verifyCanonicalSessionAgainstPersistedRows', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.37)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    TexasEngineContext.reset()
  })

  function buildSession(): CanonicalTableSession {
    return {
      create: {
        lowestBetAmount: 500,
        maximumCountOfPlayers: 7,
        initialChips: 5000,
        user: { id: 1, name: 'a' }
      },
      bootstrap: [
        { kind: 'seat_owner' },
        { kind: 'invite_seat_user', user: { id: 2, name: 'b' } },
        { kind: 'set_player_roles', mode: 'initial', buttonUserId: 1 },
        { kind: 'start_hand' },
        { kind: 'flush_pending_turn_handoff' }
      ],
      commandSteps: []
    }
  }

  test('matches when tape rows come from same canonical session', () => {
    const session = buildSession()
    const expected = reduceCanonicalTableSession(session).events
    const rows = toPersistedDomainEventRows('t1', expected)
    const out = verifyCanonicalSessionAgainstPersistedRows(session, rows)
    expect(out.matches).toBe(true)
    expect(out.firstDiffIndex).toBeNull()
    expect(out.expectedEventCount).toBe(out.actualEventCount)
  })

  test('detects first diff when tape has modified event payload', () => {
    const session = buildSession()
    const expected = reduceCanonicalTableSession(session).events
    const rows = toPersistedDomainEventRows('t1', expected)
    rows[0] = {
      ...rows[0],
      payloadJson: JSON.stringify({
        ...(JSON.parse(rows[0].payloadJson) as object),
        payload: { seq: 999 }
      })
    }
    const out = verifyCanonicalSessionAgainstPersistedRows(session, rows, {
      validateTape: false
    })
    expect(out.matches).toBe(false)
    expect(out.firstDiffIndex).toBe(0)
    expect(out.expectedAtDiff).not.toBeNull()
    expect(out.actualAtDiff).not.toBeNull()
  })

  test('reports tape validation issues by default', () => {
    const session = buildSession()
    const expected = reduceCanonicalTableSession(session).events
    const rows = toPersistedDomainEventRows('t1', expected)
    rows[0] = {
      ...rows[0],
      eventType: 'HandEnded'
    }
    const out = verifyCanonicalSessionAgainstPersistedRows(session, rows)
    expect(out.matches).toBe(false)
    expect(out.tapeIssues.length).toBeGreaterThan(0)
  })
})
