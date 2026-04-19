import type { TexasDomainEvent } from '@/domain/handDomainEvents'

/**
 * 由领域事件投影的中央池读模型（仅消费 `PotUpdated` 事实；与 {@link Pool} 展示口径对齐的起点）。
 * 纯函数、零 I/O，供回放 / 机器人 / 与 `TableSnapshot` 对拍。
 */
export type PotContributionReadModel = Readonly<{
  totalAmount: number
  contributions: ReadonlyArray<Readonly<{ userId: number; amount: number }>>
}>

const emptyPot: PotContributionReadModel = {
  totalAmount: 0,
  contributions: []
}

/** 顺序扫描，**保留最后一次** `PotUpdated`（引擎每步入池后发出的权威快照）。 */
export function reducePotFromDomainEvents(
  events: readonly TexasDomainEvent[]
): PotContributionReadModel {
  let last = emptyPot
  for (const e of events) {
    if (e.type === 'PotUpdated') {
      const { totalAmount, contributions } = e.payload
      last = {
        totalAmount,
        contributions: contributions.map((c) => ({
          userId: c.userId,
          amount: c.amount
        }))
      }
    }
  }
  return last
}
