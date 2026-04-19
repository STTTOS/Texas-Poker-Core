import type { TexasDomainEvent } from '@/domain/handDomainEvents'
import type {
  OrchestrationCtx,
  DomainEventHandler
} from '@/orchestration/interpret'

import {
  type DomainEventStore,
  toPersistedDomainEventRows
} from './domainEventPersistence'

/**
 * 将单条领域事件映射为一行并 `appendBatch`，供 `interpret` 管道中作为 `handlerPersist` 占位实现。
 * 批量落库可在业务层对 `events` 先 `toPersistedDomainEventRows` 再一次性 `appendBatch`。
 */
export function createAppendDomainEventsHandler(
  tableId: string,
  store: DomainEventStore,
  options?: Readonly<{ correlationId?: string; recordedAtMs?: number }>
): DomainEventHandler {
  return async (_ctx: OrchestrationCtx, event: TexasDomainEvent) => {
    const rows = toPersistedDomainEventRows(tableId, [event], options)
    await Promise.resolve(store.appendBatch(rows))
  }
}
