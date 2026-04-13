/**
 * 单桌统一意图入口；由 {@link Texas#dispatchCommand} 校验入座与「当前行动方」后委托 `handBettingActions`。
 * 超时等仍应建模为 Command（如 `FoldDueToTimeout` / `CheckDueToTimeout`），由业务在计时到期时下发。
 */
export type TableCommand =
  | { type: 'Fold'; playerId: number }
  | { type: 'Check'; playerId: number }
  | { type: 'Call'; playerId: number }
  | { type: 'Bet'; playerId: number; amount: number }
  | { type: 'Raise'; playerId: number; additionalAmount: number }
  | { type: 'AllIn'; playerId: number }
  /** 业务层计时到期：等价于弃牌，`TurnEnded.reason` 为 `timeout` */
  | { type: 'FoldDueToTimeout'; playerId: number }
  /** 业务层计时到期：仅当可过牌时下发，等价于过牌，`TurnEnded.reason` 为 `timeout` */
  | { type: 'CheckDueToTimeout'; playerId: number }
