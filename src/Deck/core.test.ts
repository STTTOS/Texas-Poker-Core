import { Rank } from './constant'
import {
  compareFn,
  isStraight,
  getBestFiveCards,
  getFiveCardsStrength,
  getFiveCardsRankSignature,
  getBestPokesRankSignature,
  getStrengthFromRankSignature
} from './core'

describe('core logic', () => {
  test('function isStraight', () => {
    const ranks1 = ['ca', 'c3', 'c2', 'c4', 'c5'].map(
      (item) => item[1]
    ) as Rank[]
    const ranks2 = ['c2', 'c3', 'c4', 'c5', 'c6'].map(
      (item) => item[1]
    ) as Rank[]
    const ranks3 = ['ct', 'cj', 'cq', 'ck', 'ca'].map(
      (item) => item[1]
    ) as Rank[]
    const ranks4 = ['ca', 'c3', 'c4', 'c5', 'c6'].map(
      (item) => item[1]
    ) as Rank[]
    expect(isStraight(ranks1).result).toBe(true)
    expect(isStraight(ranks2).result).toBe(true)
    expect(isStraight(ranks3).result).toBe(true)
    expect(isStraight(ranks4).result).toBe(false)
  })

  test('function getFiveCardsRankSignature', () => {
    // 高牌：rank 从高到低可读，如 A-K-Q-J-9
    expect(getFiveCardsRankSignature(['ca', 'ck', 'cq', 'cj', 'h9'])).toBe(
      'q14+13+12+11+9'
    )
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 'c4', 'c5', 'h7'])[0]
    ).toEqual('q')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 'c4', 'c5', 'h2'])[0]
    ).toEqual('r')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 'c3', 'c5', 'h2'])[0]
    ).toEqual('s')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 's3', 'c5', 'h3'])[0]
    ).toEqual('t')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 's4', 'c5', 'ha'])[0]
    ).toEqual('u')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 'c4', 'c5', 'c7'])[0]
    ).toEqual('v')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 's3', 's2', 'h3'])[0]
    ).toEqual('w')
    expect(
      getFiveCardsRankSignature(['c2', 'h2', 's2', 'd2', 'h3'])[0]
    ).toEqual('x')
    expect(
      getFiveCardsRankSignature(['c2', 'c3', 'c4', 'c5', 'ca'])[0]
    ).toEqual('y')
    expect(
      getFiveCardsRankSignature(['ct', 'cj', 'cq', 'ck', 'ca'])[0]
    ).toEqual('z')
  })

  test('function getBestPokesRankSignature', () => {
    const max = getBestPokesRankSignature(
      [
        ['c2', 's2'],
        ['d3', 'ha']
      ],
      ['s3', 'h3', 'c3', 'h5', 'h6']
    )
    expect(max).toEqual('x3')
  })

  describe('getBestFiveCards', () => {
    test('公共牌3张：共5张牌，直接成牌', () => {
      const hand = ['h7', 'h8'] as const
      const board = ['h9', 'ht', 'hj'] as const
      const best = getBestFiveCards([...hand], [...board])
      expect(best).toHaveLength(5)
      expect(new Set(best).size).toBe(5)
      expect(getFiveCardsRankSignature(best)[0]).toBe('y')
    })

    test('公共牌4张：6张里可组成四条', () => {
      const hand = ['d2', 'h2'] as const
      const board = ['c2', 's2', 'ca', 'ck'] as const
      const best = getBestFiveCards([...hand], [...board])
      expect(best).toHaveLength(5)
      expect(getFiveCardsRankSignature(best)).toBe('x2')
    })

    test('公共牌5张：7张里选最优五张（与多手牌场景一致）', () => {
      const best = getBestFiveCards(
        ['c2', 's2'],
        ['s3', 'h3', 'c3', 'h5', 'h6']
      )
      expect(getFiveCardsRankSignature(best)).toEqual(
        getFiveCardsRankSignature(['c2', 's2', 's3', 'h3', 'c3'])
      )
    })

    test('非法张数：公共牌非3/4/5或手牌非2张', () => {
      expect(() => getBestFiveCards(['ha'], ['h2', 'h3', 'h4'])).toThrow(
        /手牌须为2张/
      )
      expect(() => getBestFiveCards(['ha', 'hk'], [])).toThrow(/底牌数量不足/)
      expect(() => getBestFiveCards(['ha', 'hk'], ['h2'])).toThrow(
        /公共牌须为3/
      )
      expect(() =>
        getBestFiveCards(['ha', 'hk'], ['h2', 'h3', 'h4', 'h5', 'h6', 'h7'])
      ).toThrow(/公共牌须为3/)
    })
  })

  test('function compareFn', () => {
    // 比较高牌
    expect(
      compareFn(['c2', 'c3', 'c4', 'ht', 'ha'], ['c2', 'c3', 'c5', 'ht', 'ha'])
    ).toBeGreaterThan(0)
    expect(
      compareFn(['c2', 'h2', 'd5', 'd6', 'd7'], ['c2', 'h2', 'd5', 'd6', 'd8'])
    ).toBeGreaterThan(0)
    expect(
      compareFn(['c2', 'h2', 'd5', 'h5', 'd7'], ['c2', 'h2', 'd5', 'h5', 'd8'])
    ).toBeGreaterThan(0)
    expect(
      compareFn(['c2', 'h2', 'd5', 'h5', 'd7'], ['c2', 'h2', 'd6', 'h6', 'd8'])
    ).toBeGreaterThan(0)
    expect(
      compareFn(['c3', 'c4', 'd5', 'h6', 'd7'], ['c2', 'c3', 'h4', 'c5', 'ca'])
    ).toBeLessThan(0)
    expect(
      compareFn(['c3', 'c4', 'd5', 'h6', 'd7'], ['c4', 'c3', 'h5', 'c6', 'c7'])
    ).toEqual(0)

    expect(
      compareFn(['c3', 'c4', 'c5', 'ca', 'c7'], ['c4', 'c3', 'c5', 'c6', 'ct'])
    ).toBeLessThan(0)

    expect(
      compareFn(['c3', 'h3', 's5', 'h5', 'd5'], ['d2', 's2', 'c5', 'h5', 'd5'])
    ).toBeLessThan(0)

    expect(
      compareFn(['c3', 'c5', 's5', 'h5', 'd5'], ['d2', 's2', 'c5', 'h5', 'd5'])
    ).toBeLessThan(0)

    expect(
      compareFn(['c3', 'c4', 'c5', 'c6', 'c7'], ['c3', 'c5', 's5', 'h5', 'd5'])
    ).toBeLessThan(0)

    expect(
      compareFn(['c3', 'c4', 'c5', 'c6', 'c7'], ['c8', 'c4', 'c5', 'c6', 'c7'])
    ).toBeGreaterThan(0)

    expect(
      compareFn(['ct', 'cj', 'cq', 'ck', 'ca'], ['ca', 'c4', 'c5', 'c2', 'c4'])
    ).toBeLessThan(0)
  })

  test('getFiveCardsStrength 与 compareFn 顺序一致，牌力越大数值越大', () => {
    const weaker = ['c2', 'c3', 'c4', 'ht', 'ha'] as const
    const stronger = ['c2', 'c3', 'c5', 'ht', 'ha'] as const
    expect(compareFn([...weaker], [...stronger])).toBeGreaterThan(0)
    expect(getFiveCardsStrength([...stronger])).toBeGreaterThan(
      getFiveCardsStrength([...weaker])
    )

    const royal = ['ct', 'cj', 'cq', 'ck', 'ca'] as const
    const highCard = ['ca', 'c4', 'c5', 'c2', 'c3'] as const
    expect(getFiveCardsStrength([...royal])).toBeGreaterThan(
      getFiveCardsStrength([...highCard])
    )
  })

  test('getStrengthFromRankSignature 与 getFiveCardsRankSignature 结果一致', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'h7'] as const
    const rankSignature = getFiveCardsRankSignature([...hand])
    expect(getFiveCardsStrength([...hand])).toBe(
      getStrengthFromRankSignature(rankSignature)
    )
  })
})
