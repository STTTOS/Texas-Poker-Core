import type { RoomStatus } from '@/Room'
import type { Poke } from '@/Deck/constant'
import type { PlayerStatus } from '@/Player'
import type { Role } from '@/Player/constant'
import type { Stage } from '@/Controller/stage'
import type { PendingFlowOp } from '@/Controller'
import type { HandLifecycle } from '@/gameContracts'

import Texas from '@/Texas'

/** 环上玩家只读切片（回放 / 机器人对齐用，非授权变更入口）。 */
export type TablePlayerSnapshot = Readonly<{
  userId: number
  balance: number
  status: PlayerStatus
  role: Role | null
}>

/** 单桌只读快照：由当前 `Texas` 聚合，无 I/O。 */
export type TableSnapshot = Readonly<{
  roomStatus: RoomStatus
  handId: string | null
  handLifecycle: HandLifecycle
  stage: Stage
  potTotal: number
  contributions: ReadonlyArray<Readonly<{ userId: number; amount: number }>>
  communityCards: ReadonlyArray<Poke>
  pendingFlowOps: ReadonlyArray<PendingFlowOp>
  /** 优先 {@link Dealer.getPlayersByActionSequence}；若为空（如尚未定庄）则退化为 `dealer.players` 环序。 */
  players: ReadonlyArray<TablePlayerSnapshot>
}>

/**
 * 从运行中的会话截取可 JSON 化的结构事实，供回放检查点、机器人读盘。
 * 私牌仍只在各 `Player` 内存中，此处**不包含**底牌（与 `HoleCardsDealt` 全量事件分工）。
 */
export function captureTableSnapshot(
  table: InstanceType<typeof Texas>
): TableSnapshot {
  const snap = table.pool.getContributionSnapshot()
  const byAction = table.dealer.getPlayersByActionSequence()
  const ring = byAction.length > 0 ? byAction : table.dealer.players
  const players = ring.map((p) => ({
    userId: p.getUserInfo().id,
    balance: p.balance,
    status: p.getStatus(),
    role: p.getRole() ?? null
  }))

  return {
    roomStatus: table.room.status,
    handId: table.controller.currentHandId,
    handLifecycle: table.controller.status,
    stage: table.controller.stage,
    potTotal: snap.totalAmount,
    contributions: snap.contributions,
    communityCards: table.controller.getRevealedPokes(),
    pendingFlowOps: table.getPendingFlowOps(),
    players
  }
}
