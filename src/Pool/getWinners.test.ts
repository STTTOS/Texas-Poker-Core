import { Player } from '@/Player'
import { getWinners } from './getWinners'

type MockPlayerInput = {
  id: number
  status: 'eligible' | 'allIn' | 'out'
  rankSignature: string | null
  rankStrength: number
}

function mockPlayer(input: MockPlayerInput): Player {
  return {
    rankSignature: input.rankSignature,
    rankStrength: input.rankStrength,
    getStatus: () => input.status,
    getUserInfo: () => ({ id: input.id, name: `p${input.id}` })
  } as unknown as Player
}

describe('getWinners', () => {
  test('returns sole non-out player when all signatures are missing', () => {
    const players = [
      mockPlayer({
        id: 1,
        status: 'out',
        rankSignature: null,
        rankStrength: 0
      }),
      mockPlayer({
        id: 2,
        status: 'eligible',
        rankSignature: null,
        rankStrength: 0
      })
    ]
    const winners = getWinners(players)
    expect(winners.map((p) => p.getUserInfo().id)).toEqual([2])
  })

  test('throws when multiple non-out without rank (cannot showdown)', () => {
    const players = [
      mockPlayer({
        id: 1,
        status: 'eligible',
        rankSignature: null,
        rankStrength: 0
      }),
      mockPlayer({
        id: 2,
        status: 'eligible',
        rankSignature: null,
        rankStrength: 0
      })
    ]
    expect(() => getWinners(players)).toThrow()
  })

  test('throws when all players are out', () => {
    const players = [
      mockPlayer({
        id: 1,
        status: 'out',
        rankSignature: null,
        rankStrength: 0
      }),
      mockPlayer({ id: 2, status: 'out', rankSignature: null, rankStrength: 0 })
    ]
    expect(() => getWinners(players)).toThrow()
  })

  test('selects top rankStrength among non-out players', () => {
    const players = [
      mockPlayer({
        id: 1,
        status: 'eligible',
        rankSignature: 'A',
        rankStrength: 10
      }),
      mockPlayer({
        id: 2,
        status: 'eligible',
        rankSignature: 'B',
        rankStrength: 30
      }),
      mockPlayer({ id: 3, status: 'out', rankSignature: 'C', rankStrength: 99 })
    ]
    const winners = getWinners(players)
    expect(winners.map((p) => p.getUserInfo().id)).toEqual([2])
  })
})
