import Texas from '@/Texas'
import { captureTableSnapshot } from './tableSnapshot'

describe('captureTableSnapshot', () => {
  test('idle table exposes room and empty pot', () => {
    const texas = new Texas({
      lowestBetAmount: 500,
      maximumCountOfPlayers: 6,
      initialChips: 5000,
      user: { id: 1, name: 'a' }
    })
    texas.room.seat(texas.room.owner)
    const snap = captureTableSnapshot(texas)
    expect(snap.handLifecycle).toBe('idle')
    expect(snap.handId).toBeNull()
    expect(snap.potTotal).toBe(0)
    expect(snap.contributions).toEqual([])
    expect(snap.communityCards).toEqual([])
    expect(snap.players.length).toBe(1)
    expect(snap.players[0].userId).toBe(1)
  })
})
