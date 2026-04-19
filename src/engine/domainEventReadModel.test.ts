import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { StageEnum } from '@/Controller'
import { ActionTypeEnum } from '@/Player/constant'
import { reducePotFromDomainEvents } from './domainEventReadModel'

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
})
