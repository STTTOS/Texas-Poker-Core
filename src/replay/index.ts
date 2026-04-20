export type {
  PersistedDomainEventRow,
  DomainEventStore
} from './domainEventPersistence'
export {
  toPersistedDomainEventRows,
  createInMemoryDomainEventStore,
  domainEventsFromPersistedRows
} from './domainEventPersistence'

export {
  appendPersistedRowsToNdjsonFileSync,
  readAllPersistedRowsFromNdjsonFileSync,
  createNdjsonFileDomainEventStore
} from './jsonlAppendOnlyStore'

export { projectCompositeReadModelFromNdjsonFileSync } from './compositeFromNdjson'

export type { DomainEventTapeValidationIssue } from './domainEventTapeValidation'
export {
  validatePersistedDomainEventRows,
  assertPersistedDomainEventRows,
  summarizePersistedDomainEventRows
} from './domainEventTapeValidation'

export type { VerifyCanonicalAgainstTapeResult } from './verifyCanonicalAgainstTape'
export { verifyCanonicalSessionAgainstPersistedRows } from './verifyCanonicalAgainstTape'

export { createAppendDomainEventsHandler } from './appendDomainEventsInterpretHandler'

export type { DomainEventsCompositeReadModel } from './projectCompositeReadModel'
export { projectCompositeReadModel } from './projectCompositeReadModel'
