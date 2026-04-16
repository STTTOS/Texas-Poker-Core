import type { TexasDomainEvent } from '@/domain/handDomainEvents'

/**
 * 单行落库形状，便于 wish 用 Prisma `create`（`Json` 存 payload、`BigInt`/`String` 存 tableId 等按你们表设计映射）。
 * **思考时长、用户何时点按钮**：Core 不产 wall-clock；在写入本行时由业务填 `recordedAtMs`（或 DB `createdAt`），
 * 回放 UI 用相邻两行时间差还原「想了多久」；规则重放仅用 `handId`+`seq`+`payloadJson` 即可。
 */
export type PersistedDomainEventRow = Readonly<{
  tableId: string
  /** 会话级事件为 null；本手事件同 {@link HandEventMeta.handId} */
  handId: string | null
  seq: number
  eventType: TexasDomainEvent['type']
  /** `JSON.stringify(TexasDomainEvent)`，反序列化后与 Core drain 结果一致 */
  payloadJson: string
  /** 业务写入时刻（毫秒）；可选，纯状态重放可不存 */
  recordedAtMs?: number
  correlationId?: string
}>

/** wish 侧 Prisma / HTTP 适配器实现。 */
export interface DomainEventStore {
  appendBatch(rows: readonly PersistedDomainEventRow[]): void | Promise<void>
}

function handIdAndSeq(event: TexasDomainEvent): {
  handId: string | null
  seq: number
} {
  const p = event.payload as { handId?: string; seq: number }
  const handId = 'handId' in p && typeof p.handId === 'string' ? p.handId : null
  return { handId, seq: p.seq }
}

/** 将一批领域事件转为可持久化行（默认同一 `recordedAtMs` / `correlationId`；需逐条时间则循环调用并自行填时间）。 */
export function toPersistedDomainEventRows(
  tableId: string,
  events: readonly TexasDomainEvent[],
  options?: Readonly<{ correlationId?: string; recordedAtMs?: number }>
): PersistedDomainEventRow[] {
  return events.map((event) => {
    const { handId, seq } = handIdAndSeq(event)
    return {
      tableId,
      handId,
      seq,
      eventType: event.type,
      payloadJson: JSON.stringify(event),
      recordedAtMs: options?.recordedAtMs,
      correlationId: options?.correlationId
    }
  })
}

export function createInMemoryDomainEventStore(): {
  store: DomainEventStore
  getRows: () => PersistedDomainEventRow[]
} {
  const rows: PersistedDomainEventRow[] = []
  return {
    store: {
      appendBatch(batch) {
        rows.push(...batch)
      }
    },
    getRows: () => [...rows]
  }
}
