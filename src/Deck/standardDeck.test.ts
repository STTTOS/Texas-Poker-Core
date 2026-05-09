import { createStandardDeckPokes } from './standardDeck'

describe('createStandardDeckPokes', () => {
  test('52 张唯一且顺序与 Deck 建牌约定一致', () => {
    const d = createStandardDeckPokes()
    expect(d).toHaveLength(52)
    expect(new Set(d).size).toBe(52)
    expect(d[0]).toBe('h2')
    expect(d[12]).toBe('ha')
    expect(d[13]).toBe('s2')
    expect(d[51]).toBe('ca')
  })
})
