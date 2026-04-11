import type { TexasErrorCallback } from '@/gameContracts'
import type { PlayerStreetBetLedger } from '@/playerSessionPorts'

import { Player } from '@/Player'
import TexasError, { TexasCoreErrorCode } from '@/TexasError'

/**
 * 街道下注的**玩家侧账务**：校验后从余额扣款并累加 `currentStageTotalAmount` / `totalBetAmount`。
 * 不负责边池结构；与 {@link Pool} 内 `#recordPotContribution` 组合即完整 `Pool.add`。
 * 便于单测扣款规则、将来接审计流水或替换为托管账户模型。
 */
export class StreetBetLedger implements PlayerStreetBetLedger<Player> {
  readonly #fail: TexasErrorCallback

  constructor(fail: TexasErrorCallback) {
    this.#fail = fail
  }

  /**
   * 校验金额与余额，并写入玩家筹码字段（不碰中央池数据结构）。
   */
  assertAndApplyPlayerDebit(player: Player, amount: number): void {
    if (amount <= 0) {
      return this.#fail(
        new TexasError(TexasCoreErrorCode.POOL_NEGATIVE_AMOUNT, { amount })
      )
    }
    if (player.balance < amount) {
      return this.#fail(
        new TexasError(TexasCoreErrorCode.POOL_INSUFFICIENT_BALANCE, {
          balance: player.balance,
          amount
        })
      )
    }

    player.balance -= amount
    player.wager -= amount
    player.currentStageTotalAmount += amount
    player.totalBetAmount += amount
  }
}
