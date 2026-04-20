import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { RoleEnum } from '@/Player/constant'
import { toPersistedDomainEventRows } from './domainEventPersistence'
import { appendPersistedRowsToNdjsonFileSync } from './node/jsonlAppendOnlyStore'
import { projectCompositeReadModelFromNdjsonFileSync } from './node/compositeFromNdjson'

describe('projectCompositeReadModelFromNdjsonFileSync', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpc-composite-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('validates tape by default', () => {
    const file = path.join(dir, 'events.ndjson')
    const rows = toPersistedDomainEventRows('t1', [
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
    ])
    rows[0] = {
      ...rows[0],
      eventType: 'HandStarted'
    }
    appendPersistedRowsToNdjsonFileSync(file, rows)

    expect(() => projectCompositeReadModelFromNdjsonFileSync(file)).toThrow(
      /Invalid persisted domain event tape/
    )
  })

  test('can skip tape validation explicitly', () => {
    const file = path.join(dir, 'events.ndjson')
    const rows = toPersistedDomainEventRows('t1', [
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
    ])
    rows[0] = {
      ...rows[0],
      eventType: 'HandStarted'
    }
    appendPersistedRowsToNdjsonFileSync(file, rows)

    const composite = projectCompositeReadModelFromNdjsonFileSync(file, {
      validateTape: false
    })
    expect(composite.lastHandEnded).toBeNull()
  })
})
