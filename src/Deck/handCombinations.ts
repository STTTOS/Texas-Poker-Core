import { Poke } from './constant'
import { compareFn } from './handCompare'
import {
  allFiveCardHandsFromPool,
  getFiveCardsRankSignature
} from './handEvaluation'

/**
 * 手牌 + 公牌 → 最优五张、多人比较、最佳牌型信息（依赖 evaluation + compare）。
 */
export function getBestFiveCards(
  handPokes: Poke[],
  commonPokes: Poke[]
): Poke[] {
  if (handPokes.length !== 2)
    throw new Error(`手牌须为2张（当前${handPokes.length}张）`)

  const nc = commonPokes.length
  if (nc === 0) throw new Error('底牌数量不足, 无法组合出最大5张牌型')
  if (nc !== 3 && nc !== 4 && nc !== 5)
    throw new Error(`公共牌须为3、4或5张（当前${nc}张）`)

  const all = [...handPokes, ...commonPokes]
  const combos = allFiveCardHandsFromPool(all)
  const sorted = combos.sort(compareFn)
  return sorted[0]
}

/** 内部：展开多人全部 C(n,5) 再排序；对外若只需「最强签名」请用 {@link getBestPokesRankSignature} */
function getSortedAllHandPokesCombinations(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const allCombinations = handPokes
    .map((pokes) =>
      allFiveCardHandsFromPool([
        ...(pokes as unknown as Poke[]),
        ...commonPokes
      ])
    )
    .flat(1)
    .sort(compareFn)
  return allCombinations
}

export function getBestPokesRankSignature(
  handPokes: Poke[][],
  commonPokes: Poke[]
) {
  const [maxOne] = getSortedAllHandPokesCombinations(handPokes, commonPokes)
  return getFiveCardsRankSignature(maxOne)
}
