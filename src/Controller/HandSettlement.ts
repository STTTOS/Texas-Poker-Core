import { Player } from '@/Player'
import { Poke, RankCategory } from '@/Deck/constant'
import { TexasEngineContext } from '@/TexasEngineContext'
import {
  formatterPoke,
  getBestFiveCards,
  getFiveCardsRankSignature,
  getStrengthFromRankSignature
} from '@/Deck/core'

export type RankSettlementSnapshot = {
  rankCategory?: RankCategory
  pokes: Poke[][]
  rankStrength: number
}

/**
 * 摊牌结算：为每位入座玩家算 best five，并汇总桌上最强牌型（供 onGameEnd / 展示）。
 * 与阶段机、控制权移交无关。
 */
export class HandSettlement {
  #snapshot: RankSettlementSnapshot = {
    rankCategory: undefined,
    pokes: [],
    rankStrength: 0
  }

  get snapshot() {
    return this.#snapshot
  }

  reset() {
    this.#snapshot = { rankCategory: undefined, pokes: [], rankStrength: 0 }
  }

  /**
   * 用已写入各玩家的 rankStrength / bestFiveCards 聚合桌上最强牌（避免对未弃牌玩家再跑一遍全量 C(n,5) 展开与排序）。
   */
  #snapshotFromShowdownPlayers(stillIn: Player[]): RankSettlementSnapshot {
    if (stillIn.length === 0) {
      return { rankCategory: undefined, pokes: [], rankStrength: 0 }
    }

    const maxStrength = Math.max(...stillIn.map((p) => p.rankStrength))
    const tied = stillIn.filter((p) => p.rankStrength === maxStrength)
    const sig = tied[0].rankSignature!

    return {
      rankCategory: sig[0] as RankCategory,
      pokes: tied.map((p) => p.bestFiveCards!),
      rankStrength: maxStrength
    }
  }

  settleFromCommonBoard(
    allSeatedPlayers: Player[],
    playersStillInShowdown: Player[],
    commonPokes: Poke[]
  ) {
    if (commonPokes.length === 0) return

    allSeatedPlayers.forEach((player) => {
      const bestFiveCards = getBestFiveCards(player.getHandPokes(), commonPokes)
      player.bestFiveCards = bestFiveCards
      const sig = getFiveCardsRankSignature(bestFiveCards)
      player.rankSignature = sig
      player.rankStrength = getStrengthFromRankSignature(sig)
    })

    this.#snapshot = this.#snapshotFromShowdownPlayers(playersStillInShowdown)

    TexasEngineContext.emitTrace({
      channel: 'dealer',
      name: 'settle_common_pokes',
      data: {
        commonPokes: formatterPoke(commonPokes)
      }
    })
  }
}
