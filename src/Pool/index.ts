import { Player } from '@/Player'
import { Stage } from '@/Controller'

// 提供奖池结算的能力
interface Pot {
  amount: number
  players: Player[]
}
class Pool {
  #mainPool = 0
  #pots: Pot[] = []
  // 存储下注记录
  betRecords: Map<Stage, Map<Player, number>> = new Map()

  add(player: Player, amount: number, stage: Exclude<Stage, 'showdown'>) {
    if (amount <= 0) throw new Error('下注金额异常')

    const target = this.betRecords.get(stage)
    if (!target) {
      this.betRecords.set(stage, new Map([[player, amount]]))
    } else target.set(player, target.get(player) || 0 + amount)
  }
  reset() {
    this.#pots = []
  }
  getBetHistory() {
    return this.betRecords
  }
}
export default Pool
