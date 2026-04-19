import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'

/**
 * 全下路径中「可推进筹码」的纯校验（不含行动权 / 允许列表）。
 */
export type ResolveAllInChipsInput = Readonly<{
  selfBalance: number
}>

export type ResolveAllInChipsOk = Readonly<{ ok: true; chipsToCommit: number }>
export type ResolveAllInChipsFail = Readonly<{ ok: false; error: TexasError }>

export function resolveAllInChipsOrError(
  input: ResolveAllInChipsInput
): ResolveAllInChipsOk | ResolveAllInChipsFail {
  const { selfBalance } = input
  if (selfBalance <= 0) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_ALL_IN_INVALID, {
        moneyShouldPay: selfBalance,
        balance: selfBalance
      })
    }
  }
  return { ok: true, chipsToCommit: selfBalance }
}
