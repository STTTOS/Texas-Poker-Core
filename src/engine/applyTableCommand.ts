import type Texas from '@/Texas'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { flatConcatDomainEvents } from './domainEventReadModel'
import { type TableSnapshot, captureTableSnapshot } from './tableSnapshot'

/**
 * 向「`apply(state, cmd) → { state', events[] }`、领域零 I/O」对齐的单步结果。
 * - **零 I/O**：同步、不访问网络/磁盘/时钟；仅变更内存中的 `Texas` 图并返回事实与读快照。
 * - **真源**：仍委托 {@link Texas#dispatchCommand}；编排层在返回后按需 `flush*` / `drain`。
 */
export type ApplyTableCommandResult = Readonly<{
  events: readonly TexasDomainEvent[]
  /** 本步提交后的只读桌况（可变图上的投影，非独立不可变 state 机） */
  snapshotAfter: TableSnapshot
}>

export function applyTableCommand(
  table: InstanceType<typeof Texas>,
  cmd: TableCommand
): ApplyTableCommandResult {
  const events = table.dispatchCommand(cmd)
  return {
    events,
    snapshotAfter: captureTableSnapshot(table)
  }
}

/**
 * `dispatchCommand` 后立刻 {@link Texas#flushAllPendingFlowOps}（无 sleep），
 * 事件带为两段拼接；适合单测 / 机器人零延迟；线上仍可分步 + pacing。
 */
export function applyTableCommandThenFlushAllPendingFlowOps(
  table: InstanceType<typeof Texas>,
  cmd: TableCommand
): ApplyTableCommandResult {
  const step = table.dispatchCommand(cmd)
  const flushed = table.flushAllPendingFlowOps()
  return {
    events: flatConcatDomainEvents([step, flushed]),
    snapshotAfter: captureTableSnapshot(table)
  }
}
