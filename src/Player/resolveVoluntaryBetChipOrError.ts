import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'

/**
 * 自愿下注（非盲注结构路径）的筹码意图纯校验；不含行动权 / 允许列表。
 * 盲注路径仍由 {@link executeBet} 用 `min(chipAmount, balance)` 编排。
 */
export type ResolveVoluntaryBetChipInput = Readonly<{
  chipAmount: number
  selfBalance: number
  lowestBetAmount: number
}>

export type ResolveVoluntaryBetChipOk = Readonly<{
  ok: true
  /** 与历史一致：自愿路径 `committed === chipAmount`（已通过余额与最低注校验） */
  committed: number
}>
export type ResolveVoluntaryBetChipFail = Readonly<{
  ok: false
  error: TexasError
}>

export function resolveVoluntaryBetChipOrError(
  input: ResolveVoluntaryBetChipInput
): ResolveVoluntaryBetChipOk | ResolveVoluntaryBetChipFail {
  const { chipAmount, selfBalance, lowestBetAmount } = input

  if (chipAmount > selfBalance) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE, {
        money: chipAmount,
        balance: selfBalance
      })
    }
  }

  const committed = chipAmount
  if (committed < lowestBetAmount) {
    return {
      ok: false,
      error: new TexasError(TexasCoreErrorCode.PLAYER_BET_BELOW_BB, {
        money: committed,
        lowestBetAmount
      })
    }
  }

  return { ok: true, committed }
}
