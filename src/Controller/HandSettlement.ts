import { Player } from '@/Player'
import { Poke, RankCategory, RankSignature } from '@/Deck/constant'
import {
  getBestFiveCards,
  getFiveCardsRankSignature,
  getStrengthFromRankSignature
} from '@/Deck/core'

export type RankSettlementSnapshot = {
  rankCategory?: RankCategory
  pokes: Poke[][]
  rankStrength: number
}

/** 单座摊牌评估（唯一数据源；`Player` 经 `Controller.getShowdownEvalForPlayer` 只读） */
export type ShowdownPlayerEval = {
  bestFiveCards: Poke[]
  rankSignature: RankSignature
  rankStrength: number
  rankCategory: RankCategory
}

/**
 * 摊牌结算：按 userId 存评估表，并汇总桌上最强牌型。
 * 与阶段机、控制权移交无关。
 */
export class HandSettlement {
  #snapshot: RankSettlementSnapshot = {
    rankCategory: undefined,
    pokes: [],
    rankStrength: 0
  }

  #evalByUserId = new Map<number, ShowdownPlayerEval>()

  get snapshot() {
    return this.#snapshot
  }

  getPlayerEval(userId: number): ShowdownPlayerEval | undefined {
    return this.#evalByUserId.get(userId)
  }

  reset() {
    this.#snapshot = { rankCategory: undefined, pokes: [], rankStrength: 0 }
    this.#evalByUserId.clear()
  }

  #snapshotFromShowdownPlayers(stillIn: Player[]): RankSettlementSnapshot {
    if (stillIn.length === 0) {
      return { rankCategory: undefined, pokes: [], rankStrength: 0 }
    }

    const maxStrength = Math.max(
      ...stillIn.map((p) => this.getPlayerEval(p.id)?.rankStrength ?? 0)
    )
    const tiedAtTop = stillIn.filter(
      (p) => (this.getPlayerEval(p.id)?.rankStrength ?? 0) === maxStrength
    )
    const topEval = this.getPlayerEval(tiedAtTop[0].id)
    if (!topEval || maxStrength === 0) {
      return { rankCategory: undefined, pokes: [], rankStrength: 0 }
    }

    return {
      rankCategory: topEval.rankCategory,
      pokes: tiedAtTop.map((p) => this.getPlayerEval(p.id)!.bestFiveCards),
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
      const rankSignature = getFiveCardsRankSignature(bestFiveCards)
      const rankStrength = getStrengthFromRankSignature(rankSignature)
      const rankCategory = rankSignature[0] as RankCategory
      this.#evalByUserId.set(player.id, {
        bestFiveCards,
        rankSignature,
        rankStrength,
        rankCategory
      })
    })

    this.#snapshot = this.#snapshotFromShowdownPlayers(playersStillInShowdown)
  }
}
