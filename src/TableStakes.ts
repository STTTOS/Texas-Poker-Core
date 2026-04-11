/**
 * 单桌盲注结构（只读配置）。引擎当前以「大盲额」为单一数字入口，小盲按大盲之半推导。
 * 后续可在此扩展 ante、straddle、级别升降等，而不在 Dealer / Player / Room 上重复字段。
 */
export class TableStakes {
  readonly bigBlind: number

  constructor(bigBlind: number) {
    if (!Number.isFinite(bigBlind) || bigBlind <= 0) {
      throw new RangeError(
        'TableStakes: bigBlind must be a positive finite number'
      )
    }
    this.bigBlind = bigBlind
  }

  /** 与历史字段 `lowestBetAmount` 同义，便于渐进迁移 */
  get lowestBetAmount(): number {
    return this.bigBlind
  }

  /**
   * 当前约定：小盲 = 大盲 / 2（与 `Controller.takeActionInPreFlop` 原逻辑一致）。
   */
  get smallBlind(): number {
    return this.bigBlind / 2
  }
}
