import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'
import { resolveCallChipsOrError } from './resolveCallChipsOrError'

describe('resolveCallChipsOrError', () => {
  test('success when gap is positive and strictly less than balance', () => {
    const r = resolveCallChipsOrError({
      maxOthersStageBet: 1000,
      selfCurrentStageTotal: 500,
      selfBalance: 800
    })
    expect(r).toEqual({ ok: true, chipsToMatch: 500 })
  })

  test('invalid state when nothing to call', () => {
    const r = resolveCallChipsOrError({
      maxOthersStageBet: 500,
      selfCurrentStageTotal: 500,
      selfBalance: 2000
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(TexasError)
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_CALL_INVALID_STATE)
    }
  })

  test('exceeds balance', () => {
    const r = resolveCallChipsOrError({
      maxOthersStageBet: 2000,
      selfCurrentStageTotal: 0,
      selfBalance: 100
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_CALL_EXCEEDS_BALANCE)
    }
  })

  test('full-balance gap is valid sizing (executeCall routes to all-in)', () => {
    const r = resolveCallChipsOrError({
      maxOthersStageBet: 800,
      selfCurrentStageTotal: 0,
      selfBalance: 800
    })
    expect(r).toEqual({ ok: true, chipsToMatch: 800 })
  })
})
