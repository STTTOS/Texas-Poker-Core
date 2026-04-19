import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'
import { resolveVoluntaryBetChipOrError } from './resolveVoluntaryBetChipOrError'

describe('resolveVoluntaryBetChipOrError', () => {
  test('success', () => {
    expect(
      resolveVoluntaryBetChipOrError({
        chipAmount: 1000,
        selfBalance: 5000,
        lowestBetAmount: 500
      })
    ).toEqual({ ok: true, committed: 1000 })
  })

  test('exceeds balance', () => {
    const r = resolveVoluntaryBetChipOrError({
      chipAmount: 6000,
      selfBalance: 5000,
      lowestBetAmount: 500
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(TexasError)
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_BET_EXCEEDS_BALANCE)
    }
  })

  test('below minimum bet', () => {
    const r = resolveVoluntaryBetChipOrError({
      chipAmount: 400,
      selfBalance: 5000,
      lowestBetAmount: 500
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_BET_BELOW_BB)
    }
  })
})
