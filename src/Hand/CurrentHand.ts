import type { Player } from '@/Player'
import type { HandLifecycle } from '@/gameContracts'

import { StageEnum, type Stage } from '@/Controller/stage'
import { HandSettlement } from '@/Controller/HandSettlement'

/**
 * 单桌「当前一手」的聚合状态：生命周期、街、控制权、盲注记录、摊牌评估。
 * 公牌进度与下注圈一致，由 {@link Controller} 维护的 `stage` 表示。
 * {@link Controller} 负责编排流程；本类只持有数据与 `HandSettlement`。
 */
export class CurrentHand {
  /** 一手在控制器中的生命周期 */
  status: HandLifecycle = 'idle'
  /** 当前下注圈（与已发公牌条数一致） */
  stage: Stage = StageEnum.PRE_FLOP
  /** 当前轮到行动的玩家 */
  activePlayer: Player | null = null
  /** 翻牌前自动下的盲注记录（展示/回放） */
  defaultBets: Array<{ userId: number; balance: number; amount: number }> = []
  /** 本手摊牌评估（按 userId） */
  readonly settlement: HandSettlement

  constructor() {
    this.settlement = new HandSettlement()
  }

  /** 局间清理：与 `Controller.reset` 中对手牌的期望一致 */
  reset() {
    this.status = 'idle'
    this.stage = StageEnum.PRE_FLOP
    this.activePlayer = null
    this.defaultBets = []
    this.settlement.reset()
  }
}
