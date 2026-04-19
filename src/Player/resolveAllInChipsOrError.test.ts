import TexasError from '@/TexasError'
import { TexasCoreErrorCode } from '@/TexasError'
import { resolveAllInChipsOrError } from './resolveAllInChipsOrError'

describe('resolveAllInChipsOrError', () => {
  test('success with positive balance', () => {
    expect(resolveAllInChipsOrError({ selfBalance: 800 })).toEqual({
      ok: true,
      chipsToCommit: 800
    })
  })

  test('invalid when zero or negative', () => {
    const r = resolveAllInChipsOrError({ selfBalance: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(TexasError)
      expect(r.error.code).toBe(TexasCoreErrorCode.PLAYER_ALL_IN_INVALID)
    }
  })
})
