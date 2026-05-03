import { getFiveCardsRankSignature } from './handEvaluation'
import { Poke, Rank, RankCategory, RankSignature } from './constant'

const NUMERIC_TO_RANK: Record<number, Rank> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 't',
  11: 'j',
  12: 'q',
  13: 'k',
  14: 'a'
}

function numericRankToRank(v: number): Rank {
  const r = NUMERIC_TO_RANK[v]
  if (r === undefined) {
    throw new Error(`rankSignatureToRanks: 非法点数 ${v}（须为 2–14）`)
  }
  return r
}

/**
 * 与 `isStraight` / 签名中 `u`/`y` 的 `max` 一致：五张顺子点数顺序。
 * 仅 Broadway（A-K-Q-J-T，`max === 14`）A 作高牌；其余含 A 的顺子仅为 wheel，A 视为 1 排在末位。
 */
function straightRanksFromMax(max: number): Rank[] {
  if (max === 5) {
    return ['5', '4', '3', '2', 'a']
  }
  return [max, max - 1, max - 2, max - 3, max - 4].map(numericRankToRank)
}

/**
 * 将 `RankSignature` 展开为五张牌的点数（`Rank`），与 `getFiveCardsRankSignature` 编码对称。
 * 顺子 wheel（`u5`/`y5`）为 5→A 展示顺序，A 在末位；Broadway 仍为 A→T。
 * `x`（四条）当前签名仅含四条点数，踢脚未编码，第五位为 `null`。
 */
export function rankSignatureToRanks(
  rankSignature: RankSignature
): (Rank | null)[] {
  const category = rankSignature[0] as RankCategory
  const nums = parseRankNumbersFromRankSignature(rankSignature)

  switch (category) {
    case 'z':
      return ['a', 'k', 'q', 'j', 't']
    case 'y':
    case 'u': {
      if (nums.length !== 1) {
        throw new Error(
          `rankSignatureToRanks: ${category} 型签名须含 1 个 max 段，实际 ${nums.length}`
        )
      }
      return straightRanksFromMax(nums[0])
    }
    case 'q':
    case 'v': {
      if (nums.length !== 5) {
        throw new Error(
          `rankSignatureToRanks: ${category} 型签名须含 5 个点数段，实际 ${nums.length}`
        )
      }
      return nums.map(numericRankToRank)
    }
    case 'r': {
      if (nums.length !== 4) {
        throw new Error(
          `rankSignatureToRanks: r 型签名须为「对子+3 踢脚」共 4 段，实际 ${nums.length}`
        )
      }
      const [p, ...kick] = nums
      const pr = numericRankToRank(p)
      return [pr, pr, ...kick.map(numericRankToRank)]
    }
    case 's': {
      if (nums.length !== 3) {
        throw new Error(
          `rankSignatureToRanks: s 型签名须为「高对+低对+踢脚」共 3 段，实际 ${nums.length}`
        )
      }
      const [hi, lo, k] = nums.map(numericRankToRank)
      return [hi, hi, lo, lo, k]
    }
    case 't': {
      if (nums.length !== 3) {
        throw new Error(
          `rankSignatureToRanks: t 型签名须为「三条+2 踢脚」共 3 段，实际 ${nums.length}`
        )
      }
      const [tr, k1, k2] = nums.map(numericRankToRank)
      return [tr, tr, tr, k1, k2]
    }
    case 'w': {
      if (nums.length !== 2) {
        throw new Error(
          `rankSignatureToRanks: w 型签名须为「三条+对子」共 2 段，实际 ${nums.length}`
        )
      }
      const [tr, pr] = nums.map(numericRankToRank)
      return [tr, tr, tr, pr, pr]
    }
    case 'x': {
      if (nums.length !== 1) {
        throw new Error(
          `rankSignatureToRanks: x 型签名须含 1 个点数段，实际 ${nums.length}`
        )
      }
      const q = numericRankToRank(nums[0])
      return [q, q, q, q, null]
    }
    default:
      throw new Error(`rankSignatureToRanks: 未知牌型前缀 ${category}`)
  }
}

/** 供 UI 分组渲染：每组 `ranks` 为从左到右、已合并同点的连续张（与 `rankSignatureToRanks` 顺序一致）。 */
export type RankSignatureDisplayGroup = { ranks: Rank[] }

const FLAT_DISPLAY_CATEGORIES: ReadonlySet<RankCategory> = new Set([
  'q',
  'v',
  'u',
  'y',
  'z'
])

/**
 * 将牌力签名映射为展示用分组（间距与样式由应用层决定）。
 * - `q`/`v`/`u`/`y`/`z`：每张一组；顺子 wheel 时 A 已在末位（见 `straightRanksFromMax`）。
 * - `r`/`s`/`t`/`w`/`x`：连续同点合并为一组。
 */
export function rankSignatureToDisplayGroups(
  rankSignature: RankSignature
): RankSignatureDisplayGroup[] {
  const category = rankSignature[0] as RankCategory
  const expanded = rankSignatureToRanks(rankSignature)

  if (FLAT_DISPLAY_CATEGORIES.has(category)) {
    const ranks = expanded.filter((r): r is Rank => r !== null)
    return ranks.map((r) => ({ ranks: [r] }))
  }

  const ranks = expanded.filter((r): r is Rank => r !== null)
  const groups: RankSignatureDisplayGroup[] = []
  let i = 0
  while (i < ranks.length) {
    let j = i + 1
    while (j < ranks.length && ranks[j] === ranks[i]) j++
    groups.push({ ranks: ranks.slice(i, j) })
    i = j
  }

  return groups
}

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
