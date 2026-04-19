import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'
import { resolveRaiseAdditionalOrError } from './resolveRaiseAdditionalOrError'

describe('resolveRaiseAdditionalOrError', () => {
  test('success when increment clears min raise and exceeds others street max', () => {
    const r = resolveRaiseAdditionalOrError({
      additionalChips: 600,
      selfBalance: 5000,
      lowestBetAmount: 500,
      selfCurrentStageTotal: 500,
      maxOthersStageBet: 1000
    })
    expect(r).toEqual({ ok: true })
  })

  test('exceeds balance', () => {
    const r = resolveRaiseAdditionalOrError({
      additionalChips: 200,
      selfBalance: 100,
      lowestBetAmount: 50,
      selfCurrentStageTotal: 0,
      maxOthersStageBet: 50
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(TexasError)
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_RAISE_EXCEEDS_BALANCE)
    }
  })

  test('below minimum raise increment', () => {
    const r = resolveRaiseAdditionalOrError({
      additionalChips: 400,
      selfBalance: 5000,
      lowestBetAmount: 500,
      selfCurrentStageTotal: 500,
      maxOthersStageBet: 1000
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_RAISE_BELOW_BB)
    }
  })

  test('does not increase over others max street total', () => {
    const r = resolveRaiseAdditionalOrError({
      additionalChips: 500,
      selfBalance: 5000,
      lowestBetAmount: 500,
      selfCurrentStageTotal: 500,
      maxOthersStageBet: 1000
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_RAISE_NOT_INCREASE)
    }
  })
})
