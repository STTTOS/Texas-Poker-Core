import type Dealer from '@/Dealer'

/**
 * 荷官环上「行动序」座位的 `userId` 列表（只读；不修改 `Dealer`）。
 * 与 {@link captureTableSnapshot} 中 `players` 环序规则一致。
 */
export function captureSeatUserIdsInActionOrder(
  dealer: Dealer
): readonly number[] {
  const seq = dealer.getPlayersByActionSequence()
  const ring = seq.length > 0 ? seq : dealer.players
  return ring.map((p) => p.getUserInfo().id)
}
