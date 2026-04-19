import type { TableCommand } from '@/domain/tableCommand'
import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import Texas from '@/Texas'
import { applyTableCommand } from './applyTableCommand'
import {
  interpret,
  type OrchestrationCtx,
  type DomainEventHandler
} from '@/orchestration/interpret'

/**
 * 文档推荐形态：规则一步 → 事实列表 → 解释器（持久化 / WS / pacing）。
 * @see docs/How to refactor to be side-effect-free/architecture-events-orchestration.md
 */
export async function dispatchCommandAndInterpret(
  table: InstanceType<typeof Texas>,
  cmd: TableCommand,
  ctx: OrchestrationCtx,
  handlers: readonly DomainEventHandler[]
): Promise<readonly TexasDomainEvent[]> {
  const { events } = applyTableCommand(table, cmd)
  await interpretTableEvents(events, ctx, handlers)
  return events
}

/** 对任意已产出的一批领域事件跑解释器管道（回放 / 机器人可复用）。 */
export async function interpretTableEvents(
  events: readonly TexasDomainEvent[],
  ctx: OrchestrationCtx,
  handlers: readonly DomainEventHandler[]
): Promise<void> {
  await interpret([...events], ctx, handlers)
}

/** 消费 `pendingFlowOps` 直至空，返回本段产生的领域事件并可选跑解释器。 */
export async function flushAllPendingFlowOpsAndInterpret(
  table: InstanceType<typeof Texas>,
  ctx: OrchestrationCtx,
  handlers: readonly DomainEventHandler[]
): Promise<readonly TexasDomainEvent[]> {
  const events = table.flushAllPendingFlowOps()
  await interpretTableEvents(events, ctx, handlers)
  return events
}
