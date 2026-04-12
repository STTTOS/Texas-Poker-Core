/**
 * 单桌统一意图入口；由 {@link Texas#dispatchCommand} 校验「当前行动方」后委托 `Player` 方法。
 * 超时等仍应建模为 Command（如 `FoldDueToTimeout`），由业务在计时到期时下发。
 */
export type TableCommand =
  | { type: 'Fold'; playerId: number }
  | { type: 'Check'; playerId: number }
  | { type: 'Call'; playerId: number }
  | { type: 'Bet'; playerId: number; amount: number }
  | { type: 'Raise'; playerId: number; additionalAmount: number }
  | { type: 'AllIn'; playerId: number }
  /** 业务层计时到期：等价于规则允许的弃牌/收权，payload 与 Fold 一致，便于审计区分 */
  | { type: 'FoldDueToTimeout'; playerId: number }
