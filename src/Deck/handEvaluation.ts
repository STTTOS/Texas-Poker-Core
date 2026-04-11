import { equals } from 'ramda'

import { Poke, Rank, Suit, rankMap, RankSignature } from './constant'

/**
 * 单副牌组合、顺子判定、五张牌型签名生成（不含两副牌之间的 compare）。
 */
export const isStraight = (values: Rank[]) => {
  const mapToValue = [...values].map(rankMap).sort((a, b) => a - b)

  const isSpecial = equals([2, 3, 4, 5, 14], mapToValue)
  const result =
    isSpecial ||
    (new Set(values).size === 5 &&
      Math.abs(mapToValue[mapToValue.length - 1] - mapToValue[0]) === 4)

  return {
    result,
    max: isSpecial ? 5 : Math.max(...mapToValue)
  }
}

function countSameRanks(input: Rank[], value: Rank) {
  return input.filter((item) => item === value).length
}

function formatRanksDesc(ranks: Rank[]): string {
  return [...ranks]
    .sort((a, b) => rankMap(b) - rankMap(a))
    .map(rankMap)
    .join('+')
}

function combinationIndices(n: number, k: number): number[][] {
  const out: number[][] = []
  const path: number[] = []
  function dfs(from: number) {
    if (path.length === k) {
      out.push([...path])
      return
    }
    for (let i = from; i < n; i++) {
      path.push(i)
      dfs(i + 1)
      path.pop()
    }
  }
  dfs(0)
  return out
}

const PRECOMPUTED_INDICES_5_CHOOSE_5: readonly number[][] = [[0, 1, 2, 3, 4]]

const PRECOMPUTED_INDICES_6_CHOOSE_5: readonly number[][] = [
  [1, 2, 3, 4, 5],
  [0, 2, 3, 4, 5],
  [0, 1, 3, 4, 5],
  [0, 1, 2, 4, 5],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 3, 4]
]

const PRECOMPUTED_INDICES_7_CHOOSE_5: readonly number[][] = [
  [0, 1, 2, 3, 4],
  [0, 1, 2, 3, 5],
  [0, 1, 2, 3, 6],
  [0, 1, 2, 4, 5],
  [0, 1, 2, 4, 6],
  [0, 1, 2, 5, 6],
  [0, 1, 3, 4, 5],
  [0, 1, 3, 4, 6],
  [0, 1, 3, 5, 6],
  [0, 1, 4, 5, 6],
  [0, 2, 3, 4, 5],
  [0, 2, 3, 4, 6],
  [0, 2, 3, 5, 6],
  [0, 2, 4, 5, 6],
  [0, 3, 4, 5, 6],
  [1, 2, 3, 4, 5],
  [1, 2, 3, 4, 6],
  [1, 2, 3, 5, 6],
  [1, 2, 4, 5, 6],
  [1, 3, 4, 5, 6],
  [2, 3, 4, 5, 6]
]

export function getFiveCardCombinationIndices(n: number, k = 5): number[][] {
  if (k !== 5) return combinationIndices(n, k)
  if (n === 5) return PRECOMPUTED_INDICES_5_CHOOSE_5 as unknown as number[][]
  if (n === 6) return PRECOMPUTED_INDICES_6_CHOOSE_5 as unknown as number[][]
  if (n === 7) return PRECOMPUTED_INDICES_7_CHOOSE_5 as unknown as number[][]
  return combinationIndices(n, k)
}

export function allFiveCardHandsFromPool(cards: Poke[]): Poke[][] {
  const n = cards.length
  if (n < 5) throw new Error(`可用牌少于5张（当前${n}张）, 无法组合五张牌型`)
  return getFiveCardCombinationIndices(n, 5).map((idx) =>
    idx.map((i) => cards[i])
  )
}

export function getFiveCardsRankSignature(input: Poke[]): RankSignature {
  const suits = input.map((poke) => poke[0] as Suit)
  const ranks = input.map((poke) => poke[1] as Rank)

  if (new Set(suits).size === 1) {
    const { result, max } = isStraight(ranks)
    if (result) {
      if (ranks.includes('k') && ranks.includes('a')) return 'z'

      return `y${max}`
    }

    return `v${formatRanksDesc(ranks)}`
  }

  if (new Set(ranks).size === 2) {
    const [rankA, rankB] = Array.from(new Set(ranks))
    const [countA, countB] = [
      countSameRanks(ranks, rankA),
      countSameRanks(ranks, rankB)
    ]
    const [greaterOne, lessOne] =
      countA > countB ? [rankA, rankB] : [rankB, rankA]
    if ([countA, countB].includes(4)) {
      return `x${rankMap(greaterOne)}`
    }
    return `w${rankMap(greaterOne)}+r${rankMap(lessOne)}`
  }

  if (new Set(ranks).size === 3) {
    const [pokeA, pokeB, pokeC] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    const [countA, countB, countC] = [pokeA, pokeB, pokeC].map((item) =>
      countSameRanks(ranks, item)
    )
    if ([countA, countB, countC].includes(3))
      return `t${rankMap(pokeA)}+${formatRanksDesc([pokeB, pokeC])}`
    return `s${rankMap(pokeA)}+${rankMap(pokeB)}+${rankMap(pokeC)}`
  }

  if (new Set(ranks).size === 4) {
    const [PokeA, ...pokes] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    return `r${rankMap(PokeA)}+${formatRanksDesc(pokes)}`
  }

  const { result, max } = isStraight(ranks)
  if (result) return `u${max}`

  return `q${formatRanksDesc(ranks)}`
}
