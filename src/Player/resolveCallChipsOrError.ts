import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'

/**
 * 跟注路径中「应补筹码」的纯推导（不含行动权 / 允许列表校验）。
 * `chipsToMatch === selfBalance` 视为合法（清台跟注）；{@link executeCall} 与 Bet/Raise 一致，该情形转 {@link executeAllIn}。
 */
export type ResolveCallChipsInput = Readonly<{
  /** 本街其他玩家在本街已投入的最大额（与 `Player#getOthersMaxBetAmountAtCurrentStage` 一致） */
  maxOthersStageBet: number
  /** 当前玩家本街已投入 */
  selfCurrentStageTotal: number
  selfBalance: number
}>

export type ResolveCallChipsOk = Readonly<{ ok: true; chipsToMatch: number }>
export type ResolveCallChipsFail = Readonly<{ ok: false; error: TexasError }>

export function resolveCallChipsOrError(
  input: ResolveCallChipsInput
): ResolveCallChipsOk | ResolveCallChipsFail {
  const { maxOthersStageBet, selfCurrentStageTotal, selfBalance } = input
  const chipsToMatch = maxOthersStageBet - selfCurrentStageTotal

  if (chipsToMatch <= 0) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_CALL_INVALID_STATE, {
        moneyShouldPay: chipsToMatch,
        balance: selfBalance,
        maxBet: maxOthersStageBet
      })
    }
  }
  if (chipsToMatch > selfBalance) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_CALL_EXCEEDS_BALANCE, {
        moneyShouldPay: chipsToMatch,
        balance: selfBalance
      })
    }
  }

  return { ok: true, chipsToMatch }
}
