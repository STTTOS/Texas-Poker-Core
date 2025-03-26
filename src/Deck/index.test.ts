import { equals } from 'ramda'

import Deck from './index'
import Dealer from '@/Dealer'
import { Player } from '@/Player'
import Controller from '@/Controller'
import { handPokeMap, handPokeType } from './constant'

describe('deck', () => {
  test('init deck successfully', () => {
    const deck = new Deck()
    expect(deck.getPokes().commonPokes.length).toEqual(0)
    expect(deck.getPokes().handPokes.length).toEqual(0)
    expect(deck.getCards().length).toEqual(52)
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

  // 耗时 10min, 平时不开启此测试
  test.skip('bias in deal probabilities', () => {
    // 牌型参考概率
    const standardProbability = new Map<handPokeType, number>([
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
    // 测试发牌的误差率
    const times = count
    // 记录对应牌型的命中次数
    const hitCountsMap = new Map<handPokeType, number>([])
    while (count > 0) {
      count--
      const dealer = new Dealer(200)
      const controller = new Controller(dealer)

      dealer.join(
        new Player({
          user: { id: 1, balance: 500 },
          lowestBetAmount: dealer.getLowestBetAmount(),
          controller,
          dealer
        })
      )
      dealer.setRoleToPlayers()
      dealer.dealCards()
      const type = dealer.getDeck().getMax().type
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
          // 概率偏差
          const offsetRate =
            (Math.abs(catchTimes / times - standardProbability.get(type)!) /
              standardProbability.get(type)!) *
            100
          // 牌型概率
          const probability = (catchTimes / times) * 100
          console.log(
            `${handPokeMap.get(
              type
            )} bias: ${offsetRate}%; probability: ${probability}%`
          )
          return offsetRate
        })
        .every((offsetRate) => offsetRate < 5) && totalCatchTimes === times
    expect(isPass).toBe(true)
  })
})
