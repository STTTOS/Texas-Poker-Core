import { domainEventsFromPersistedRows } from './domainEventPersistence'
import { assertPersistedDomainEventRows } from './domainEventTapeValidation'
import { readAllPersistedRowsFromNdjsonFileSync } from './jsonlAppendOnlyStore'
import {
  projectCompositeReadModel,
  type DomainEventsCompositeReadModel
} from './projectCompositeReadModel'

/**
 * 读 NDJSON 磁带 → 领域事件 → 只读复合投影（阶段 6 读侧重放；**非**全量 `reduce(apply)` 状态机）。
 */
export function projectCompositeReadModelFromNdjsonFileSync(
  filePath: string,
  options?: Readonly<{ validateTape?: boolean }>
): DomainEventsCompositeReadModel {
  const rows = readAllPersistedRowsFromNdjsonFileSync(filePath)
  if (options?.validateTape !== false) {
    assertPersistedDomainEventRows(rows)
  }
  return projectCompositeReadModel(domainEventsFromPersistedRows(rows))
}
