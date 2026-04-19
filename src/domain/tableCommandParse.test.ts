import {
  parseTableCommandFromJson,
  parseTableCommandFromUnknown
} from './tableCommandParse'

describe('parseTableCommandFromUnknown / parseTableCommandFromJson', () => {
  test.each([
    [{ type: 'Fold', playerId: 3 }, 'Fold', 3],
    [{ type: 'Check', playerId: 1 }, 'Check', 1],
    [{ type: 'Call', playerId: 2 }, 'Call', 2],
    [{ type: 'AllIn', playerId: 9 }, 'AllIn', 9],
    [{ type: 'FoldDueToTimeout', playerId: 1 }, 'FoldDueToTimeout', 1],
    [{ type: 'FoldDueToLeave', playerId: 2 }, 'FoldDueToLeave', 2],
    [{ type: 'CheckDueToTimeout', playerId: 3 }, 'CheckDueToTimeout', 3],
    [{ type: 'PostBigBlind', playerId: 4 }, 'PostBigBlind', 4]
  ])('parses %s', (input, expectedType, expectedPid) => {
    const c = parseTableCommandFromUnknown(input)
    expect(c.type).toBe(expectedType)
    expect('playerId' in c && c.playerId).toBe(expectedPid)
  })

  test('parses Bet and Raise with numeric extras', () => {
    expect(
      parseTableCommandFromUnknown({ type: 'Bet', playerId: 1, amount: 200 })
    ).toEqual({
      type: 'Bet',
      playerId: 1,
      amount: 200
    })
    expect(
      parseTableCommandFromUnknown({
        type: 'Raise',
        playerId: 2,
        additionalAmount: 400
      })
    ).toEqual({ type: 'Raise', playerId: 2, additionalAmount: 400 })
  })

  test('parseTableCommandFromJson round-trips', () => {
    const json = JSON.stringify({ type: 'Call', playerId: 7 })
    expect(parseTableCommandFromJson(json)).toEqual({
      type: 'Call',
      playerId: 7
    })
  })

  test('rejects unknown type, missing fields, non-finite numbers', () => {
    expect(() => parseTableCommandFromUnknown({ type: 'Snap' })).toThrow(
      /unknown type/
    )
    expect(() => parseTableCommandFromUnknown({ type: 'Fold' })).toThrow(
      /playerId/
    )
    expect(() =>
      parseTableCommandFromUnknown({ type: 'Bet', playerId: 1, amount: NaN })
    ).toThrow(/amount/)
    expect(() =>
      parseTableCommandFromUnknown({
        type: 'Raise',
        playerId: 1,
        additionalAmount: Infinity
      })
    ).toThrow(/additionalAmount/)
  })
})
