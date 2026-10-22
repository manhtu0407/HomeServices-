// sha256 of every file in the evidence folder except the digest file itself.
// usage: node make-digests.mjs
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidenceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const files = {}
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name !== 'file-digests.json') files[relative(evidenceRoot, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
walk(evidenceRoot)
writeFileSync(join(evidenceRoot, 'file-digests.json'), `${JSON.stringify({ schema: 'nestscout.r1.file_digests.v1', file_count: Object.keys(files).length, files }, null, 1)}\n`)
console.log(Object.keys(files).length)
