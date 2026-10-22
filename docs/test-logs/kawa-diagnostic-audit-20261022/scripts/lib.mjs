import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
export const auditRoot = resolve(here, '..')
export const evidenceRoot = resolve(auditRoot, '..', 'kawa-diagnostic-baseline-20261021')
export const SNAPSHOT_DIRS = { before: 'C:/ns-diag/before', after: 'C:/ns-diag/after' }
export const SNAPSHOT_SHAS = {
  before: 'ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72',
  after: '42daced1a52ca5b8e5ee2e0b982c28e697f184c9',
}
const SHARED = 'supabase/functions/mobile-api/_shared/'

export async function load(snapshot, relativeToShared) {
  const url = pathToFileURL(join(SNAPSHOT_DIRS[snapshot], SHARED, relativeToShared)).href
  return import(url)
}

export function setEnv(values = {}) {
  globalThis.Deno = { env: { get: (key) => values[key] } }
}

export const ALL_PLAYBOOK_FLAGS = Object.fromEntries(
  ['ELECTRICAL', 'PLUMBING', 'CLEANING', 'HVAC', 'UPHOLSTERY', 'HANDYMAN'].map((name) => [`KAEL_PLAYBOOK_${name}_ENABLED`, 'true']),
)

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

export function writeJson(name, value) {
  const path = join(auditRoot, 'results', name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  return path
}

export const numbersIn = (text) => [...new Set([...String(text).matchAll(/(?<!\d)(112|113|114|115)(?!\d)/g)].map((m) => m[1]))].sort()

export const FIXTURE_DIR = 'C:/ns-diag/after/apps/api/src/__tests__/kael-edge-runtime/fixtures/emergency-phrases'
export const sealedH5Path = () => join(FIXTURE_DIR, 'sealed-h5.json')
export const lfSha256 = (path) => createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
