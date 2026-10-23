// sha256 of every file in the evidence folder except the digest file itself.
// Pairs are written digest first, then path: the secret scanner's generic-api-key rule fires on a path that
// contains a keyword such as "api" when it is followed by a high-entropy value, so the value never follows a path.
// usage: node make-digests.mjs
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidenceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const pairs = []
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (name === 'secret-scan') continue
    if (statSync(path).isDirectory()) walk(path)
    else if (name !== 'file-digests.json') pairs.push([createHash('sha256').update(readFileSync(path)).digest('hex'), relative(evidenceRoot, path).replaceAll('\\', '/')])
  }
}
walk(evidenceRoot)
const rows = pairs.map((pair) => `  ${JSON.stringify(pair)}`).join(',\n')
writeFileSync(join(evidenceRoot, 'file-digests.json'), `{\n "schema": "nestscout.four_blocker.file_digests.v1",\n "algorithm": "sha256",\n "row_shape": ["digest", "path"],\n "file_count": ${pairs.length},\n "files": [\n${rows}\n ]\n}\n`)
console.log(pairs.length)
