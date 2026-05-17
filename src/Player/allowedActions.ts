import { ActionTypeEnum } from './constant'
import TexasError, { type TexasErrorCode } from '@/TexasError'

/**
 * 纯函数：根据桌面公开状态推导当前玩家允许的行动列表（与倒计时、回调无关）。
 * 输入可由 {@link Player#getAllowedActionsContext} 构造，便于单测与机器人与 `Player` 解耦。
 */
export type AllowedActionsContext = {
  /** 仍在底池争胜且可参与下注轮（思考权以 `Controller.activePlayer` 为准，不由状态位表达） */
  selfStatus: 'allIn' | 'eligible' | 'out'
  selfBalance: number
  selfCurrentStageTotal: number
  dealerActionHistory: readonly {
    getAction(): { type: ActionTypeEnum } | undefined
    getStatus(): string
    readonly currentStageTotalAmount: number
  }[]
  maxOthersStageBet: number
  isBigBlindPreFlopOption: boolean
  isJoiningBlindPreFlopOption: boolean
}

export function resolveAllowedActions(
  ctx: AllowedActionsContext
): ActionTypeEnum[] {
  const helper = (
    lastPlayer?: {
      getAction(): { type: ActionTypeEnum } | undefined
      getStatus(): string
      readonly currentStageTotalAmount: number
    } | null
  ): ActionTypeEnum[] => {
    if (ctx.selfStatus === 'allIn' || ctx.selfStatus === 'out') {
      return []
    }

    if (!lastPlayer || !lastPlayer.getAction())
      return [
        ActionTypeEnum.BET,
        ActionTypeEnum.ALL_IN,
        ActionTypeEnum.FOLD,
        ActionTypeEnum.CHECK
      ]

    if (lastPlayer.getAction()?.type === ActionTypeEnum.FOLD) {
      const player = [...ctx.dealerActionHistory]
        .reverse()
        .find((p) => p.getStatus() !== 'out')
      return helper(player ?? null)
    }

    if (
      lastPlayer.getAction()!.type === ActionTypeEnum.CHECK &&
      lastPlayer.currentStageTotalAmount === 0
    ) {
      return [
        ActionTypeEnum.ALL_IN,
        ActionTypeEnum.BET,
        ActionTypeEnum.CHECK,
        ActionTypeEnum.FOLD
      ]
    }

    if (ctx.selfBalance + ctx.selfCurrentStageTotal <= ctx.maxOthersStageBet) {
      return [ActionTypeEnum.ALL_IN, ActionTypeEnum.FOLD]
    }

    const la = lastPlayer.getAction()!
    if (la.type === ActionTypeEnum.BET) {
      return [
        ActionTypeEnum.CALL,
        ActionTypeEnum.RAISE,
        ActionTypeEnum.ALL_IN,
        ActionTypeEnum.FOLD
      ]
    }

    if (la.type === ActionTypeEnum.RAISE) {
      return [
        ActionTypeEnum.CALL,
        ActionTypeEnum.RAISE,
        ActionTypeEnum.ALL_IN,
        ActionTypeEnum.FOLD
      ]
    }

    if (la.type === ActionTypeEnum.ALL_IN) {
      return [
        ActionTypeEnum.CALL,
        ActionTypeEnum.RAISE,
        ActionTypeEnum.ALL_IN,
        ActionTypeEnum.FOLD
      ]
    }

    return [
      ActionTypeEnum.CALL,
      ActionTypeEnum.RAISE,
      ActionTypeEnum.FOLD,
      ActionTypeEnum.ALL_IN
    ]
  }

  const last =
    ctx.dealerActionHistory[ctx.dealerActionHistory.length - 1] ?? null
  const result = helper(last)

  if (
    (ctx.isBigBlindPreFlopOption || ctx.isJoiningBlindPreFlopOption) &&
    result.includes(ActionTypeEnum.CALL) &&
    ctx.selfCurrentStageTotal >= ctx.maxOthersStageBet
  ) {
    return [
      ActionTypeEnum.CHECK,
      ActionTypeEnum.RAISE,
      ActionTypeEnum.FOLD,
      ActionTypeEnum.ALL_IN
    ]
  }
  return result
}

/**
 * 自愿动作是否被当前允许列表接纳（纯函数）。
 * 返回 `TexasError` 供调用方 `player.fail(err)`；通过则返回 `null`。
 */
export function voluntaryActionDisallowError(
  allowed: readonly ActionTypeEnum[],
  required: ActionTypeEnum,
  disallowCode: TexasErrorCode
): TexasError | null {
  if (allowed.includes(required)) return null
  return new TexasError(disallowCode)
}
