import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import {
  reducePotFromDomainEvents,
  reduceCommunityBoardFromDomainEvents,
  reduceLastTurnOfferedFromDomainEvents,
  reducePlayerActedTrailFromDomainEvents
} from './domainEventReadModel'

describe('domainEventReadModel (pure projection)', () => {
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
})
