import { equals } from 'ramda'

import { Player } from '@/Player'
import { Stage } from '@/Controller'
import { sum, filterMap } from '@/utils'
import { formatter, getWinner } from '@/Deck/core'

// 提供奖池结算的能力
class Pool {
  // 这场游戏总下注额度
  #totalAmount = 0
  // 主池
  #mainPool = 0
  // 存储边池信息
  #pots: Map<Set<Player>, number> = new Map()
  // 参与下注的玩家
  #players: Set<Player> = new Set()
  // 存储下注记录
  #betRecords: Map<Stage, Map<Player, number>> = new Map()

  /**
   * @description 玩家在特定的阶段下注时, 记录下注信息
   * @param player
   * @param amount
   * @param stage
   */
  add(player: Player, amount: number, stage: Exclude<Stage, 'showdown'>) {
    if (amount <= 0 || player.getBalance() < amount)
      throw new Error('下注金额异常')

    this.#totalAmount += amount
    this.#players.add(player)
    const target = this.#betRecords.get(stage)
    if (!target) {
      this.#betRecords.set(stage, new Map([[player, amount]]))
    } else target.set(player, target.get(player) || 0 + amount)
  }
  /**
   * @description 重置下注信息
   */
  reset() {
    this.#pots = new Map()
    this.#mainPool = 0
    this.#totalAmount = 0
    this.#players = new Set()
    this.#betRecords = new Map()
  }
  get betRecords() {
    return this.#betRecords
  }
  get mainPool() {
    return this.#mainPool
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
    getWinner(
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

    // 如果剩奖池不够支付所有玩家, 说明游戏的计算出现异常, 需要中止这场比赛,并作废
    if (bills.values().reduce(sum, 0) > this.#totalAmount) {
      // TODO: 需要给所有玩家提示游戏发生异常, 此局作废
      throw new Error('支付发生错误,游戏中止')
    }

    for (const [player, amount] of bills) {
      await player.earn(amount)
    }
    this.reset()
  }

  get totalAmount() {
    return this.#totalAmount
  }
  /**
   * @description 根据主池 和 边池的金额, 结算出
   * 需要给各个玩家支付的金额
   */
  settle() {
    this.calculateMainPoolAndSidePots()

    console.log('玩家牌力大小:')
    this.#players.forEach((player) => {
      console.log(
        player.getUserInfo().id,
        player.getPresentation(),
        formatter(player.getHandPokes())
      )
    })
    console.log('主池:', this.#mainPool)
    console.log(Array.from(this.#players).map((p) => p.getUserInfo().id))
    console.log('边池:')
    this.#pots.forEach((amount, players) => {
      console.log(amount)
      console.log(Array.from(players).map((p) => p.getUserInfo().id))
    })

    // 记录需要给每个玩家支付多少Money
    const result: Map<Player, number> = new Map()
    this.#distribute(Array.from(this.#players), this.#mainPool, (p, amount) =>
      result.set(p, (result.get(p) || 0) + amount)
    )

    this.#pots.forEach((total, players) => {
      this.#distribute(Array.from(players), total, (player, amount) =>
        result.set(player, (result.get(player) || 0) + amount)
      )
    })

    const filtered = filterMap((value) => value !== 0, result)
    console.log('奖池分配情况:')
    filtered.forEach((amount, winner) => {
      console.log('amount:', amount)
      winner.log()
    })
    return filtered
  }

  /**
   * @description 根据各个阶段的下注情况, 计算主池 + 边池
   */
  calculateMainPoolAndSidePots() {
    this.#betRecords.forEach((_, stage) => {
      this.calculateStage(stage)
    })
  }

  /**
   * @description 计算单个阶段的奖池分配情况
   */
  calculateStage(stage: Stage) {
    const countOfPlayers = this.#players.size
    const records = this.#betRecords.get(stage)

    if (!records || records.size === 0) return

    // 所有玩家都有下注, 将其中的部分金额计算入主池
    if (
      records
        .values()
        .filter((value) => value !== 0)
        .toArray().length === countOfPlayers
    ) {
      const minBetAmount = Math.min(...records.values())
      this.#mainPool += minBetAmount * countOfPlayers

      records.forEach((value, key) => {
        const result = value - minBetAmount
        records.set(key, result)
      })
    }
    this.calculateSidePot(filterMap((value) => value !== 0, records))
  }

  /**
   * @description 计算边池
   */
  calculateSidePot(bets: Map<Player, number>) {
    if (bets.size === 0 || bets.values().every((amount) => amount === 0)) return

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
