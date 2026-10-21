import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const frozen = JSON.parse(readFileSync(join(root, '01-freeze/freeze-manifest.json'), 'utf8')).sha256
const current = createHash('sha256').update(readFileSync(join(root, '01-freeze/scenario-matrix.json'))).digest('hex')
if (frozen !== current) throw new Error(`frozen matrix changed: ${frozen} != ${current}`)

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(root)
const entries = files
  .filter((file) => !file.endsWith('file-digests.json'))
  .map((file) => ({
    path: relative(root, file).split('\\').join('/'),
    bytes: statSync(file).size,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
  }))
  .sort((a, b) => a.path.localeCompare(b.path))
writeFileSync(join(root, 'file-digests.json'), `${JSON.stringify({
  schema: 'nestscout.evidence_digests.v1',
  generated_utc: new Date().toISOString(),
  frozen_matrix_unchanged: true,
  frozen_matrix_sha256: current,
  note: 'sha256 of the bytes on disk in this checkout',
  files: entries,
}, null, 2)}\n`)
console.log(`digested ${entries.length} files; frozen matrix unchanged: ${current}`)
