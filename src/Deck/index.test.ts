import { equals } from 'ramda'

import Deck from './index'
import { getBestRankCategory } from './core'
import {
  ranks,
  suits,
  type Poke,
  RankCategory,
  rankCategoryMap
} from './constant'

describe('deck', () => {
  test('init deck successfully', () => {
    const deck = new Deck()
    expect(deck.getPokes().commonPokes.length).toEqual(0)
    expect(deck.getPokes().handPokes.length).toEqual(0)
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
    deck.dealCards(2)
    expect(deck.getPokes().commonPokes.length).toEqual(5)
    expect(deck.getPokes().handPokes.length).toEqual(2)
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
      const type = getBestRankCategory([handPokes[0]], commonPokes)
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
