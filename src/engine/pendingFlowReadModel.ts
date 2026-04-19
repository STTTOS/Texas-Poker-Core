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
