import type { TexasDomainEvent } from '@/domain/handDomainEvents'
import type { CanonicalTableSession } from '@/engine/canonicalTableSession'

import { reduceCanonicalTableSession } from '@/engine/canonicalTableSession'
import {
  type PersistedDomainEventRow,
  domainEventsFromPersistedRows
} from './domainEventPersistence'
import {
  validatePersistedDomainEventRows,
  type DomainEventTapeValidationIssue
} from './domainEventTapeValidation'

export type VerifyCanonicalAgainstTapeResult = Readonly<{
  matches: boolean
  expectedEventCount: number
  actualEventCount: number
  firstDiffIndex: number | null
  tapeIssues: readonly DomainEventTapeValidationIssue[]
  expectedAtDiff: TexasDomainEvent | null
  actualAtDiff: TexasDomainEvent | null
}>

function eventEquals(a: TexasDomainEvent, b: TexasDomainEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 将声明式命令牌谱（canonical session）归约出的事件链，与落盘磁带行还原出的事件链做逐条对拍。
 * Replay-First 下优先保证「命令路径与事件磁带」一致，再谈纯规则重写。
 */
export function verifyCanonicalSessionAgainstPersistedRows(
  session: CanonicalTableSession,
  rows: readonly PersistedDomainEventRow[],
  options?: Readonly<{ validateTape?: boolean }>
): VerifyCanonicalAgainstTapeResult {
  const expected = reduceCanonicalTableSession(session).events
  const tapeIssues =
    options?.validateTape === false
      ? []
      : validatePersistedDomainEventRows(rows)
  const actual = domainEventsFromPersistedRows(rows)

  const max = Math.max(expected.length, actual.length)
  let firstDiffIndex: number | null = null
  for (let i = 0; i < max; i++) {
    const e = expected[i]
    const a = actual[i]
    if (!e || !a || !eventEquals(e, a)) {
      firstDiffIndex = i
      break
    }
  }

  return {
    matches: tapeIssues.length === 0 && firstDiffIndex == null,
    expectedEventCount: expected.length,
    actualEventCount: actual.length,
    firstDiffIndex,
    tapeIssues,
    expectedAtDiff:
      firstDiffIndex == null ? null : expected[firstDiffIndex] ?? null,
    actualAtDiff: firstDiffIndex == null ? null : actual[firstDiffIndex] ?? null
  }
}
