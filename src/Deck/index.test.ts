import { equals } from 'ramda'

import Deck from './index'
import { DealtBoard } from './DealtBoard'
import { getBestPokesRankSignature } from './core'
import {
  ranks,
  suits,
  type Poke,
  RankCategory,
  rankCategoryMap
} from './constant'

/** 标准 52 张牌列表（与 Deck#createDeck 顺序无关，仅用于全集计数） */
const ALL_POKES: Poke[] = suits.flatMap((s) =>
  ranks.map((r) => `${s}${r}` as Poke)
)

/** 5 张牌是否至少存在相同点数（公牌上出现「对子」面） */
function boardHasPairByRank(cards: Poke[]): boolean {
  const seen = new Set<string>()
  for (const c of cards) {
    const rank = c.slice(1)
    if (seen.has(rank)) return true
    seen.add(rank)
  }
  return false
}

/**
 * 完全随机 5 张（均匀 C(52,5) 等价于本库洗牌后取公牌集合）时，至少一对点数的理论概率。
 * 1 - C(13,5)*4^5 / C(52,5) ≈ 0.4929
 */
const THEORETIC_BOARD_PAIR_OR_BETTER =
  1 - (combinations(13, 5) * 4 ** 5) / combinations(52, 5)

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  const kk = Math.min(k, n - k)
  let num = 1
  let den = 1
  for (let i = 1; i <= kk; i++) {
    num *= n - kk + i
    den *= i
  }
  return num / den
}

describe('deck', () => {
  test('init deck successfully', () => {
    const deck = new Deck()
    const board = new DealtBoard()
    expect(board.getPokes().commonPokes.length).toEqual(0)
    expect(board.getPokes().handPokes.length).toEqual(0)
    expect(deck.getCards().length).toEqual(52)
  })

  /** 构造函数会 #createDeck 再洗牌；排序后与标准 52 张一一对应即可验证牌组完整 */
  test('createDeck covers exactly 52 unique cards (4 suits × 13 ranks)', () => {
    const expected: Poke[] = suits.flatMap((s) =>
      ranks.map((r) => `${s}${r}` as Poke)
    )
    expect(expected.length).toBe(52)

    const deck = new Deck()
    const cards = deck.getCards()
    expect(cards.length).toBe(52)
    expect(new Set(cards).size).toBe(52)

    const sortedActual = [...cards].sort()
    const sortedExpected = [...expected].sort()
    expect(sortedActual).toEqual(sortedExpected)
  })

  test('create deck successfully', () => {
    const deck = new Deck()
    const { handPokes, commonPokes } = deck.dealCards(2)
    expect(commonPokes.length).toEqual(5)
    expect(handPokes.length).toEqual(2)
    expect(deck.getCards().length).toEqual(52)
  })

  test('shuffle successfully', () => {
    const deck = new Deck()
    const origin = [...deck.getCards()]

    deck.shuffle()

    const shuffled = [...deck.getCards()]
    const result = equals(origin, shuffled)
    expect(result).toBe(false)
  })

  /**
   * dealCards：先 #shuffle，再按桌序发 2 圈手牌，烧牌 + flop(3) + 烧牌 + turn(1) + 烧牌 + river(1)。
   * 等价于在随机排列中固定取若干位置，故每张牌出现在 5 张公牌中的期望次数相同。
   */
  test.skip('100k deals: each poke appears in commonPokes (5 board cards) ~uniformly', () => {
    const playerCount = 2
    const iterations = 100_000
    const expectedPerPoke = (iterations * 5) / 52

    const counts = new Map<Poke, number>()
    for (const p of ALL_POKES) counts.set(p, 0)

    const deck = new Deck()
    for (let i = 0; i < iterations; i++) {
      const { commonPokes } = deck.dealCards(playerCount)
      expect(commonPokes).toHaveLength(5)
      expect(new Set(commonPokes).size).toBe(5)
      for (const c of commonPokes) {
        counts.set(c, counts.get(c)! + 1)
      }
    }

    let chiSq = 0
    for (const p of ALL_POKES) {
      const o = counts.get(p)!
      chiSq += (o - expectedPerPoke) ** 2 / expectedPerPoke
    }
    // χ²(51)；取宽松上界减少 CI 偶发抖动（均匀 RNG 下统计量期望约 51）
    expect(chiSq).toBeLessThan(100)
  }, 120_000)

  test.skip('100k deals: board pair rate matches ~49% (公对常见并非发牌偏置)', () => {
    const playerCount = 2
    const iterations = 100_000
    let pairBoards = 0
    const deck = new Deck()
    for (let i = 0; i < iterations; i++) {
      const { commonPokes } = deck.dealCards(playerCount)
      if (boardHasPairByRank(commonPokes)) pairBoards++
    }
    const pHat = pairBoards / iterations
    const margin = 0.02
    expect(pHat).toBeGreaterThan(THEORETIC_BOARD_PAIR_OR_BETTER - margin)
    expect(pHat).toBeLessThan(THEORETIC_BOARD_PAIR_OR_BETTER + margin)
  }, 120_000)

  // 耗时约 10min，平时不开启此测试
  test.skip('bias in deal probabilities', () => {
    // 牌型参考概率（2 张底牌 + 5 张公牌组成 7 张选最优 5 张后的牌型分布）
    const standardProbability = new Map<RankCategory, number>([
      ['q', 0.174],
      ['r', 0.438],
      ['s', 0.235],
      ['t', 0.0483],
      ['u', 0.0462],
      ['v', 0.0303],
      ['w', 0.026],
      ['x', 0.00168],
      ['y', 0.000279],
      ['z', 0.000032]
    ])
    let count = 1_000_000
    const times = count
    const hitCountsMap = new Map<RankCategory, number>()
    while (count > 0) {
      count--
      const deck = new Deck()
      const { handPokes, commonPokes } = deck.dealCards(2)
      const type = getBestPokesRankSignature(
        [handPokes[0]],
        commonPokes
      )[0] as RankCategory
      if (hitCountsMap.has(type))
        hitCountsMap.set(type, hitCountsMap.get(type)! + 1)
      else hitCountsMap.set(type, 1)
    }

    const totalCatchTimes = Array.from(hitCountsMap.values()).reduce(
      (a, b) => a + b,
      0
    )
    const isPass =
      [...hitCountsMap.keys()]
        .map((type) => {
          const catchTimes = hitCountsMap.get(type)!
          const offsetRate =
            (Math.abs(catchTimes / times - standardProbability.get(type)!) /
              standardProbability.get(type)!) *
            100
          const probability = (catchTimes / times) * 100
          console.log(
            `${rankCategoryMap.get(
              type
            )} bias: ${offsetRate}%; probability: ${probability}%`
          )
          return offsetRate
        })
        .every((offsetRate) => offsetRate < 5) && totalCatchTimes === times
    expect(isPass).toBe(true)
  })
})
