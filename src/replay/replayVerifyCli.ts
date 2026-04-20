import fs from 'node:fs'
import path from 'node:path'

import { parseCanonicalTableSessionFromJson } from '@/engine/canonicalTableSession'
import { readAllPersistedRowsFromNdjsonFileSync } from './node/jsonlAppendOnlyStore'
import {
  resolveReplayVerifyExitCode,
  toCompactVerifyCanonicalAgainstTapeResult,
  verifyCanonicalSessionAgainstPersistedRows
} from './verifyCanonicalAgainstTape'

const sessionArg = process.argv[2]
const tapeArg = process.argv[3]
const noValidate = process.argv.includes('--no-validate')
const compact = process.argv.includes('--compact')
const failOnTapeIssuesOnly = process.argv.includes('--fail-on-tape-issues-only')

if (!sessionArg || !tapeArg) {
  console.error(
    'Usage: pnpm run replay:verify <session.canonical.json> <events.ndjson> [--compact] [--no-validate] [--fail-on-tape-issues-only]'
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

if (!verify.matches) {
  if (verify.tapeIssues.length > 0) {
    console.error(`Tape validation issues: ${verify.tapeIssues.length}`)
  }
  if (verify.diffContext) {
    const d = verify.diffContext
    const toS = (x: typeof d.expected) =>
      x
        ? `${x.type}(handId=${x.handId ?? 'null'},seq=${x.seq ?? 'null'})`
        : 'null'
    console.error(
      `First diff@${d.index}: expected=${toS(d.expected)} actual=${toS(
        d.actual
      )}`
    )
  }
}
const payload = compact
  ? toCompactVerifyCanonicalAgainstTapeResult(verify)
  : verify
console.log(JSON.stringify(payload, null, 2))

const exitCode = resolveReplayVerifyExitCode(
  verify,
  failOnTapeIssuesOnly ? 'tape_issues_only' : 'strict'
)
if (exitCode !== 0) {
  process.exit(2)
}
