import { StageEnum } from '@/Controller'
import { RoleEnum, ActionTypeEnum } from '@/Player/constant'
import { toPersistedDomainEventRows } from './domainEventPersistence'
import {
  validatePersistedDomainEventRows,
  summarizePersistedDomainEventRows
} from './domainEventTapeValidation'

describe('domainEventTapeValidation', () => {
  test('validatePersistedDomainEventRows accepts normal tape', () => {
    const rows = toPersistedDomainEventRows('t1', [
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
        payload: { handId: 'h1', seq: 1 }
      },
      {
        type: 'PlayerActed',
        payload: {
          handId: 'h1',
          seq: 2,
          userId: 1,
          street: StageEnum.PRE_FLOP,
          actionType: ActionTypeEnum.CHECK
        }
      }
    ])

    expect(validatePersistedDomainEventRows(rows)).toEqual([])
    expect(summarizePersistedDomainEventRows(rows)).toEqual({
      rowCount: 3,
      tableCount: 1,
      handCount: 1,
      sessionEventCount: 1
    })
  })

  test('reports meta/type mismatch and seq regression', () => {
    const rows = toPersistedDomainEventRows('t1', [
      {
        type: 'RolesAssigned',
        payload: {
          seq: 2,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      },
      {
        type: 'RolesAssigned',
        payload: {
          seq: 1,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      }
    ])
    rows[1] = {
      ...rows[1],
      eventType: 'HandStarted',
      payloadJson: JSON.stringify({
        type: 'RolesAssigned',
        payload: { seq: 99, players: [] }
      })
    }

    const issues = validatePersistedDomainEventRows(rows)
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'EVENT_TYPE_MISMATCH',
        'ROW_META_MISMATCH',
        'NON_MONOTONIC_HAND_SEQ'
      ])
    )
  })
})
