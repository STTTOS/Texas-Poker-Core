import { equals } from 'ramda'

import TexasError from '@/error'
import { Player } from '@/Player'
import { Stage } from '@/Controller'
import { sum, filterMap } from '@/utils'
import { getWinners, formatterPoke } from '@/Deck/core'
import { GameComponent, TexasErrorCallback } from '@/Texas'

// 提供奖池结算的能力
class Pool implements GameComponent {
  // 这场游戏总下注额度
  #totalAmount = 0
  // 存储边池信息
  #pots: Map<Set<Player>, number> = new Map()
  // 参与下注的玩家
  #players: Set<Player> = new Set()
  // 存储下注记录
  #betRecords: Map<Stage, Map<Player, number>> = new Map()
  #bills: Map<number, number> = new Map()
  reportError: TexasErrorCallback

  constructor(
    reportError: TexasErrorCallback = (error) => {
      throw error
    }
  ) {
    this.reportError = reportError
  }
  /**
   * @description 玩家在特定的阶段下注时, 记录下注信息
   * @param player
   * @param amount
   * @param stage
   */
  add(player: Player, amount: number, stage: Stage) {
    if (amount <= 0)
      this.reportError(new TexasError(2001, '下注金额不可小于零'))
    if (player.balance < amount)
      this.reportError(new TexasError(2003, '玩家余额不足'))

    player.balance -= amount
    player.currentStageTotalAmount += amount

    this.#totalAmount += amount
    this.#players.add(player)
    const target = this.#betRecords.get(stage)
    if (!target) {
      this.#betRecords.set(stage, new Map([[player, amount]]))
    } else target.set(player, (target.get(player) || 0) + amount)
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
    getWinners(
      Array.from(players).filter((p) => p.getStatus() !== 'out')
    ).forEach((player, _, arr) => {
      callback(player, totalAmount / arr.length)
    })
  }

  /**
   * @description 根据计算结果进行支付
   */
  async pay() {
    const bills = this.settle()
    bills.forEach((amount, player) => {
      this.#bills.set(player.getUserInfo().id, amount)
    })

    // 如果剩奖池不够支付所有玩家, 说明游戏的计算出现异常, 需要中止这场比赛,并作废
    if (Array.from(bills.values()).reduce(sum, 0) !== this.#totalAmount) {
      this.reportError(new TexasError(2001, '支付发生错误, 数据异常'))
    }

    for (const [player, amount] of bills) {
      await player.earn(amount)
    }
  }

  get totalAmount() {
    return this.#totalAmount
  }
  /**
   * @description 计算各个边池
   * 需要给各个玩家支付的金额
   */
  settle() {
    this.calculate()

    console.log('玩家牌力大小:')
    this.#players.forEach((player) => {
      console.log(
        player.getUserInfo().name,
        player.getPresentation(),
        formatterPoke(player.getHandPokes())
      )
    })
    console.log('奖池:')
    console.log(
      Array.from(this.#pots.entries()).map(
        ([players, amount]) =>
          `(${Array.from(players)
            .map((player) => player.getUserInfo().name)
            .join(',')})` + amount
      )
    )

    // 记录需要给每个玩家支付多少Money
    const result: Map<Player, number> = new Map()
    this.#pots.forEach((total, players) => {
      this.#distribute(Array.from(players), total, (player, amount) =>
        result.set(player, (result.get(player) || 0) + amount)
      )
    })

    const filtered = filterMap((value) => value !== 0, result)
    return filtered
  }

  /**
   * @description 根据各个阶段的下注情况, 计算主池 + 边池
   */
  calculate() {
    this.#betRecords.forEach((_, stage) => {
      this.calculateStage(stage)
    })
  }

  /**
   * @description 计算单个阶段的奖池分配情况
   */
  calculateStage(stage: Stage) {
    const records = this.#betRecords.get(stage)

    if (!records || records.size === 0) return
    this.calculateSidePot(filterMap((value) => value !== 0, records))
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
    let findTarget = false
    this.#pots.forEach((amount = 0, players) => {
      if (equals(players, new Set(bets.keys()))) {
        findTarget = true
        this.#pots.set(players, amount + totalAmount)
      }
    })
    if (!findTarget) {
      this.#pots.set(new Set(bets.keys()), totalAmount)
    }

    bets.forEach((value, key) => {
      bets.set(key, value - minBetAmount)
    })
    this.calculateSidePot(filterMap((value) => value !== 0, bets))
  }
}

export default Pool
