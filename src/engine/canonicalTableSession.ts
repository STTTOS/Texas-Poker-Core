import type Player from '@/Player'
import type { User } from '@/Player'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import Texas, { type CreateRoomInputArgs } from '@/Texas'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { type TableSnapshot, captureTableSnapshot } from './tableSnapshot'
import {
  applyTableCommand,
  applyTableCommandThenFlushAllPendingFlowOps
} from './applyTableCommand'

/**
 * 将 `TableSnapshot` 深拷贝为调用方可长期持有的值（与桌上可变图解耦）。
 * 使用 `structuredClone`（Node 18+ / 现代浏览器）。
 */
export function cloneTableSnapshot(snapshot: TableSnapshot): TableSnapshot {
  return structuredClone(snapshot) as TableSnapshot
}

/** 开桌到「可下发 `TableCommand`」前的**数据化**编排（无 I/O）。 */
export type BootstrapInstruction =
  | { readonly kind: 'seat_owner' }
  /** `createPlayer` + `room.join`（尚未入座）。 */
  | { readonly kind: 'join_user'; readonly user: User }
  /** 须已 `join_user` 且 `userId` 对应玩家存在。 */
  | { readonly kind: 'seat_user_by_id'; readonly userId: number }
  | { readonly kind: 'set_button'; readonly userId: number }
  /** `mode === 'initial'` 时可传 `buttonUserId`，等价 `Texas.setPlayerRoles('initial', { buttonUserId })`（确定性定庄）。 */
  | {
      readonly kind: 'set_player_roles'
      readonly mode: 'initial' | 'rearrange'
      readonly buttonUserId?: number
    }
  | { readonly kind: 'start_hand' }
  | { readonly kind: 'flush_all_pending_flow_ops' }
  | { readonly kind: 'deal_cards' }

/** 单步指令；可选在本步末尾 `flushAllPendingFlowOps`（与单测/机器人零延迟语义对齐）。 */
export type CommandStepInstruction = Readonly<{
  cmd: TableCommand
  flushAllPending?: boolean
}>

/**
 * **声明式**一桌会话：创建参数 + 开桌脚本 + 指令序列。
 * 作为「不可变程序状态」输入 {@link reduceCanonicalTableSession}，得到事件与快照归约结果，
 * 而不在 API 层暴露 {@link Texas}（实现仍委托现有可变图，属迁移期桥接）。
 */
export type CanonicalTableSession = Readonly<{
  create: Readonly<CreateRoomInputArgs>
  bootstrap: readonly BootstrapInstruction[]
  commandSteps: readonly CommandStepInstruction[]
}>

export type ReduceCanonicalTableSessionResult = Readonly<{
  /** bootstrap 与各 `commandSteps` 产出的领域事件按执行顺序拼接 */
  events: readonly TexasDomainEvent[]
  snapshotAfterBootstrap: TableSnapshot
  /** 每步指令后的快照克隆（长度 = `commandSteps.length`） */
  snapshotsAfterCommands: readonly TableSnapshot[]
  finalSnapshot: TableSnapshot
}>

function playerByUserId(
  table: InstanceType<typeof Texas>,
  userId: number
): InstanceType<typeof Player> {
  const p =
    table.room.getPlayerById(userId) ??
    table.dealer.players.find((x) => x.getUserInfo().id === userId)
  if (!p) {
    table.handleError(
      new TexasError(TexasCoreErrorCode.SESSION_DISPATCH_PLAYER_NOT_FOUND, {
        playerId: userId
      })
    )
  }
  return p
}

function runBootstrapOp(
  table: InstanceType<typeof Texas>,
  op: BootstrapInstruction
): readonly TexasDomainEvent[] {
  switch (op.kind) {
    case 'seat_owner':
      table.room.seat(table.room.owner)
      return []
    case 'join_user': {
      const p = table.createPlayer(op.user)
      table.room.join(p)
      return []
    }
    case 'seat_user_by_id': {
      const p = playerByUserId(table, op.userId)
      table.room.seat(p)
      return []
    }
    case 'set_button': {
      const p = playerByUserId(table, op.userId)
      table.dealer.setButton(p)
      return []
    }
    case 'set_player_roles':
      return table.setPlayerRoles(
        op.mode,
        op.mode === 'initial' && op.buttonUserId != null
          ? { buttonUserId: op.buttonUserId }
          : undefined
      )
    case 'start_hand':
      return table.start()
    case 'flush_all_pending_flow_ops':
      return table.flushAllPendingFlowOps()
    case 'deal_cards':
      return table.dealCards()
  }
}

/**
 * **纯函数 API**（对调用方无可见副作用）：给定声明式 `session`，在进程内临时构造 `Texas`、
 * 执行 bootstrap 与每步 `TableCommand`，返回事件链与**快照克隆**。
 *
 * - 不返回 `Texas` 引用；`finalSnapshot` 等为 {@link cloneTableSnapshot} 结果。
 * - 实现仍依赖可变对象图；与文档「全量不可变 `State` + 零对象图」之间差一层序列化真源，见路线图。
 */
export function reduceCanonicalTableSession(
  session: CanonicalTableSession
): ReduceCanonicalTableSessionResult {
  TexasEngineContext.reset()
  let table: InstanceType<typeof Texas> | undefined
  const events: TexasDomainEvent[] = []
  try {
    table = new Texas(session.create)
    for (const op of session.bootstrap) {
      events.push(...runBootstrapOp(table, op))
    }
    const snapshotAfterBootstrap = cloneTableSnapshot(
      captureTableSnapshot(table)
    )
    const snapshotsAfterCommands: TableSnapshot[] = []
    for (const step of session.commandSteps) {
      const r = step.flushAllPending
        ? applyTableCommandThenFlushAllPendingFlowOps(table, step.cmd)
        : applyTableCommand(table, step.cmd)
      events.push(...r.events)
      snapshotsAfterCommands.push(cloneTableSnapshot(r.snapshotAfter))
    }
    return {
      events,
      snapshotAfterBootstrap,
      snapshotsAfterCommands,
      finalSnapshot: cloneTableSnapshot(captureTableSnapshot(table))
    }
  } finally {
    table?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
  }
}
