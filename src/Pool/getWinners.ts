import { Player } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 根据已算好的牌力（rankStrength / rankSignature）与弃牌状态决定赢家列表。
 * 属于奖池/结算域，不放在 `Deck/core`（牌型与组合纯函数）。
 */
export function getWinners(players: Player[]): Player[] {
  if (players.every((p) => !p.rankSignature)) {
    const winner = players.filter((p) => p.getStatus() !== 'out')
    if (winner.length === 1) return winner
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  const maxRankStrength = Math.max(
    ...players
      .filter((player) => player.getStatus() !== 'out')
      .map((player) => player.rankStrength)
  )

  return players
    .filter((p) => p.getStatus() !== 'out')
    .filter((p) => p.rankStrength === maxRankStrength)
}
