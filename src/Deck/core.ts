import { equals } from 'ramda'

import { Player } from '@/Player'
import {
  Poke,
  Rank,
  Suit,
  rankMap,
  suitsMap,
  comboIndices,
  Presentation,
  handTypeCategory
} from './constant'

/**
 * @description 判断是否为顺子, 并且返回最大顺子的值
 * @param values
 * @returns
 */
export const isStraight = (values: Rank[]) => {
  const mapToValue = [...values].map(rankMap).sort((a, b) => a - b)

  // A 2 3 4 5
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

/**
 * @description 获取牌面值中 指定牌面的个数
 * @param input
 * @param value
 * @returns
 */
function countSameRanks(input: Rank[], value: Rank) {
  return input.filter((item) => item === value).length
}

/**
 * 将若干 rank 按牌力从高到低排列后格式化为 "14+13+12+11+9" 形式，便于阅读与比较
 */
function formatRanksDesc(ranks: Rank[]): string {
  return [...ranks]
    .sort((a, b) => rankMap(b) - rankMap(a))
    .map(rankMap)
    .join('+')
}

/** 从 presentation 中解析出 rank 数字数组（首段去掉类型字母，其余段为纯数字或 "r"+数字） */
function parseRankNumbersFromPresentation(presentation: string): number[] {
  const rest = presentation.slice(1)
  if (!rest) return []
  return rest.split('+').map((segment) => {
    const numPart = /^[a-z]\d*$/i.test(segment) ? segment.slice(1) : segment
    return numPart === '' ? 0 : +numPart
  })
}

/**
 *
 * @param pokes 2张底牌 + 5张公共牌, length === 7
 * @returns
 */
function getCombinations(pokes: Poke[]) {
  return comboIndices.map((indices) => indices.map((i) => pokes[i]))
}

const compareFnOfSameType = (a: string, b: string) => {
  const ranks1 = parseRankNumbersFromPresentation(a)
  const ranks2 = parseRankNumbersFromPresentation(b)
  const len = Math.max(ranks1.length, ranks2.length)
  for (let i = 0; i < len; i++) {
    const v1 = ranks1[i] ?? 0
    const v2 = ranks2[i] ?? 0
    if (v2 !== v1) return v2 - v1
  }
  return 0
}

/**
 * @description 比较两种组合的牌力大小
 * @param a
 * @param b
 * @returns
 */
export const compareFn = (a: Poke[], b: Poke[]) => {
  // 'q13' 'w3+r2'
  const [presentationA, presentationB] = [
    getHandPresentation(a),
    getHandPresentation(b)
  ]
  return comparePresentation(presentationA, presentationB)
}
export const comparePresentation = (p1: string, p2: string) => {
  const [typeA, typeB] = [p1[0], p2[0]]

  // 最高牌型相同
  if (typeA === typeB) {
    return compareFnOfSameType(p1, p2)
  }

  // 不同类型直接比较
  return typeA > typeB ? -1 : 1
}

/** 牌型字符到可排序整数的映射，与 comparePresentation 顺序一致：大即强 */
const HAND_TYPE_ORDER: Record<handTypeCategory, number> = {
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

/** 同类型内 rank 列表编码基数（单 rank 2~14，取 16 保证可区分） */
const RANK_BASE = 16
/** 牌型占位倍数，使 typeIndex 决定高位 */
const TYPE_MULTIPLIER = 1_000_000

/**
 * 将 getHandPresentation 的字符串解析为可排序的整数
 * 保证：comparePresentation(a, b) === -1 => getHandStrengthIntFromPresentation(a) < getHandStrengthIntFromPresentation(b)
 */
export function getHandStrengthIntFromPresentation(
  presentation: Presentation
): number {
  const typeChar = presentation[0] as handTypeCategory
  const typeIndex = HAND_TYPE_ORDER[typeChar] ?? 0
  const rankNumbers = parseRankNumbersFromPresentation(presentation)
  const payload = rankNumbers.reduce(
    (sum, r, i) => sum + r * Math.pow(RANK_BASE, rankNumbers.length - 1 - i),
    0
  )
  return typeIndex * TYPE_MULTIPLIER + payload
}

/**
 * 将 5 张牌编码为可排序的整数，便于数据库存储与 ORDER BY 比较
 * 牌力越大数值越大，可直接用于 ORDER BY hand_strength DESC 取最强牌
 */
export function getHandStrengthInt(input: Poke[]): number {
  return getHandStrengthIntFromPresentation(getHandPresentation(input))
}

/**
 * @description 计算牌力大小
 * @param input
 * @returns
 */
export function getHandPresentation(input: Poke[]): Presentation {
  // return
  const suits = input.map((poke) => poke[0] as Suit)
  const ranks = input.map((poke) => poke[1] as Rank)

  // 都是一种花色
  if (new Set(suits).size === 1) {
    const { result, max } = isStraight(ranks)
    // 是顺子
    if (result) {
      // 包含'A', 'K', 皇家同花顺
      if (ranks.includes('k') && ranks.includes('a')) return 'z'

      // 同花顺
      return `y${max}`
    }

    // 同花：按 rank 从高到低
    return `v${formatRanksDesc(ranks)}`
  }

  // 一种只有两种面值
  if (new Set(ranks).size === 2) {
    // 用A, B代表两种rank
    const [rankA, rankB] = Array.from(new Set(ranks))
    const [countA, countB] = [
      countSameRanks(ranks, rankA),
      countSameRanks(ranks, rankB)
    ]
    const [greaterOne, lessOne] =
      countA > countB ? [rankA, rankB] : [rankB, rankA]
    // 四条
    if ([countA, countB].includes(4)) {
      return `x${rankMap(greaterOne)}`
    }
    // 葫芦
    return `w${rankMap(greaterOne)}+r${rankMap(lessOne)}`
  }

  // 只有三种数值
  if (new Set(ranks).size === 3) {
    // 用A, B, C代表三种rank
    // 按照出现的次数倒序排序, 最大的值在前面
    const [pokeA, pokeB, pokeC] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    const [countA, countB, countC] = [pokeA, pokeB, pokeC].map((item) =>
      countSameRanks(ranks, item)
    )
    if ([countA, countB, countC].includes(3))
      // 三条：三条面值 + 两张踢脚从高到低
      return `t${rankMap(pokeA)}+${formatRanksDesc([pokeB, pokeC])}`
    // 两对：高对+低对+踢脚
    return `s${rankMap(pokeA)}+${rankMap(pokeB)}+${rankMap(pokeC)}`
  }

  // 一对：对子面值 + 三张踢脚从高到低
  if (new Set(ranks).size === 4) {
    const [PokeA, ...pokes] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    return `r${rankMap(PokeA)}+${formatRanksDesc(pokes)}`
  }

  const { result, max } = isStraight(ranks)
  // 顺子
  if (result) return `u${max}`

  // 高牌：五张 rank 从高到低
  return `q${formatRanksDesc(ranks)}`
}

/**
 * @description 根据底牌和手牌, 计算出最大的牌力组合
 * @param handPokes
 * @param commonPokes
 * @returns
 */
export function getBestHand(pokes: Poke[], commonPokes: Poke[]): Poke[] {
  const [maxOne] = getCombinations(pokes.concat(commonPokes)).sort(compareFn)

  return maxOne
}

/**
 * @description 获取多个手牌组合中的所有牌型组合, 按照降序排列
 * @param handPokes
 * @param commonPokes
 * @returns
 */
export function getSortedAllHandPokesCombinations(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const allCombinations = handPokes
    .map((pokes) =>
      getCombinations([...(pokes as unknown as Poke[]), ...commonPokes])
    )
    .flat(1)
    .sort(compareFn)
  return allCombinations
}
/**
 * @description 获取多个手牌组合中的最大牌力值
 * @param handPokes
 * @param commonPokes
 * @returns
 */
export function getBestPokesPresentation(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const [maxOne] = getSortedAllHandPokesCombinations(handPokes, commonPokes)
  return getHandPresentation(maxOne)
}

// 获取最大牌型与牌力值
export function getMaxPresentationAndPokes(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const allCombinations = getSortedAllHandPokesCombinations(
    handPokes,
    commonPokes
  )
  const maxPresentation = getHandPresentation(allCombinations[0])

  // 以下方法可以使用reduce实现, 在目前不影响性能的情况下, 先这样实现
  const maxPokes = allCombinations
    .map((combination) => {
      return {
        presentation: getHandPresentation(combination),
        pokes: combination
      }
    })
    .filter((item) => item.presentation === maxPresentation)
    .map((item) => item.pokes)
  return {
    presentation: maxPresentation,
    pokes: maxPokes
  }
}
/**
 * @description 格式化展示牌信息
 * @param input
 * @returns
 */
export const formatterPoke = (input: Poke[]) => {
  return input
    .map((item) => `${suitsMap.get(item[0] as Suit)}${item[1].toUpperCase()}`)
    .join(',')
}

/**
 * @description 根据玩家presentation, 计算出赢家
 */
export const getWinners = (players: Player[]) => {
  if (players.some((p) => !p.getPresentation()))
    throw new Error('未计算玩家手牌大小,无法比较')

  const [max] = [...players]
    .filter((player) => player.getStatus() !== 'out')
    .sort((a, b) =>
      comparePresentation(a.getPresentation()!, b.getPresentation()!)
    )
  return players.filter((p) => p.getPresentation() === max.getPresentation())
}
