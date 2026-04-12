import type { StreetPotSink } from '@/playerSessionPorts'
import type { GameComponent, TexasErrorCallback } from '@/gameContracts'

import { equals } from 'ramda'

import { Player } from '@/Player'
import { sum, filterMap } from '@/utils'
import { getWinners } from './getWinners'
import { formatterPoke } from '@/Deck/core'
import { StreetBetLedger } from './StreetBetLedger'
import allocatePoolByInt from './allocatePoolByInt'
import { TexasEngineContext } from '@/TexasEngineContext'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

class Pool implements GameComponent, StreetPotSink<Player> {
  // 本轮游戏总下注额度
  #totalAmount = 0
  /**
   * 存储各个边池的玩家以及奖池大小
   * Set(player1, player2) => 1000, Set(player1, player2, player3) => 2000
   */
  #pots: Map<Set<Player>, number> = new Map()
  // 参与下注的玩家
  #players: Set<Player> = new Set()
  /**
   * 存储玩家的下注记录
   */
  #betRecords: Map<Player, number> = new Map()
  /**
   * 记录玩家分配的奖池金额
   */
  #bills: Map<number, number> = new Map()
  #paid = false
  /** 玩家扣款与街道累计（与中央池记账分离） */
  #streetLedger: StreetBetLedger
  fail: TexasErrorCallback

  constructor(
    fail: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.fail = fail
    this.#streetLedger = new StreetBetLedger(fail)
  }

  /**
   * 街道下注：`StreetBetLedger` 扣玩家筹码 → 本池累加 total、betRecords、参与人集合。
   */
  add(player: Player, amount: number) {
    this.#streetLedger.assertAndApplyPlayerDebit(player, amount)
    this.#recordPotContribution(player, amount)
  }

  #recordPotContribution(player: Player, amount: number) {
    this.#totalAmount += amount
    this.#players.add(player)
    this.#betRecords.set(player, (this.#betRecords.get(player) || 0) + amount)
  }
  /**
   * @description 重置下注信息
   */
  reset() {
    this.#pots = new Map()
    this.#totalAmount = 0
    this.#players = new Set()
    this.#betRecords = new Map()
    this.#bills = new Map()
    this.#paid = false
  }
  get bills() {
    return this.#bills
  }
  get betRecords() {
    return this.#betRecords
  }

  get pots() {
    return this.#pots
  }

  getSpecificPot(key: Set<Player>) {
    let result = 0

    this.#pots.forEach((amount, players) => {
      if (equals(players, key)) {
        result = amount
      }
    })
    return result
  }

  #distribute(
    players: Player[],
    totalAmount: number,
    callback: (player: Player, amount: number) => void
  ) {
    try {
      const winners = getWinners(Array.from(players))
      const pools = allocatePoolByInt(winners, totalAmount)
      pools.forEach(({ player, amount }) => {
        callback(player, amount)
      })
    } catch (error) {
      if (error instanceof TexasError) {
        this.fail(error)
      } else {
        this.fail(new TexasError(TexasCoreErrorCode.POOL_PAY_INVALID))
      }
    }
  }

  /**
   * @description 根据计算结果进行支付
   */
  pay() {
    if (this.#paid)
      return this.fail(new TexasError(TexasCoreErrorCode.POOL_ALREADY_PAID))

    const bills = this.settle()

    // 如果剩奖池不够支付所有玩家, 说明游戏的计算出现异常, 需要中止这场比赛,并作废
    if (Array.from(bills.values()).reduce(sum, 0) !== this.#totalAmount) {
      return this.fail(new TexasError(TexasCoreErrorCode.POOL_PAY_INVALID))
    }

    for (const [player, amount] of bills) {
      player.earn(amount)
    }
    this.#paid = true
  }

  get totalAmount() {
    return this.#totalAmount
  }

  /** 领域事件 `PotUpdated` 用：中央池总额 + 每人累计贡献 */
  getContributionSnapshot(): {
    totalAmount: number
    contributions: Array<{ userId: number; amount: number }>
  } {
    return {
      totalAmount: this.#totalAmount,
      contributions: Array.from(this.#betRecords.entries()).map(
        ([player, amount]) => ({
          userId: player.getUserInfo().id,
          amount
        })
      )
    }
  }
  /**
   * @description 计算各个边池
   * 需要给各个玩家支付的金额
   */
  settle() {
    this.calculate()

    TexasEngineContext.emitTrace({
      channel: 'pool',
      name: 'settle_rankings',
      data: {
        players: Array.from(this.#players).map((player) => ({
          name: player.getUserInfo().name,
          rankSignature: player.rankSignature,
          hand: formatterPoke(player.getHandPokes())
        }))
      }
    })
    TexasEngineContext.emitTrace({
      channel: 'pool',
      name: 'settle_pots',
      data: {
        pots: Array.from(this.#pots.entries()).map(
          ([players, amount]) =>
            `(${Array.from(players)
              .map((player) => player.getUserInfo().name)
              .join(',')})` + amount
        )
      }
    })

    // 记录需要给每个玩家支付多少Money
    const result: Map<Player, number> = new Map()
    this.#pots.forEach((total, players) => {
      this.#distribute(Array.from(players), total, (player, amount) =>
        result.set(player, (result.get(player) || 0) + amount)
      )
    })

    const filtered = filterMap((value) => value !== 0, result)
    filtered.forEach((amount, player) => {
      this.#bills.set(player.id, amount)
    })
    return filtered
  }

  /**
   * @description 根据下注记录, 计算奖池
   */
  calculate() {
    this.calculateSidePot(filterMap((value) => value !== 0, this.#betRecords))
  }

  /**
   * @description 计算边池
   */
  calculateSidePot(bets: Map<Player, number>) {
    if (
      bets.size === 0 ||
      Array.from(bets.values()).every((amount) => amount === 0)
    )
      return

    const minBetAmount = Math.min(...bets.values())

    const totalAmount = minBetAmount * bets.size
    this.#pots.set(new Set(bets.keys()), totalAmount)

    bets.forEach((value, key) => {
      bets.set(key, value - minBetAmount)
    })
    this.calculateSidePot(filterMap((value) => value !== 0, bets))
  }
}

export default Pool
