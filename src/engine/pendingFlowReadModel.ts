import type { PendingFlowOpKind } from '@/Controller'

/**
 * 与 {@link captureHandReduceProjection} 对齐：**队列为空**时才允许对当前行动方下发自愿指令（防 HTTP 抢跑）。
 */
export function pendingFlowOpsAllowVoluntaryDispatch(
  ops: readonly PendingFlowOpKind[]
): boolean {
  return ops.length === 0
}

/** FIFO 队头（只读快照；不改变 `Controller` 状态）。 */
export function peekPendingFlowOp(
  ops: readonly PendingFlowOpKind[]
): PendingFlowOpKind | undefined {
  return ops[0]
}

/**
 * 纯模拟出队：若队头与 `expected` 一致则返回去掉队头的新队列与 `matched: true`；
 * 否则原样返回且 `matched: false`（与 `applyPendingStageAdvance` / `flushPendingTurnHandoff` 的队头校验同构，**无副作用**）。
 */
export function simulateDequeuePendingHeadIfMatches(
  ops: readonly PendingFlowOpKind[],
  expected: PendingFlowOpKind
): { readonly queue: readonly PendingFlowOpKind[]; matched: boolean } {
  if (ops.length === 0 || ops[0] !== expected) {
    return { queue: ops, matched: false }
  }
  return { queue: ops.slice(1), matched: true }
}
