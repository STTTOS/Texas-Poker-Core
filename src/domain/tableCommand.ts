/**
 * 单桌统一意图入口；由 {@link Texas#dispatchCommand} 校验入座后委托 `handBettingActions`，并同步返回领域事件。
 * 超时：`FoldDueToTimeout` / `CheckDueToTimeout`（**仍须为当前行动方**）。
 * 离场：`FoldDueToLeave`（**须为当前行动方**；`TurnEnded.reason` 为 `leave`）。
 */
export type TableCommand =
  | { type: 'Fold'; playerId: number }
  | { type: 'Check'; playerId: number }
  /**
   * 仅当 `resolveAllowedActions` 含 `CALL` 时合法；短码仅 `ALL_IN|FOLD` 时须发 `AllIn`。
   */
  | { type: 'Call'; playerId: number }
  | { type: 'Bet'; playerId: number; amount: number }
  | { type: 'Raise'; playerId: number; additionalAmount: number }
  | { type: 'AllIn'; playerId: number }
  /** 业务层计时到期：等价于弃牌，`TurnEnded.reason` 为 `timeout`（须为当前行动方） */
  | { type: 'FoldDueToTimeout'; playerId: number }
  /**
   * 玩家离开游戏：立即弃牌，须为当前行动方；与同席 `Fold` 相同的校验与落账，`TurnEnded.reason` 为 `leave`。
   */
  | { type: 'FoldDueToLeave'; playerId: number }
  /** 业务层计时到期：仅当可过牌时下发，等价于过牌，`TurnEnded.reason` 为 `timeout` */
  | { type: 'CheckDueToTimeout'; playerId: number }
  /**
   * 中途入座：在翻牌前、且本街尚未入池时，按桌级大盲强制贴盲（`min(BB, 余额)`），
   * 不交权、不触发自愿行动校验；金额由 core 从 `Dealer.stakes.bigBlind` 推导，不由业务传参。
   *
   * 默认仍拒绝 **当前 `activePlayer`**（防滥用自愿行动绕过）。业务在「一手开局后批量贴入座大盲」时，
   * 若某待贴玩家恰为翻前首动位（`BB.getNext()`），须传 **`allowWhenCurrentActor: true`**（仅服务端对可信入座队列使用）。
   */
  | {
      type: 'PostBigBlind'
      playerId: number
      /** 为 true 时允许当前思考方贴入座大盲（须仍满足 `currentStageTotalAmount === 0` 等其余校验） */
      allowWhenCurrentActor?: boolean
    }
