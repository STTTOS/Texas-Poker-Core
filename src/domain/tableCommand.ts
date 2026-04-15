/**
 * 单桌统一意图入口；由 {@link Texas#dispatchCommand} 校验入座后委托 `handBettingActions`。
 * 超时：`FoldDueToTimeout` / `CheckDueToTimeout`（**仍须为当前行动方**）。
 * 离场：`FoldDueToLeave`（**可非当前行动方**，立即弃牌；当前方时 `TurnEnded.reason` 为 `leave`）。
 */
export type TableCommand =
  | { type: 'Fold'; playerId: number }
  | { type: 'Check'; playerId: number }
  | { type: 'Call'; playerId: number }
  | { type: 'Bet'; playerId: number; amount: number }
  | { type: 'Raise'; playerId: number; additionalAmount: number }
  | { type: 'AllIn'; playerId: number }
  /** 业务层计时到期：等价于弃牌，`TurnEnded.reason` 为 `timeout`（须为当前行动方） */
  | { type: 'FoldDueToTimeout'; playerId: number }
  /**
   * 玩家离开游戏：立即弃牌，**不要求**为当前行动方；非当前方不交权链，仅标记 `out` 并尝试收局。
   * 当前方时等价于带 `skipTurnOfferRequirement` 的弃牌，`TurnEnded.reason` 为 `leave`。
   */
  | { type: 'FoldDueToLeave'; playerId: number }
  /** 业务层计时到期：仅当可过牌时下发，等价于过牌，`TurnEnded.reason` 为 `timeout` */
  | { type: 'CheckDueToTimeout'; playerId: number }
  /**
   * 中途入座：在翻牌前、非当前思考方、且本街尚未入池时，按桌级大盲强制贴盲（`min(BB, 余额)`），
   * 不交权、不触发自愿行动校验；金额由 core 从 `Dealer.stakes.bigBlind` 推导，不由业务传参。
   */
  | { type: 'PostBigBlind'; playerId: number }
