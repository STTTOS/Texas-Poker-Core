import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'

/**
 * 加注路径中「增量筹码」的纯校验（不含行动权 / 允许列表；不含满额转全下——由 {@link executeRaise} 编排）。
 */
export type ResolveRaiseAdditionalInput = Readonly<{
  additionalChips: number
  selfBalance: number
  lowestBetAmount: number
  selfCurrentStageTotal: number
  /** 与 `Player#getMaxOthersStageBet` 一致 */
  maxOthersStageBet: number
}>

export type ResolveRaiseAdditionalOk = Readonly<{ ok: true }>
export type ResolveRaiseAdditionalFail = Readonly<{
  ok: false
  error: TexasError
}>

export function resolveRaiseAdditionalOrError(
  input: ResolveRaiseAdditionalInput
): ResolveRaiseAdditionalOk | ResolveRaiseAdditionalFail {
  const {
    additionalChips,
    selfBalance,
    lowestBetAmount,
    selfCurrentStageTotal,
    maxOthersStageBet
  } = input

  if (additionalChips > selfBalance) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_RAISE_EXCEEDS_BALANCE, {
        money: additionalChips,
        balance: selfBalance
      })
    }
  }
  if (additionalChips < lowestBetAmount) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_RAISE_BELOW_BB, {
        money: additionalChips,
        lowestBetAmount
      })
    }
  }

  const attemptedStreetTotal = additionalChips + selfCurrentStageTotal
  if (attemptedStreetTotal <= maxOthersStageBet) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_RAISE_NOT_INCREASE, {
        maxBetAmount: maxOthersStageBet,
        attemptedTotal: attemptedStreetTotal
      })
    }
  }

  return { ok: true }
}
