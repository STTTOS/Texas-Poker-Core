import type Texas from '@/Texas'
import type { ActionTypeEnum } from '@/Player/constant'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { applyTableCommand } from './applyTableCommand'
import { type TableSnapshot, captureTableSnapshot } from './tableSnapshot'
import { pendingFlowOpsAllowVoluntaryDispatch } from './pendingFlowReadModel'

/**
 * 在 {@link TableSnapshot} 之上增加「当前是否可对活跃玩家下发自愿指令」的读投影，
 * 与 `pendingFlowOps` / `activePlayer` 语义对齐（抢跑防护）。
 */
export type HandReduceProjection = Readonly<
  TableSnapshot & {
    /**
     * 仅当本手进行中、存在行动方、且流程队列为空（思考权已交出）时给出允许列表；
     * 否则为 `null`（此时即便存在 `activePlayer`，也不应下发 Fold/Check 等自愿指令）。
     */
    activeVoluntaryActions: readonly ActionTypeEnum[] | null
  }
>

export type FoldOrCheckTableCommand = Extract<
  TableCommand,
  { type: 'Fold' } | { type: 'Check' }
>

/**
 * 桌上**自愿**意图（不含超时/离场/入座大盲等带特殊语义的变体）。
 * 机器人与单测应优先经此 ADT + {@link applyVoluntaryTableCommand}，而非直接点 `Player` 方法。
 */
export type VoluntaryTableCommand = Extract<
  TableCommand,
  | { type: 'Fold' }
  | { type: 'Check' }
  | { type: 'Call' }
  | { type: 'Bet' }
  | { type: 'Raise' }
  | { type: 'AllIn' }
>

export function isVoluntaryTableCommand(
  cmd: TableCommand
): cmd is VoluntaryTableCommand {
  const t = cmd.type
  return (
    t === 'Fold' ||
    t === 'Check' ||
    t === 'Call' ||
    t === 'Bet' ||
    t === 'Raise' ||
    t === 'AllIn'
  )
}

export function captureHandReduceProjection(
  table: InstanceType<typeof Texas>
): HandReduceProjection {
  const base = captureTableSnapshot(table)
  const ap = table.controller.activePlayer
  const voluntary =
    table.controller.status === 'in_hand' &&
    pendingFlowOpsAllowVoluntaryDispatch(base.pendingFlowOps) &&
    ap != null
      ? ap.getAllowedActions()
      : null
  return { ...base, activeVoluntaryActions: voluntary }
}

/**
 * 自愿指令经 `Texas#dispatchCommand`（零 I/O 委托现有图）+ {@link captureHandReduceProjection}。
 * 长期可替换为纯 `apply(state, cmd) → { state, events }`；当前仍以运行中 `Texas` 为真源。
 */
export function applyVoluntaryTableCommand(
  table: InstanceType<typeof Texas>,
  cmd: VoluntaryTableCommand
): { events: readonly TexasDomainEvent[]; projection: HandReduceProjection } {
  const { events } = applyTableCommand(table, cmd)
  return {
    events,
    projection: captureHandReduceProjection(table)
  }
}

/**
 * {@link applyVoluntaryTableCommand} 在 **Fold / Check** 上的窄化别名。
 */
export function applyFoldOrCheckCommand(
  table: InstanceType<typeof Texas>,
  cmd: FoldOrCheckTableCommand
): { events: readonly TexasDomainEvent[]; projection: HandReduceProjection } {
  return applyVoluntaryTableCommand(table, cmd)
}
