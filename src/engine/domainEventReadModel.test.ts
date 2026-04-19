import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import {
  flatConcatDomainEvents,
  reducePotFromDomainEvents,
  reduceLastHandEndedFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastPotAwardedFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reduceLastBlindsPostedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents
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
          boardThroughStageAfter: StageEnum.FLOP,
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
          boardThroughStageAfter: StageEnum.TURN,
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
          currentStage: StageEnum.RIVER,
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
          currentStage: StageEnum.PRE_FLOP,
          endStage: StageEnum.PRE_FLOP,
          showHandPokes: false
        }
      }
    ]
    const h = reduceLastHandEndedFromDomainEvents(events)
    expect(h?.seq).toBe(99)
    expect(h?.outcome).toBe('fold_win')
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
})
