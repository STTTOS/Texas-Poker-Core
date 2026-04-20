import fs from 'node:fs'
import path from 'node:path'

import { projectCompositeReadModelFromNdjsonFileSync } from './compositeFromNdjson'

const fileArg = process.argv[2]
const noValidate = process.argv.includes('--no-validate')
if (!fileArg) {
  console.error(
    'Usage: pnpm run replay:composite <events.ndjson> [--no-validate]'
  )
  process.exit(1)
}
const abs = path.resolve(fileArg)
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs)
  process.exit(1)
}
const composite = projectCompositeReadModelFromNdjsonFileSync(abs, {
  validateTape: !noValidate
})
console.log(JSON.stringify(composite, null, 2))
