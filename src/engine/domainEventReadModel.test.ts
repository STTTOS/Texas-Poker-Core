import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { StageEnum } from '@/Controller'
import { RoleEnum, ActionTypeEnum } from '@/Player/constant'
import {
  flatConcatDomainEvents,
  reducePotFromDomainEvents,
  filterDomainEventsByHandId,
  reduceHandIdFromFirstHandStarted,
  reduceLastHandEndedFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceTurnEndedTrailFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reduceFirstHandStartedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents,
  reduceLastRolesAssignedFromDomainEvents,
  reduceLastStageAdvancedFromDomainEvents,
  reduceLastHoleCardsDealtFromDomainEvents,
  reduceLastPostedBigBlindFromDomainEvents
} from './domainEventReadModel'

describe('domainEventReadModel (pure projection)', () => {
  test('flatConcatDomainEvents preserves order', () => {
    const a: TexasDomainEvent[] = [
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 1,
          totalAmount: 10,
          contributions: [{ userId: 1, amount: 10 }]
        }
      }
    ]
    const b: TexasDomainEvent[] = [
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 2,
          totalAmount: 20,
          contributions: [{ userId: 1, amount: 20 }]
        }
      }
    ]
    expect(flatConcatDomainEvents([a, b]).map((e) => e.payload.seq)).toEqual([
      1, 2
    ])
  })

  test('reducePotFromDomainEvents keeps last PotUpdated', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 1,
          totalAmount: 100,
          contributions: [{ userId: 1, amount: 100 }]
        }
      },
      {
        type: 'PlayerActed',
        payload: {
          handId: 'h1',
          seq: 2,
          userId: 2,
          street: StageEnum.PRE_FLOP,
          actionType: ActionTypeEnum.CALL
        }
      },
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 3,
          totalAmount: 200,
          contributions: [
            { userId: 1, amount: 100 },
            { userId: 2, amount: 100 }
          ]
        }
      }
    ]

    const m = reducePotFromDomainEvents(events)
    expect(m.totalAmount).toBe(200)
    expect(m.contributions).toEqual([
      { userId: 1, amount: 100 },
      { userId: 2, amount: 100 }
    ])
  })

  test('empty when no PotUpdated', () => {
    expect(reducePotFromDomainEvents([]).totalAmount).toBe(0)
  })

  test('reduceLastTurnOfferedFromDomainEvents keeps last TurnOffered', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'TurnOffered',
        payload: {
          handId: 'h1',
          seq: 1,
          userId: 1,
          street: StageEnum.PRE_FLOP,
          allowedActions: [ActionTypeEnum.CHECK],
          restrict: { min: 0, max: 0 }
        }
      },
      {
        type: 'TurnOffered',
        payload: {
          handId: 'h1',
          seq: 5,
          userId: 2,
          street: StageEnum.PRE_FLOP,
          allowedActions: [ActionTypeEnum.FOLD, ActionTypeEnum.CALL],
          restrict: { min: 0, max: 100 }
        }
      }
    ]
    const t = reduceLastTurnOfferedFromDomainEvents(events)
    expect(t?.userId).toBe(2)
    expect(t?.allowedActions).toContain(ActionTypeEnum.CALL)
  })

  test('reducePlayerActedTrailFromDomainEvents sorts by seq', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'PlayerActed',
        payload: {
          handId: 'h1',
          seq: 9,
          userId: 2,
          street: StageEnum.PRE_FLOP,
          actionType: ActionTypeEnum.CHECK
        }
      },
      {
        type: 'PlayerActed',
        payload: {
          handId: 'h1',
          seq: 3,
          userId: 1,
          street: StageEnum.PRE_FLOP,
          actionType: ActionTypeEnum.CALL,
          amount: 500
        }
      }
    ]
    const trail = reducePlayerActedTrailFromDomainEvents(events)
    expect(trail.map((t) => t.seq)).toEqual([3, 9])
    expect(trail[0]!.actionType).toBe(ActionTypeEnum.CALL)
  })

  test('reduceCommunityBoardFromDomainEvents concatenates StageAdvanced steps', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'StageAdvanced',
        payload: {
          handId: 'h1',
          seq: 10,
          fromStage: StageEnum.PRE_FLOP,
          toStage: StageEnum.FLOP,
          pokesRevealedThisStep: ['h2', 's3', 'd4'],
          advanceKind: 'betting_round_complete'
        }
      },
      {
        type: 'StageAdvanced',
        payload: {
          handId: 'h1',
          seq: 20,
          fromStage: StageEnum.FLOP,
          toStage: StageEnum.TURN,
          pokesRevealedThisStep: ['c5'],
          advanceKind: 'betting_round_complete'
        }
      }
    ]
    expect(reduceCommunityBoardFromDomainEvents(events)).toEqual([
      'h2',
      's3',
      'd4',
      'c5'
    ])
  })

  test('reduceLastHandEndedFromDomainEvents keeps last HandEnded', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'HandEnded',
        payload: {
          handId: 'h1',
          seq: 40,
          outcome: 'showdown',
          pokesRevealed: [],
          endStage: StageEnum.RIVER,
          showHandPokes: true
        }
      },
      {
        type: 'HandEnded',
        payload: {
          handId: 'h1',
          seq: 99,
          outcome: 'fold_win',
          pokesRevealed: [],
          endStage: StageEnum.PRE_FLOP,
          showHandPokes: false
        }
      }
    ]
    const h = reduceLastHandEndedFromDomainEvents(events)
    expect(h?.seq).toBe(99)
    expect(h?.outcome).toBe('fold_win')
  })

  test('reduceHandIdFromFirstHandStarted reads first HandStarted', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 0,
          totalAmount: 0,
          contributions: []
        }
      },
      {
        type: 'HandStarted',
        payload: { handId: 'h9', seq: 1 }
      }
    ]
    expect(reduceHandIdFromFirstHandStarted(events)).toBe('h9')
  })

  test('reduceLastStageAdvancedFromDomainEvents keeps last StageAdvanced', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'StageAdvanced',
        payload: {
          handId: 'h1',
          seq: 10,
          fromStage: StageEnum.PRE_FLOP,
          toStage: StageEnum.FLOP,
          pokesRevealedThisStep: ['h2', 's3', 'd4'],
          advanceKind: 'betting_round_complete'
        }
      },
      {
        type: 'StageAdvanced',
        payload: {
          handId: 'h1',
          seq: 20,
          fromStage: StageEnum.FLOP,
          toStage: StageEnum.TURN,
          pokesRevealedThisStep: ['c5'],
          advanceKind: 'betting_round_complete'
        }
      }
    ]
    const s = reduceLastStageAdvancedFromDomainEvents(events)
    expect(s?.seq).toBe(20)
    expect(s?.toStage).toBe(StageEnum.TURN)
  })

  test('reduceLastBlindsPostedFromDomainEvents keeps last BlindsPosted', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'BlindsPosted',
        payload: {
          handId: 'h1',
          seq: 2,
          posts: [{ userId: 1, amount: 50, kind: 'sb' }]
        }
      },
      {
        type: 'BlindsPosted',
        payload: {
          handId: 'h1',
          seq: 8,
          posts: [
            { userId: 1, amount: 50, kind: 'sb' },
            { userId: 2, amount: 100, kind: 'bb' }
          ]
        }
      }
    ]
    const b = reduceLastBlindsPostedFromDomainEvents(events)
    expect(b?.seq).toBe(8)
    expect(b?.posts).toHaveLength(2)
  })

  test('reduceLastPotAwardedFromDomainEvents keeps last PotAwarded', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'PotAwarded',
        payload: {
          handId: 'h1',
          seq: 50,
          potTotal: 100,
          allocations: [{ userId: 1, amount: 100 }]
        }
      },
      {
        type: 'PotAwarded',
        payload: {
          handId: 'h1',
          seq: 60,
          potTotal: 0,
          allocations: []
        }
      }
    ]
    const p = reduceLastPotAwardedFromDomainEvents(events)
    expect(p?.seq).toBe(60)
    expect(p?.potTotal).toBe(0)
  })

  test('reduceTurnEndedTrailFromDomainEvents sorts by seq', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'TurnEnded',
        payload: {
          handId: 'h1',
          seq: 5,
          userId: 2,
          reason: 'acted'
        }
      },
      {
        type: 'TurnEnded',
        payload: {
          handId: 'h1',
          seq: 2,
          userId: 1,
          reason: 'control_cleared'
        }
      }
    ]
    const t = reduceTurnEndedTrailFromDomainEvents(events)
    expect(t.map((x) => x.seq)).toEqual([2, 5])
  })

  test('reduceLastPostedBigBlindFromDomainEvents keeps last', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'PostedJoiningBigBlinds',
        payload: {
          handId: 'h1',
          seq: 3,
          posts: [{ userId: 9, amount: 400, requested: 500 }]
        }
      },
      {
        type: 'PostedJoiningBigBlinds',
        payload: {
          handId: 'h1',
          seq: 7,
          posts: [{ userId: 9, amount: 500, requested: 500 }]
        }
      }
    ]
    const p = reduceLastPostedBigBlindFromDomainEvents(events)
    expect(p?.seq).toBe(7)
    expect(p?.amount).toBe(500)
  })

  test('reduceLastRolesAssignedFromDomainEvents keeps last', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'RolesAssigned',
        payload: {
          handId: 'h1',
          seq: 1,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      },
      {
        type: 'RolesAssigned',
        payload: {
          handId: 'h1',
          seq: 4,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 },
            { userId: 2, name: 'b', role: RoleEnum.BB, actionIndex: 1 }
          ]
        }
      }
    ]
    const r = reduceLastRolesAssignedFromDomainEvents(events)
    expect(r?.handId).toBe('h1')
    expect(r?.seq).toBe(4)
    expect(r?.players).toHaveLength(2)
  })

  test('reduceFirstHandStartedFromDomainEvents and reduceHandId alias', () => {
    const events: TexasDomainEvent[] = [
      { type: 'RolesAssigned', payload: { handId: 'hx', seq: 1, players: [] } },
      {
        type: 'HandStarted',
        payload: { handId: 'hx', seq: 2 }
      }
    ]
    expect(reduceFirstHandStartedFromDomainEvents(events)).toEqual({
      handId: 'hx',
      seq: 2
    })
    expect(reduceHandIdFromFirstHandStarted(events)).toBe('hx')
  })

  test('filterDomainEventsByHandId keeps prelude and street rows for one hand', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'RolesAssigned',
        payload: { handId: 'h1', seq: 1, players: [] }
      },
      {
        type: 'HandStarted',
        payload: { handId: 'h1', seq: 2 }
      },
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 3,
          totalAmount: 100,
          contributions: []
        }
      },
      {
        type: 'HandStarted',
        payload: { handId: 'h2', seq: 1 }
      }
    ]
    const f = filterDomainEventsByHandId(events, 'h1')
    expect(f).toHaveLength(3)
    expect(f.some((e) => e.type === 'RolesAssigned')).toBe(true)
  })

  test('reduceLastHoleCardsDealtFromDomainEvents keeps last', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'HoleCardsDealt',
        payload: {
          handId: 'h1',
          seq: 1,
          byUserId: { 1: ['h2', 'h3'] }
        }
      },
      {
        type: 'HoleCardsDealt',
        payload: {
          handId: 'h1',
          seq: 5,
          byUserId: { 1: ['da', 'ck'], 2: ['s7', 'd9'] }
        }
      }
    ]
    const h = reduceLastHoleCardsDealtFromDomainEvents(events)
    expect(h?.seq).toBe(5)
    expect(h?.byUserId[1]).toEqual(['da', 'ck'])
    expect(h?.byUserId[2]).toEqual(['s7', 'd9'])
  })
})
