import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { join as joinDatabaseTypes } from '../split-database-types.mjs'
import {
  canonicalMigrationEntries,
  resolveHostedMigrationState,
  semanticMigrationSource,
  validateMigrationEquivalences,
} from './migration-history.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATION_ROOT = 'supabase/migrations'
const INVENTORY_PATH = 'config/harness/migration-inventory.json'
// The generated Supabase artifact is stored split across this directory. The hash below is
// taken over the rejoined bytes, not over any one file, so it stays identical to the hash
// recorded before the split — scripts/harness/promotion.mjs compares that value across
// releases, and a change would invalidate every release already recorded.
const TYPES_PATH = 'packages/shared/src/types/database'
const BASELINE_PATH = 'config/harness/migration-baseline.json'
const EQUIVALENCES_PATH = 'config/harness/migration-equivalences.json'
const normalizeSource = (value) => value.replace(/\r\n/gu, '\n')

export function buildMigrationInventory(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const migrationRoot = resolve(root, options.migrationRoot ?? MIGRATION_ROOT)
  const files = readdirSync(migrationRoot)
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
  const entries = files.map((name) => {
    const bytes = canonicalSourceBytes(resolve(migrationRoot, name))
    const separator = name.indexOf('_')
    return {
      version: name.slice(0, separator),
      name: name.slice(separator + 1, -4),
      file: `${MIGRATION_ROOT}/${name}`,
      sha256: digest(bytes),
      bytes: bytes.length,
    }
  })
  const baseline = readHistoricalBaseline(root)
  const migrationEquivalences = JSON.parse(readFileSync(resolve(root, EQUIVALENCES_PATH), 'utf8'))
  const equivalenceProblems = validateMigrationEquivalences(migrationEquivalences, entries)
  for (const group of migrationEquivalences.groups ?? []) {
    for (const version of group.versions ?? []) {
      const entry = entries.find((candidate) => candidate.version === version)
      if (!entry) continue
      const source = readFileSync(resolve(root, entry.file), 'utf8')
      if (digest(semanticMigrationSource(source)) !== group.semanticSha256) {
        equivalenceProblems.push(`migration equivalence semantic digest mismatch: ${version}`)
      }
    }
  }
  if (equivalenceProblems.length) throw new Error(equivalenceProblems.join('; '))
  return {
    version: '1.1.0',
    historicalBaseline: {
      file: BASELINE_PATH,
      immutableThroughVersion: baseline.immutableThroughVersion,
      sha256: baseline.migrationsSha256,
    },
    migrationCount: entries.length,
    migrationEquivalences,
    migrationsSha256: digest(entries.map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join('')),
    databaseTypes: {
      file: TYPES_PATH,
      sha256: digest(Buffer.from(normalizeSource(joinDatabaseTypes(root)), 'utf8')),
    },
    entries,
  }
}

export function checkMigrationInventory(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const path = resolve(root, options.inventoryPath ?? INVENTORY_PATH)
  const expected = buildMigrationInventory({ root })
  const problems = []
  if (!existsSync(path)) return { ok: false, problems: ['missing migration inventory'], expected }
  const actual = JSON.parse(readFileSync(path, 'utf8'))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push('migration inventory drift: run node scripts/harness/migration-inventory.mjs --write')
  }
  const versions = expected.entries.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length) problems.push('duplicate migration version detected')
  if (versions.join('\n') !== [...versions].sort().join('\n')) problems.push('migration versions are out of order')
  problems.push(...checkHistoricalMigrationBaseline({ root }))
  if (options.remotePath) {
    const remote = JSON.parse(readFileSync(resolve(root, options.remotePath), 'utf8'))
    problems.push(...compareRemoteMigrations(expected, remote))
  }
  return { ok: problems.length === 0, problems, expected }
}


export function checkHistoricalMigrationBaseline(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const baseline = readHistoricalBaseline(root, options.baselinePath)
  const problems = []
  if (!/^\d{14}$/u.test(baseline.immutableThroughVersion ?? '')) {
    return ['historical migration baseline has an invalid immutableThroughVersion']
  }
  if (!Array.isArray(baseline.entries) || baseline.entries.length !== baseline.migrationCount) {
    return ['historical migration baseline count is invalid']
  }
  const versions = baseline.entries.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length) problems.push('historical migration baseline contains duplicate versions')
  const expectedDigest = digest(baseline.entries.map((entry) => `${entry.version}:${entry.file}:${entry.sha256}\n`).join(''))
  if (expectedDigest !== baseline.migrationsSha256) problems.push('historical migration baseline aggregate checksum is invalid')
  const baselineByVersion = new Map(baseline.entries.map((entry) => [entry.version, entry]))
  for (const entry of baseline.entries) {
    const path = resolve(root, entry.file)
    if (!existsSync(path)) {
      problems.push(`historical migration was deleted: ${entry.file}`)
      continue
    }
    const bytes = canonicalSourceBytes(path)
    if (digest(bytes) !== entry.sha256 || bytes.length !== entry.bytes) {
      problems.push(`historical migration was modified: ${entry.file}`)
    }
  }
  const migrationRoot = resolve(root, MIGRATION_ROOT)
  for (const name of readdirSync(migrationRoot).filter((value) => /^\d{14}_[a-z0-9_]+\.sql$/u.test(value))) {
    const version = name.slice(0, 14)
    if (version <= baseline.immutableThroughVersion && !baselineByVersion.has(version)) {
      problems.push(`backdated migration is not in the immutable baseline: ${MIGRATION_ROOT}/${name}`)
    }
  }
  return problems
}

function readHistoricalBaseline(root, overridePath) {
  const path = resolve(root, overridePath ?? BASELINE_PATH)
  if (!existsSync(path)) throw new Error(`missing historical migration baseline: ${overridePath ?? BASELINE_PATH}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function compareRemoteMigrations(inventory, remote) {
  const problems = []
  const remoteEntries = Array.isArray(remote) ? remote : remote.migrations
  if (!Array.isArray(remoteEntries)) return ['remote migration snapshot is not an array']
  let state
  try {
    state = resolveHostedMigrationState(inventory, remoteEntries)
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }
  const missing = canonicalMigrationEntries(inventory)
    .map((entry) => entry.version)
    .filter((version) => !state.appliedCanonicalVersions.has(version))
  if (missing.length) problems.push(`remote is missing migrations: ${missing.join(', ')}`)
  return problems
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalSourceBytes(path) {
  return Buffer.from(normalizeSource(readFileSync(path, 'utf8')), 'utf8')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write')
  const remoteIndex = process.argv.indexOf('--remote')
  if (write) {
    const inventory = buildMigrationInventory()
    writeFileSync(resolve(ROOT, INVENTORY_PATH), `${JSON.stringify(inventory, null, 2)}\n`)
    console.log(`wrote ${INVENTORY_PATH}`)
  } else {
    const report = checkMigrationInventory({
      remotePath: remoteIndex >= 0 ? process.argv[remoteIndex + 1] : undefined,
    })
    if (report.ok) console.log(`migration inventory ok: ${report.expected.migrationCount} migrations`)
    else {
      console.error('migration inventory verification failed:')
      for (const problem of report.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    }
  }
}
