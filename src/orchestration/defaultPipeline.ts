import type { OrchestrationCtx, DomainEventHandler } from './interpret'

/**
 * 业务侧默认三段式管道占位（持久化 → 推送 → 节奏），与文档阶段 3～4 对齐。
 * 接入方用真实实现替换或插入中间件；单测可传空数组。
 */
export function createDefaultPipelineHandlers(ctx: OrchestrationCtx): {
  persist: DomainEventHandler
  notify: DomainEventHandler
  pacing: DomainEventHandler
} {
  void ctx
  const persist: DomainEventHandler = async () => {}
  const notify: DomainEventHandler = async () => {}
  const pacing: DomainEventHandler = async () => {}
  return { persist, notify, pacing }
}

/** 将默认管道展平为 `interpret` 所需的顺序数组。 */
export function defaultPipelineOrdered(
  ctx: OrchestrationCtx
): readonly DomainEventHandler[] {
  const { persist, notify, pacing } = createDefaultPipelineHandlers(ctx)
  return [persist, notify, pacing]
}
