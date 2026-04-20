import type { PersistedDomainEventRow } from './domainEventPersistence'

export type DomainEventTapeValidationIssue = Readonly<{
  rowIndex: number
  code:
    | 'INVALID_SEQ'
    | 'EVENT_TYPE_MISMATCH'
    | 'ROW_META_MISMATCH'
    | 'DUPLICATE_HAND_SEQ'
    | 'NON_MONOTONIC_HAND_SEQ'
  message: string
}>

export type DomainEventTapeSummary = Readonly<{
  rowCount: number
  tableCount: number
  handCount: number
  sessionEventCount: number
}>

function keyOfHandId(handId: string | null): string {
  return handId ?? '__session__'
}

export function summarizePersistedDomainEventRows(
  rows: readonly PersistedDomainEventRow[]
): DomainEventTapeSummary {
  const tables = new Set<string>()
  const hands = new Set<string>()
  let sessionEventCount = 0
  for (const row of rows) {
    tables.add(row.tableId)
    if (row.handId == null) {
      sessionEventCount++
      continue
    }
    hands.add(row.handId)
  }
  return {
    rowCount: rows.length,
    tableCount: tables.size,
    handCount: hands.size,
    sessionEventCount
  }
}

export function validatePersistedDomainEventRows(
  rows: readonly PersistedDomainEventRow[]
): DomainEventTapeValidationIssue[] {
  const issues: DomainEventTapeValidationIssue[] = []
  const seen = new Set<string>()
  const maxSeqByHand = new Map<string, number>()

  rows.forEach((row, rowIndex) => {
    if (!Number.isInteger(row.seq) || row.seq <= 0) {
      issues.push({
        rowIndex,
        code: 'INVALID_SEQ',
        message: `row.seq must be positive integer, got ${row.seq}`
      })
      return
    }

    const handKey = keyOfHandId(row.handId)
    const dedupeKey = `${handKey}:${row.seq}`
    if (seen.has(dedupeKey)) {
      issues.push({
        rowIndex,
        code: 'DUPLICATE_HAND_SEQ',
        message: `duplicate (handId, seq): (${row.handId ?? 'null'}, ${
          row.seq
        })`
      })
    } else {
      seen.add(dedupeKey)
    }

    const prev = maxSeqByHand.get(handKey)
    if (prev != null && row.seq < prev) {
      issues.push({
        rowIndex,
        code: 'NON_MONOTONIC_HAND_SEQ',
        message: `seq regressed for handId=${
          row.handId ?? 'null'
        }: ${prev} -> ${row.seq}`
      })
    }
    maxSeqByHand.set(handKey, Math.max(prev ?? row.seq, row.seq))

    let event: {
      type?: unknown
      payload?: { handId?: unknown; seq?: unknown }
    }
    try {
      event = JSON.parse(row.payloadJson) as {
        type?: unknown
        payload?: { handId?: unknown; seq?: unknown }
      }
    } catch {
      // JSON 合法性在 readAllPersistedRowsFromNdjsonFileSync 处已保障；此处仅跳过后续一致性检查。
      return
    }

    if (event.type !== row.eventType) {
      issues.push({
        rowIndex,
        code: 'EVENT_TYPE_MISMATCH',
        message: `row.eventType=${row.eventType} but payload.type=${String(
          event.type
        )}`
      })
    }

    const payloadSeq = event.payload?.seq
    const payloadHandId = event.payload?.handId
    const payloadSeqOk =
      typeof payloadSeq === 'number' && Number.isFinite(payloadSeq)
    const payloadHandIdOk =
      payloadHandId === undefined || typeof payloadHandId === 'string'
    if (!payloadSeqOk || !payloadHandIdOk) {
      issues.push({
        rowIndex,
        code: 'ROW_META_MISMATCH',
        message: 'payload meta missing/invalid (seq or handId)'
      })
      return
    }

    const normalizedPayloadHand = payloadHandId ?? null
    if (payloadSeq !== row.seq || normalizedPayloadHand !== row.handId) {
      issues.push({
        rowIndex,
        code: 'ROW_META_MISMATCH',
        message:
          `row(handId=${row.handId ?? 'null'},seq=${row.seq})` +
          ` != payload(handId=${
            normalizedPayloadHand ?? 'null'
          },seq=${payloadSeq})`
      })
    }
  })

  return issues
}

export function assertPersistedDomainEventRows(
  rows: readonly PersistedDomainEventRow[]
): void {
  const issues = validatePersistedDomainEventRows(rows)
  if (issues.length === 0) return
  const preview = issues
    .slice(0, 5)
    .map((i) => `[row ${i.rowIndex + 1}] ${i.code}: ${i.message}`)
    .join('; ')
  throw new Error(
    `Invalid persisted domain event tape (${issues.length}): ${preview}`
  )
}
