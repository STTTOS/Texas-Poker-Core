/**
 * Node-only：含 `fs` / `path` 的 NDJSON 磁带读写。
 * 仅供本仓库 replay CLI / Jest 使用；**不**从包根或 `replay/index` 导出，故不会进入 RN 依赖图。
 * npm 包也不声明此路径为公共入口；外部工程请用 `toPersistedDomainEventRows` 等自行接存储。
 */
export {
  appendPersistedRowsToNdjsonFileSync,
  readAllPersistedRowsFromNdjsonFileSync,
  createNdjsonFileDomainEventStore
} from './jsonlAppendOnlyStore'
export { projectCompositeReadModelFromNdjsonFileSync } from './compositeFromNdjson'
