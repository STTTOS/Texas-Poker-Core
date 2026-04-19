import type Player from '@/Player'
import type { User } from '@/Player'
import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import Texas, { type CreateRoomInputArgs } from '@/Texas'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'
import { parseTableCommandFromUnknown } from '@/domain/tableCommandParse'
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
  /** `createPlayer` + `join` + `seat` 一步完成（常见加人上桌）。 */
  | { readonly kind: 'invite_seat_user'; readonly user: User }
  /** 须已 `join_user` 且 `userId` 对应玩家存在。 */
  | { readonly kind: 'seat_user_by_id'; readonly userId: number }
  | { readonly kind: 'set_button'; readonly userId: number }
  /** `mode === 'initial'` 时可传 `buttonUserId`，等价 `Texas.setPlayerRoles('initial', { buttonUserId })`（确定性定庄）。 */
  | {
      readonly kind: 'set_player_roles'
      readonly mode: 'initial' | 'rearrange'
      readonly buttonUserId?: number
    }
  /** 局间 `reset` 后须再锁座才能 `start`；与 `set_player_roles` 内锁座不同。 */
  | { readonly kind: 'lock_seats' }
  | { readonly kind: 'unlock_seats' }
  /** 奖池/控制器/荷官/会话缓冲清零并 `unlockSeats`（见 {@link Texas#reset}）。 */
  | { readonly kind: 'reset_session' }
  | { readonly kind: 'start_hand' }
  | { readonly kind: 'flush_pending_turn_handoff' }
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

/** 与 `*.canonical.json` 磁带对齐；未知版本可拒绝解析。 */
export const CANONICAL_TABLE_SESSION_JSON_SCHEMA_VERSION = 1 as const

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
    case 'invite_seat_user': {
      const p = table.createPlayer(op.user)
      table.room.join(p)
      table.room.seat(p)
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
    case 'lock_seats':
      table.lockSeats()
      return []
    case 'unlock_seats':
      table.unlockSeats()
      return []
    case 'reset_session':
      table.reset()
      return []
    case 'start_hand':
      return table.start()
    case 'flush_pending_turn_handoff':
      return table.flushPendingTurnHandoff()
    case 'flush_all_pending_flow_ops':
      return table.flushAllPendingFlowOps()
    case 'deal_cards':
      return table.dealCards()
    default: {
      const _never: never = op
      return _never
    }
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function isUser(x: unknown): x is User {
  if (!isRecord(x)) return false
  return typeof x.id === 'number' && typeof x.name === 'string'
}

function invalidCanonicalJson(message: string): never {
  throw new Error(`Invalid canonical table session JSON: ${message}`)
}

function parseCreateRoomInputArgs(raw: unknown): CreateRoomInputArgs {
  if (!isRecord(raw)) invalidCanonicalJson('create must be an object')
  if (typeof raw.lowestBetAmount !== 'number')
    invalidCanonicalJson('create.lowestBetAmount must be a number')
  if (typeof raw.maximumCountOfPlayers !== 'number')
    invalidCanonicalJson('create.maximumCountOfPlayers must be a number')
  if (typeof raw.initialChips !== 'number')
    invalidCanonicalJson('create.initialChips must be a number')
  if (!isUser(raw.user))
    invalidCanonicalJson('create.user must be { id, name }')
  return {
    lowestBetAmount: raw.lowestBetAmount,
    maximumCountOfPlayers: raw.maximumCountOfPlayers,
    initialChips: raw.initialChips,
    user: raw.user
  }
}

function parseBootstrapInstruction(raw: unknown): BootstrapInstruction {
  if (!isRecord(raw) || typeof raw.kind !== 'string') {
    invalidCanonicalJson(
      'each bootstrap step must be an object with string kind'
    )
  }
  switch (raw.kind) {
    case 'seat_owner':
      return { kind: 'seat_owner' }
    case 'join_user':
      if (!isUser(raw.user)) invalidCanonicalJson('join_user.user invalid')
      return { kind: 'join_user', user: raw.user }
    case 'invite_seat_user':
      if (!isUser(raw.user))
        invalidCanonicalJson('invite_seat_user.user invalid')
      return { kind: 'invite_seat_user', user: raw.user }
    case 'seat_user_by_id':
      if (typeof raw.userId !== 'number')
        invalidCanonicalJson('seat_user_by_id.userId must be a number')
      return { kind: 'seat_user_by_id', userId: raw.userId }
    case 'set_button':
      if (typeof raw.userId !== 'number')
        invalidCanonicalJson('set_button.userId must be a number')
      return { kind: 'set_button', userId: raw.userId }
    case 'set_player_roles': {
      if (raw.mode !== 'initial' && raw.mode !== 'rearrange') {
        invalidCanonicalJson(
          'set_player_roles.mode must be initial | rearrange'
        )
      }
      const buttonUserId =
        typeof raw.buttonUserId === 'number' ? raw.buttonUserId : undefined
      return {
        kind: 'set_player_roles',
        mode: raw.mode,
        ...(buttonUserId != null ? { buttonUserId } : {})
      }
    }
    case 'lock_seats':
      return { kind: 'lock_seats' }
    case 'unlock_seats':
      return { kind: 'unlock_seats' }
    case 'reset_session':
      return { kind: 'reset_session' }
    case 'start_hand':
      return { kind: 'start_hand' }
    case 'flush_pending_turn_handoff':
      return { kind: 'flush_pending_turn_handoff' }
    case 'flush_all_pending_flow_ops':
      return { kind: 'flush_all_pending_flow_ops' }
    case 'deal_cards':
      return { kind: 'deal_cards' }
    default:
      invalidCanonicalJson(`unknown bootstrap kind: ${String(raw.kind)}`)
  }
}

function parseCommandStep(raw: unknown): CommandStepInstruction {
  if (!isRecord(raw)) {
    invalidCanonicalJson(
      'each command step must be { cmd: { ... }, flushAllPending? }'
    )
  }
  let cmd: TableCommand
  try {
    cmd = parseTableCommandFromUnknown(raw.cmd)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    invalidCanonicalJson(`commandSteps[].cmd: ${msg}`)
  }
  return {
    cmd,
    flushAllPending: raw.flushAllPending === true
  }
}

/**
 * 解析命令级牌谱 JSON（UTF-8）。形状与 {@link CanonicalTableSession} 一致，可选顶层 `schemaVersion`（当前仅 `1`）。
 * 解析失败抛带前缀 `Invalid canonical table session JSON:` 的 {@link Error}。
 */
export function parseCanonicalTableSessionFromJson(
  json: string
): CanonicalTableSession {
  let root: unknown
  try {
    root = JSON.parse(json) as unknown
  } catch {
    invalidCanonicalJson('not valid JSON')
  }
  if (!isRecord(root)) {
    invalidCanonicalJson('root must be an object')
  }
  const ver = root.schemaVersion
  if (
    ver !== undefined &&
    ver !== CANONICAL_TABLE_SESSION_JSON_SCHEMA_VERSION
  ) {
    invalidCanonicalJson(
      `unsupported schemaVersion (expected ${CANONICAL_TABLE_SESSION_JSON_SCHEMA_VERSION})`
    )
  }
  if (!Array.isArray(root.bootstrap) || !Array.isArray(root.commandSteps)) {
    invalidCanonicalJson('bootstrap and commandSteps must be arrays')
  }
  const create = parseCreateRoomInputArgs(root.create)
  const bootstrap = root.bootstrap.map(parseBootstrapInstruction)
  const commandSteps = root.commandSteps.map(parseCommandStep)
  return { create, bootstrap, commandSteps }
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
