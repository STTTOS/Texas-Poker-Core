import type { CanonicalTableSession } from '@/engine/canonicalTableSession'

import { TexasEngineContext } from '@/TexasEngineContext'
import { toPersistedDomainEventRows } from './domainEventPersistence'
import { reduceCanonicalTableSession } from '@/engine/canonicalTableSession'
import {
  resolveReplayVerifyExitCode,
  toCompactVerifyCanonicalAgainstTapeResult,
  verifyCanonicalSessionAgainstPersistedRows
} from './verifyCanonicalAgainstTape'

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
    expect(out.diffContext).toBeNull()
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
    expect(out.diffContext?.index).toBe(0)
    expect(out.diffContext?.expected).not.toBeNull()
    expect(out.diffContext?.actual).not.toBeNull()
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
    expect(out.firstDiffIndex).toBeNull()
    expect(out.diffContext).toBeNull()
  })

  test('toCompactVerifyCanonicalAgainstTapeResult returns concise payload', () => {
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
    const compact = toCompactVerifyCanonicalAgainstTapeResult(out)
    expect(compact.matches).toBe(false)
    expect(compact.firstDiffIndex).toBe(0)
    expect(compact.tapeIssueCount).toBe(0)
    expect(compact.diffContext?.index).toBe(0)
  })

  test('resolveReplayVerifyExitCode supports tape_issues_only policy', () => {
    const session = buildSession()
    const expected = reduceCanonicalTableSession(session).events
    const rowsWithSemanticDiff = toPersistedDomainEventRows('t1', expected)
    rowsWithSemanticDiff[0] = {
      ...rowsWithSemanticDiff[0],
      payloadJson: JSON.stringify({
        ...(JSON.parse(rowsWithSemanticDiff[0].payloadJson) as object),
        payload: { seq: 999 }
      })
    }
    const semanticDiff = verifyCanonicalSessionAgainstPersistedRows(
      session,
      rowsWithSemanticDiff,
      { validateTape: false }
    )
    expect(resolveReplayVerifyExitCode(semanticDiff, 'strict')).toBe(2)
    expect(resolveReplayVerifyExitCode(semanticDiff, 'tape_issues_only')).toBe(
      0
    )

    const rowsWithTapeIssue = toPersistedDomainEventRows('t1', expected)
    rowsWithTapeIssue[0] = { ...rowsWithTapeIssue[0], eventType: 'HandEnded' }
    const tapeIssue = verifyCanonicalSessionAgainstPersistedRows(
      session,
      rowsWithTapeIssue
    )
    expect(resolveReplayVerifyExitCode(tapeIssue, 'strict')).toBe(2)
    expect(resolveReplayVerifyExitCode(tapeIssue, 'tape_issues_only')).toBe(2)
  })
})
