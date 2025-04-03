import { equals } from 'ramda'

import { Player } from '@/Player'
import {
  Poke,
  Rank,
  Suit,
  rankMap,
  suitsMap,
  handPokeType,
  comboIndices
} from './constant'

const sum = (a: number, b: number) => a + b
/**
 *
 * @description 计算ranks牌力值
 * @param ranks
 * @returns
 */
function calcRanks(ranks: Rank[]) {
  return ranks
    .map(rankMap)
    .map((exponent) => Math.pow(2, exponent - 1))
    .reduce(sum, 0)
}

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
 * @description 组合手牌类型 + 牌力值
 * @param type
 * @param ranks
 * @returns
 */
const combineTypeAndRank = (type: handPokeType, ranks: Rank[]) => {
  return `${type}${calcRanks(ranks)}`
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
  // 将所有牌型分割
  const ranks1 = a.split('+').map((item) => +item.slice(1))
  const ranks2 = b.split('+').map((item) => +item.slice(1))

  // 第一位相同, 需比较第二位
  if (ranks1[0] === ranks2[0]) {
    return (ranks2[1] ?? 0) - (ranks1[1] ?? 0)
  }

  // 第一位不同直接比较大小
  return ranks2[0] - ranks1[0]
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

/**
 * @description 计算牌力大小
 * @param input
 * @returns
 */
export function getHandPresentation(input: Poke[]) {
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

    // 同花
    return combineTypeAndRank('v', ranks)
  }

  // 一种只有两种面值
  if (new Set(ranks).size === 2) {
    const [poke1, poke2] = Array.from(new Set(ranks))
    const [count1, count2] = [
      countSameRanks(ranks, poke1),
      countSameRanks(ranks, poke2)
    ]
    const [greaterOne, lessOne] =
      count1 > count2 ? [poke1, poke2] : [poke2, poke1]
    // 四条
    if ([count1, count2].includes(4)) {
      return `x${rankMap(greaterOne)}`
    }
    // 葫芦
    return `w${rankMap(greaterOne)}+r${rankMap(lessOne)}`
  }

  // 只有三种类型
  if (new Set(ranks).size === 3) {
    const [poke1, poke2, poke3] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    const [count1, count2, count3] = [poke1, poke2, poke3].map((item) =>
      countSameRanks(ranks, item)
    )
    if ([count1, count2, count3].includes(3))
      // 三条
      return `t${rankMap(poke1)}+${combineTypeAndRank('q', [poke2, poke3])}`
    // 两对
    return `${combineTypeAndRank('s', [poke1, poke2])}+r${rankMap(poke3)}`
  }

  // 一对
  if (new Set(ranks).size === 4) {
    const [poke1, ...pokes] = Array.from(new Set(ranks)).sort((a, b) =>
      countSameRanks(ranks, a) > countSameRanks(ranks, b) ? -1 : 1
    )
    return `r${rankMap(poke1)}+${combineTypeAndRank('q', pokes)}`
  }

  const { result, max } = isStraight(ranks)
  // 顺子
  if (result) return `u${max}`

  // 高牌
  return combineTypeAndRank('q', ranks)
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
 * @description 获取多个手牌组合中的最大牌力值
 * @param handPokes
 * @param commonPokes
 * @returns
 */
export function getBestPokesPresentation(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const [maxOne] = handPokes
    .map((pokes) =>
      getCombinations([...(pokes as unknown as Poke[]), ...commonPokes])
    )
    .flat(1)
    .sort(compareFn)
  return getHandPresentation(maxOne)
}

/**
 * @description 格式化展示牌信息
 * @param input
 * @returns
 */
export const formatter = (input: Poke[]) => {
  return input
    .map((item) => `${suitsMap.get(item[0] as Suit)}${item[1]}`)
    .join(',')
}

/**
 * @description 根据玩家presentation, 计算出赢家
 */
export const getWinners = (players: Player[]) => {
  if (players.some((p) => !p.getPresentation()))
    throw new Error('未计算玩家手牌大小,无法比较')

  const [max] = [...players].sort((a, b) =>
    comparePresentation(a.getPresentation()!, b.getPresentation()!)
  )
  return players.filter((p) => p.getPresentation() === max.getPresentation())
}
