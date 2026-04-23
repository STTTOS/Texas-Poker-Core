import { Player } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 根据已算好的牌力（rankStrength / rankSignature）与弃牌状态决定赢家列表。
 * 属于奖池/结算域，不放在 `Deck/core`（牌型与组合纯函数）。
 */
export function getWinners(players: Player[]): Player[] {
  const activePlayers = players.filter((p) => p.getStatus() !== 'out')
  if (activePlayers.length === 0) {
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  if (players.every((p) => !p.rankSignature)) {
    if (activePlayers.length === 1) return activePlayers
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  const maxRankStrength = Math.max(...activePlayers.map((p) => p.rankStrength))
  if (!Number.isFinite(maxRankStrength)) {
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  return activePlayers.filter((p) => p.rankStrength === maxRankStrength)
}
