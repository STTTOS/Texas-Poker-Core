import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { RoleEnum } from '@/Player/constant'
import {
  toPersistedDomainEventRows,
  domainEventsFromPersistedRows,
  createInMemoryDomainEventStore
} from './domainEventPersistence'

describe('domainEventPersistence', () => {
  test('toPersistedDomainEventRows maps hand meta on prelude and street', () => {
    const rolesEv: TexasDomainEvent = {
      type: 'RolesAssigned',
      payload: {
        handId: 'h1',
        seq: 1,
        players: [{ userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }]
      }
    }
    const handEv: TexasDomainEvent = {
      type: 'HandStarted',
      payload: { handId: 'h1', seq: 2 }
    }
    const rows = toPersistedDomainEventRows('table-1', [rolesEv, handEv], {
      recordedAtMs: 1_700_000_000_000
    })
    expect(rows[0].handId).toBe('h1')
    expect(rows[0].seq).toBe(1)
    expect(rows[1].handId).toBe('h1')
    expect(rows[1].seq).toBe(2)
    expect(JSON.parse(rows[1].payloadJson)).toEqual(handEv)
  })

  test('domainEventsFromPersistedRows restores events in row order', () => {
    const rolesEv: TexasDomainEvent = {
      type: 'RolesAssigned',
      payload: {
        handId: 'h1',
        seq: 1,
        players: [{ userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }]
      }
    }
    const handEv: TexasDomainEvent = {
      type: 'HandStarted',
      payload: { handId: 'h1', seq: 2 }
    }
    const rows = toPersistedDomainEventRows('t', [rolesEv, handEv])
    expect(domainEventsFromPersistedRows(rows)).toEqual([rolesEv, handEv])
  })

  test('createInMemoryDomainEventStore accumulates rows', async () => {
    const { store, getRows } = createInMemoryDomainEventStore()
    const row = toPersistedDomainEventRows('t1', [
      {
        type: 'RolesAssigned',
        payload: {
          handId: 'h1',
          seq: 1,
          players: [
            { userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      }
    ])[0]
    await Promise.resolve(store.appendBatch([row]))
    expect(getRows()).toHaveLength(1)
  })
})
