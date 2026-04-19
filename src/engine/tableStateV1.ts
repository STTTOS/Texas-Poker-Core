import type Texas from '@/Texas'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'
import type { CanonicalTableSession } from './canonicalTableSession'

import { type TableSnapshot, captureTableSnapshot } from './tableSnapshot'
import {
  cloneTableSnapshot,
  reduceCanonicalTableSession
} from './canonicalTableSession'
import {
  applyTableCommand,
  applyTableCommandThenFlushAllPendingFlowOps
} from './applyTableCommand'

/** 与 wish / 磁带字段对齐；演进时递增。 */
export const TABLE_STATE_V1_SCHEMA_VERSION = 1 as const

/**
 * **迁移期**「不可变桌态」切片：深克隆快照 + 自该快照以来（由调用方约定）的领域事件轨迹。
 * 真源仍是可变 `Texas`；本类型供回包、落盘、对拍，**不**单独还原完整对象图（私牌等仍依赖事件或 live 桌）。
 */
export type TableStateV1 = Readonly<{
  schemaVersion: typeof TABLE_STATE_V1_SCHEMA_VERSION
  snapshot: TableSnapshot
  eventTrace: readonly TexasDomainEvent[]
}>

export type ApplyTableCommandWithStateV1Result = Readonly<{
  next: TableStateV1
  stepEvents: readonly TexasDomainEvent[]
}>

function snapshotsDeepEqual(a: TableSnapshot, b: TableSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 在单步 `apply` 前校验：`prior.snapshot` 与当前 `Texas` 投影一致，避免分叉真源。
 */
export function assertTableMatchesStateV1Snapshot(
  table: InstanceType<typeof Texas>,
  prior: TableStateV1
): void {
  const cur = captureTableSnapshot(table)
  if (!snapshotsDeepEqual(cur, prior.snapshot)) {
    throw new Error(
      'TableStateV1.snapshot out of sync with live Texas; refuse applyTableCommandWithStateV1'
    )
  }
}

/** 从当前桌截取检查点（事件轨迹为空，由后续 `applyTableCommandWithStateV1` 追加）。 */
export function freezeTableStateV1FromLive(
  table: InstanceType<typeof Texas>
): TableStateV1 {
  return {
    schemaVersion: TABLE_STATE_V1_SCHEMA_VERSION,
    snapshot: cloneTableSnapshot(captureTableSnapshot(table)),
    eventTrace: []
  }
}

/** 声明式整段归约后的终态包（事件轨迹 = 全程）。 */
export function reduceCanonicalSessionToTableStateV1(
  session: CanonicalTableSession
): TableStateV1 {
  const r = reduceCanonicalTableSession(session)
  return {
    schemaVersion: TABLE_STATE_V1_SCHEMA_VERSION,
    snapshot: cloneTableSnapshot(r.finalSnapshot),
    eventTrace: [...r.events]
  }
}

/**
 * 向「`apply(state, cmd) → { state', events }`」对齐的单步 API：**输入/输出**均为不可变 `TableStateV1` 与事件；
 * 仍**委托**可变 `Texas` 执行规则（迁移期）。
 */
export function applyTableCommandWithStateV1(
  table: InstanceType<typeof Texas>,
  prior: TableStateV1,
  cmd: TableCommand,
  opts?: Readonly<{ flushAllPending?: boolean }>
): ApplyTableCommandWithStateV1Result {
  assertTableMatchesStateV1Snapshot(table, prior)
  const r = opts?.flushAllPending
    ? applyTableCommandThenFlushAllPendingFlowOps(table, cmd)
    : applyTableCommand(table, cmd)
  return {
    next: {
      schemaVersion: TABLE_STATE_V1_SCHEMA_VERSION,
      snapshot: cloneTableSnapshot(r.snapshotAfter),
      eventTrace: [...prior.eventTrace, ...r.events]
    },
    stepEvents: r.events
  }
}
