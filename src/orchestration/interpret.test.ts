import type { TexasDomainEvent } from '@/domain/handDomainEvents'

import { RoleEnum } from '@/Player/constant'
import { interpret, type DomainEventHandler } from './interpret'

describe('interpret', () => {
  test('invokes handlers in order for each event', async () => {
    const log: string[] = []
    const h1: DomainEventHandler = async () => {
      log.push('h1')
    }
    const h2: DomainEventHandler = async () => {
      log.push('h2')
    }
    const ev: TexasDomainEvent = {
      type: 'RolesAssigned',
      payload: {
        handId: 'h1',
        seq: 1,
        players: [{ userId: 1, name: 'a', role: RoleEnum.BTN, actionIndex: 0 }]
      }
    }
    await interpret([ev], {}, [h1, h2])
    expect(log).toEqual(['h1', 'h2'])
  })
})
