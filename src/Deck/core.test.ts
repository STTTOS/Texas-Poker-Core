import { Rank } from './constant'
import {
  compareFn,
  isStraight,
  getHandPresentation,
  getBestPokesPresentation
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

  test('function getHandPresentation', () => {
    expect(getHandPresentation(['c2', 'c3', 'c4', 'c5', 'h7'])[0]).toEqual('q')
    expect(getHandPresentation(['c2', 'c3', 'c4', 'c5', 'h2'])[0]).toEqual('r')
    expect(getHandPresentation(['c2', 'c3', 'c3', 'c5', 'h2'])[0]).toEqual('s')
    expect(getHandPresentation(['c2', 'c3', 's3', 'c5', 'h3'])[0]).toEqual('t')
    expect(getHandPresentation(['c2', 'c3', 's4', 'c5', 'ha'])[0]).toEqual('u')
    expect(getHandPresentation(['c2', 'c3', 'c4', 'c5', 'c7'])[0]).toEqual('v')
    expect(getHandPresentation(['c2', 'c3', 's3', 's2', 'h3'])[0]).toEqual('w')
    expect(getHandPresentation(['c2', 'h2', 's2', 'd2', 'h3'])[0]).toEqual('x')
    expect(getHandPresentation(['c2', 'c3', 'c4', 'c5', 'ca'])[0]).toEqual('y')
    expect(getHandPresentation(['ct', 'cj', 'cq', 'ck', 'ca'])[0]).toEqual('z')
  })

  test('function getBestPokesPresentation', () => {
    const max = getBestPokesPresentation(
      [
        ['c2', 's2'],
        ['d3', 'ha']
      ],
      ['s3', 'h3', 'c3', 'h5', 'h6']
    )
    expect(max).toEqual('x3')
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
})
