import fs from 'node:fs'
import path from 'node:path'

import {
  reduceCanonicalTableSession,
  parseCanonicalTableSessionFromJson
} from '@/engine/canonicalTableSession'

const fileArg = process.argv[2]
const compact = process.argv.includes('--compact')

if (!fileArg) {
  console.error('Usage: pnpm run replay:canonical <session.json> [--compact]')
  process.exit(1)
}
const abs = path.resolve(fileArg)
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs)
  process.exit(1)
}
const json = fs.readFileSync(abs, 'utf8')
const session = parseCanonicalTableSessionFromJson(json)
const out = reduceCanonicalTableSession(session)
const payload = compact
  ? {
      eventCount: out.events.length,
      snapshotAfterBootstrap: out.snapshotAfterBootstrap,
      snapshotsAfterCommands: out.snapshotsAfterCommands,
      finalSnapshot: out.finalSnapshot
    }
  : out
console.log(JSON.stringify(payload, null, 2))
