import type Texas from '@/Texas'
import type { ActionTypeEnum } from '@/Player/constant'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { applyTableCommand } from './applyTableCommand'
import { type TableSnapshot, captureTableSnapshot } from './tableSnapshot'

/**
 * 在 {@link TableSnapshot} 之上增加「当前是否可对活跃玩家下发自愿指令」的读投影，
 * 与 `pendingFlowOps` / `PLAYER_DISPATCH_TURN_NOT_OFFERED` 语义对齐（抢跑防护）。
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

export function captureHandReduceProjection(
  table: InstanceType<typeof Texas>
): HandReduceProjection {
  const base = captureTableSnapshot(table)
  const pending = base.pendingFlowOps.length
  const ap = table.controller.activePlayer
  const voluntary =
    table.controller.status === 'in_hand' && pending === 0 && ap != null
      ? ap.getAllowedActions()
      : null
  return { ...base, activeVoluntaryActions: voluntary }
}

/**
 * 命令路径雏形：自愿 **Fold / Check** 统一经 `Texas#dispatchCommand`，再截取读投影。
 * 长期可替换为纯 `apply(state, cmd) → { state, events }`；当前仍以运行中 `Texas` 为真源。
 */
export function applyFoldOrCheckCommand(
  table: InstanceType<typeof Texas>,
  cmd: FoldOrCheckTableCommand
): { events: readonly TexasDomainEvent[]; projection: HandReduceProjection } {
  const { events } = applyTableCommand(table, cmd)
  return {
    events,
    projection: captureHandReduceProjection(table)
  }
}
