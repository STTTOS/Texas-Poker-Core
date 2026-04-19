import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { StageEnum } from '@/Controller'
import { RoleEnum, ActionTypeEnum } from '@/Player/constant'
import { projectCompositeReadModel } from './projectCompositeReadModel'

describe('projectCompositeReadModel', () => {
  test('aggregates reducers on a synthetic tape', () => {
    const events: TexasDomainEvent[] = [
      {
        type: 'RolesAssigned',
        payload: {
          seq: 1,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      },
      {
        type: 'HandStarted',
        payload: { handId: 'h1', seq: 2 }
      },
      {
        type: 'BlindsPosted',
        payload: {
          handId: 'h1',
          seq: 3,
          posts: [{ userId: 1, amount: 50, kind: 'sb' }]
        }
      },
      {
        type: 'PotUpdated',
        payload: {
          handId: 'h1',
          seq: 4,
          totalAmount: 150,
          contributions: [
            { userId: 1, amount: 50 },
            { userId: 2, amount: 100 }
          ]
        }
      },
      {
        type: 'PlayerActed',
        payload: {
          handId: 'h1',
          seq: 5,
          userId: 1,
          street: StageEnum.PRE_FLOP,
          actionType: ActionTypeEnum.CALL
        }
      },
      {
        type: 'StageAdvanced',
        payload: {
          handId: 'h1',
          seq: 6,
          fromStage: StageEnum.PRE_FLOP,
          toStage: StageEnum.FLOP,
          pokesRevealedThisStep: ['h2', 's3', 'd4'],
          boardThroughStageAfter: StageEnum.FLOP,
          advanceKind: 'betting_round_complete'
        }
      }
    ]

    const m = projectCompositeReadModel(events)
    expect(m.firstHandStarted).toEqual({ handId: 'h1', seq: 2 })
    expect(m.lastBlindsPosted?.seq).toBe(3)
    expect(m.pot.totalAmount).toBe(150)
    expect(m.communityBoard).toEqual(['h2', 's3', 'd4'])
    expect(m.lastStageAdvanced?.toStage).toBe(StageEnum.FLOP)
    expect(m.playerActedTrail).toHaveLength(1)
    expect(m.playerActedTrail[0]!.actionType).toBe(ActionTypeEnum.CALL)
  })
})
