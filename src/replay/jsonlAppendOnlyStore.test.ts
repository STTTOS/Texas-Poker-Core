import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { RoleEnum } from '@/Player/constant'
import { toPersistedDomainEventRows } from './domainEventPersistence'
import {
  createNdjsonFileDomainEventStore,
  appendPersistedRowsToNdjsonFileSync,
  readAllPersistedRowsFromNdjsonFileSync
} from './node/jsonlAppendOnlyStore'

describe('jsonlAppendOnlyStore', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpc-replay-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('append then read round-trips rows in order', () => {
    const file = path.join(dir, 'events.ndjson')
    const r1 = toPersistedDomainEventRows('t1', [
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
    const r2 = toPersistedDomainEventRows('t1', [
      {
        type: 'HandStarted',
        payload: { handId: 'h1', seq: 2 }
      }
    ])
    appendPersistedRowsToNdjsonFileSync(file, r1)
    appendPersistedRowsToNdjsonFileSync(file, r2)
    const back = readAllPersistedRowsFromNdjsonFileSync(file)
    expect(back).toHaveLength(2)
    expect(back[0].handId).toBe('h1')
    expect(back[0].seq).toBe(1)
    expect(back[1].handId).toBe('h1')
    expect(back[1].seq).toBe(2)
  })

  test('createNdjsonFileDomainEventStore implements appendBatch', async () => {
    const file = path.join(dir, 'x.ndjson')
    const store = createNdjsonFileDomainEventStore(file)
    const row = toPersistedDomainEventRows('t1', [
      {
        type: 'RolesAssigned',
        payload: {
          handId: 'h1',
          seq: 1,
          players: [
            { userId: 2, name: 'b', role: RoleEnum.BTN, actionIndex: 0 }
          ]
        }
      }
    ])[0]
    await Promise.resolve(store.appendBatch([row]))
    expect(readAllPersistedRowsFromNdjsonFileSync(file)).toHaveLength(1)
  })

  test('read missing file returns empty array', () => {
    expect(
      readAllPersistedRowsFromNdjsonFileSync(path.join(dir, 'none.ndjson'))
    ).toEqual([])
  })
})
