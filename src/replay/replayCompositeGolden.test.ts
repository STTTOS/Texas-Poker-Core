import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Texas from '@/Texas'
import { TexasEngineContext } from '@/TexasEngineContext'
import { flatConcatDomainEvents } from '@/engine/domainEventReadModel'
import { projectCompositeReadModel } from './projectCompositeReadModel'
import { projectCompositeReadModelFromNdjsonFileSync } from './compositeFromNdjson'
import { applyTableCommandThenFlushAllPendingFlowOps } from '@/engine/applyTableCommand'
import {
  toPersistedDomainEventRows,
  domainEventsFromPersistedRows
} from './domainEventPersistence'
import {
  appendPersistedRowsToNdjsonFileSync,
  readAllPersistedRowsFromNdjsonFileSync
} from './jsonlAppendOnlyStore'

describe('replay composite golden (NDJSON round-trip)', () => {
  let teardown: Texas | undefined
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpc-golden-'))
  })

  afterEach(() => {
    teardown?.room.checkIfCloseRoom()
    TexasEngineContext.reset()
    teardown = undefined
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('live events → NDJSON → composite matches direct projection', () => {
    const texas = new Texas({
      lowestBetAmount: 1000,
      maximumCountOfPlayers: 7,
      initialChips: 50_000,
      user: { id: 1, name: 'a' }
    })
    const p1 = texas.room.owner
    const p2 = texas.createPlayer({ id: 2, name: 'b' })
    texas.room.seat(p1)
    texas.room.join(p2)
    texas.room.seat(p2)
    texas.dealer.setButton(p1)
    texas.setPlayerRoles()
    teardown = texas
    texas.dealCards()
    void [...texas.start(), ...texas.flushAllPendingFlowOps()]

    const uid = texas.controller.activePlayer!.getUserInfo().id
    const step1 = applyTableCommandThenFlushAllPendingFlowOps(texas, {
      type: 'Call',
      playerId: uid
    })
    const step2 = applyTableCommandThenFlushAllPendingFlowOps(texas, {
      type: 'Check',
      playerId: texas.controller.activePlayer!.getUserInfo().id
    })
    const live = flatConcatDomainEvents([step1.events, step2.events])
    const direct = projectCompositeReadModel(live)

    const ndjsonPath = path.join(tmpDir, 'hand.ndjson')
    appendPersistedRowsToNdjsonFileSync(
      ndjsonPath,
      toPersistedDomainEventRows('golden-table', live)
    )
    const fromFile = projectCompositeReadModelFromNdjsonFileSync(ndjsonPath)
    expect(fromFile).toEqual(direct)

    const rows = readAllPersistedRowsFromNdjsonFileSync(ndjsonPath)
    expect(
      projectCompositeReadModel(domainEventsFromPersistedRows(rows))
    ).toEqual(direct)
  })
})
