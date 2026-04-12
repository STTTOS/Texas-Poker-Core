import type { TexasDomainEvent } from '@/domain/handDomainEvents'

/**
 * 业务侧编排上下文（房间 id、DB、WS 等由接入方扩展）。
 * 阶段 2：占位；阶段 3+ 在 handler 内接持久化/推送。
 */
export type OrchestrationCtx = Record<string, unknown>

/**
 * 消费 {@link Texas#drainDomainEvents} 产出的一条领域事件。
 */
export type DomainEventHandler = (
  ctx: OrchestrationCtx,
  event: TexasDomainEvent
) => void | Promise<void>

/**
 * 顺序执行 handler 管道（阶段 2 雏形）。
 * 线上可配置为 `[persist, notify, pacing]`；单测可传 `[]` 或 mock。
 */
export async function interpret(
  events: readonly TexasDomainEvent[],
  ctx: OrchestrationCtx,
  handlers: readonly DomainEventHandler[]
): Promise<void> {
  for (const event of events) {
    for (const handler of handlers) {
      await handler(ctx, event)
    }
  }
}
