import fs from 'node:fs'
import path from 'node:path'

import { readAllPersistedRowsFromNdjsonFileSync } from './jsonlAppendOnlyStore'
import {
  assertPersistedDomainEventRows,
  summarizePersistedDomainEventRows
} from './domainEventTapeValidation'

const fileArg = process.argv[2]
if (!fileArg) {
  console.error('Usage: pnpm run replay:validate <events.ndjson>')
  process.exit(1)
}

const abs = path.resolve(fileArg)
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs)
  process.exit(1)
}

const rows = readAllPersistedRowsFromNdjsonFileSync(abs)
assertPersistedDomainEventRows(rows)
const summary = summarizePersistedDomainEventRows(rows)
console.log(JSON.stringify(summary, null, 2))
