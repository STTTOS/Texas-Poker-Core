import type {
  DomainEventStore,
  PersistedDomainEventRow
} from '../domainEventPersistence'

import fs from 'node:fs'
import path from 'node:path'

/**
 * 将持久化行 **追加** 到 NDJSON 文件（一行一条 JSON，适合牌谱磁带 / 本地 append-only）。
 * 不就地改写历史行；删除或修正应通过新文件或业务层补偿事件。
 *
 * **仅 Node**：依赖 `fs`；由本仓库 `replay` CLI / 测试引用，不经包根导出。
 */
export function appendPersistedRowsToNdjsonFileSync(
  filePath: string,
  rows: readonly PersistedDomainEventRow[]
): void {
  if (rows.length === 0) return
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const chunk = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`
  fs.appendFileSync(filePath, chunk, 'utf8')
}

/**
 * 按文件行序读出全部行（与 {@link appendPersistedRowsToNdjsonFileSync} 配对）。
 */
export function readAllPersistedRowsFromNdjsonFileSync(
  filePath: string
): PersistedDomainEventRow[] {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as PersistedDomainEventRow
    } catch {
      throw new Error(`Invalid NDJSON at ${filePath}:${i + 1}`)
    }
  })
}

/** 文件后端 {@link DomainEventStore}，仅追加。 */
export function createNdjsonFileDomainEventStore(
  filePath: string
): DomainEventStore {
  return {
    appendBatch(batch) {
      appendPersistedRowsToNdjsonFileSync(filePath, batch)
    }
  }
}
