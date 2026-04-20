import fs from 'node:fs'
import path from 'node:path'

import { readAllPersistedRowsFromNdjsonFileSync } from './jsonlAppendOnlyStore'
import { parseCanonicalTableSessionFromJson } from '@/engine/canonicalTableSession'
import { verifyCanonicalSessionAgainstPersistedRows } from './verifyCanonicalAgainstTape'

const sessionArg = process.argv[2]
const tapeArg = process.argv[3]
const noValidate = process.argv.includes('--no-validate')

if (!sessionArg || !tapeArg) {
  console.error(
    'Usage: pnpm run replay:verify <session.canonical.json> <events.ndjson> [--no-validate]'
  )
  process.exit(1)
}

const sessionFile = path.resolve(sessionArg)
const tapeFile = path.resolve(tapeArg)

if (!fs.existsSync(sessionFile)) {
  console.error('Session file not found:', sessionFile)
  process.exit(1)
}
if (!fs.existsSync(tapeFile)) {
  console.error('Tape file not found:', tapeFile)
  process.exit(1)
}

const sessionJson = fs.readFileSync(sessionFile, 'utf8')
const session = parseCanonicalTableSessionFromJson(sessionJson)
const rows = readAllPersistedRowsFromNdjsonFileSync(tapeFile)
const verify = verifyCanonicalSessionAgainstPersistedRows(session, rows, {
  validateTape: !noValidate
})

console.log(JSON.stringify(verify, null, 2))
if (!verify.matches) {
  process.exit(2)
}
