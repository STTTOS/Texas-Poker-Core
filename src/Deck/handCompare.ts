import { getFiveCardsRankSignature } from './handEvaluation'
import { Poke, RankCategory, RankSignature } from './constant'

/**
 * RankSignature 解析、两副五张牌比较、可排序强度（与具体组合枚举无关）。
 */
function parseRankNumbersFromRankSignature(rankSignature: string): number[] {
  const rest = rankSignature.slice(1)
  if (!rest) return []
  return rest.split('+').map((segment) => {
    const numPart = /^[a-z]\d*$/i.test(segment) ? segment.slice(1) : segment
    return numPart === '' ? 0 : +numPart
  })
}

const compareFnOfSameType = (a: string, b: string) => {
  const ranks1 = parseRankNumbersFromRankSignature(a)
  const ranks2 = parseRankNumbersFromRankSignature(b)
  const len = Math.max(ranks1.length, ranks2.length)
  for (let i = 0; i < len; i++) {
    const v1 = ranks1[i] ?? 0
    const v2 = ranks2[i] ?? 0
    if (v2 !== v1) return v2 - v1
  }
  return 0
}

export const compareFn = (a: Poke[], b: Poke[]) => {
  const [rankSigA, rankSigB] = [
    getFiveCardsRankSignature(a),
    getFiveCardsRankSignature(b)
  ]
  return compareRankSignature(rankSigA, rankSigB)
}

export const compareRankSignature = (p1: string, p2: string) => {
  const [typeA, typeB] = [p1[0], p2[0]]

  if (typeA === typeB) {
    return compareFnOfSameType(p1, p2)
  }

  return typeA > typeB ? -1 : 1
}

const RANK_CATEGORY_ORDER: Record<RankCategory, number> = {
  q: 0,
  r: 1,
  s: 2,
  t: 3,
  u: 4,
  v: 5,
  w: 6,
  x: 7,
  y: 8,
  z: 9
}

const RANK_BASE = 16
const TYPE_MULTIPLIER = 1_000_000

export function getStrengthFromRankSignature(
  rankSignature: RankSignature
): number {
  const typeChar = rankSignature[0] as RankCategory
  const typeIndex = RANK_CATEGORY_ORDER[typeChar] ?? 0
  const rankNumbers = parseRankNumbersFromRankSignature(rankSignature)
  const payload = rankNumbers.reduce(
    (sum, r, i) => sum + r * Math.pow(RANK_BASE, rankNumbers.length - 1 - i),
    0
  )
  return typeIndex * TYPE_MULTIPLIER + payload
}

export function getFiveCardsStrength(input: Poke[]): number {
  return getStrengthFromRankSignature(getFiveCardsRankSignature(input))
}
