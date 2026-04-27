import { Player } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 根据弃牌状态与已算好的牌力（rankStrength / rankSignature）决定赢家列表。
 * 独赢（仅剩一名未弃牌）时不再依赖 rank，与街道无关；多人存活才比牌。
 */
export function getWinners(players: Player[]): Player[] {
  const activePlayers = players.filter((p) => p.getStatus() !== 'out')
  if (activePlayers.length === 0) {
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  if (activePlayers.length === 1) {
    return activePlayers
  }

  if (activePlayers.every((p) => !p.rankSignature)) {
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  const maxRankStrength = Math.max(...activePlayers.map((p) => p.rankStrength))
  if (!Number.isFinite(maxRankStrength)) {
    throw new TexasError(TexasCoreErrorCode.POOL_WINNERS_INVALID)
  }

  return activePlayers.filter((p) => p.rankStrength === maxRankStrength)
}
