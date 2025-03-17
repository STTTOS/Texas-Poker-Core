import { Player } from '@/Player'
import { Stage } from '@/Controller'
import { sum, everyMap, filterMap } from '@/utils'

// 提供奖池结算的能力
interface Pot {
  amount: number
  players: Set<Player>
}
class Pool {
  #mainPool = 0
  #pots: Pot[] = []
  #players: Set<Player> = new Set()
  // 存储下注记录
  #betRecords: Map<Stage, Map<Player, number>> = new Map()

  add(player: Player, amount: number, stage: Exclude<Stage, 'showdown'>) {
    if (amount <= 0 || player.getBalance() < amount)
      throw new Error('下注金额异常')

    this.#players.add(player)
    const target = this.#betRecords.get(stage)
    if (!target) {
      this.#betRecords.set(stage, new Map([[player, amount]]))
    } else target.set(player, target.get(player) || 0 + amount)
  }
  reset() {
    this.#pots = []
  }
  getBetHistory() {
    return this.#betRecords
  }
  getMainPool() {
    return this.#mainPool
  }
  getPots() {
    return this.#pots
  }

  // TODO: 边池的合并
  /**
   * @description 根据主池 和 边池的金额, 结算出
   * 需要给各个玩家支付的金额
   */
  settle() {
    this.calculateMainPoolAndSidePots()

    this.#pots.forEach((pot) => {
      console.log(pot.amount)
      console.log(Array.from(pot.players).map((p) => p.toString()))
    })

    return {
      mainPool: this.#mainPool,
      sidePool: this.#pots.map((pot) => pot.amount).reduce(sum)
    }
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
    if (filterMap((value) => value !== 0, records).size === countOfPlayers) {
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
    if (bets.size === 0 || everyMap((value) => value === 0, bets)) return

    const minBetAmount = Math.min(...bets.values())

    this.#pots.push({
      amount: minBetAmount * bets.size,
      players: new Set(bets.keys())
    })
    bets.forEach((value, key) => {
      bets.set(key, value - minBetAmount)
    })
    this.calculateSidePot(filterMap((value) => value !== 0, bets))
  }
}
export default Pool
