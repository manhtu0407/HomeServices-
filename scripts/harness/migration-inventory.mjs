import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATION_ROOT = 'supabase/migrations'
const INVENTORY_PATH = 'config/harness/migration-inventory.json'
const TYPES_PATH = 'packages/shared/src/types/database.types.ts'
const BASELINE_PATH = 'config/harness/migration-baseline.json'

export function buildMigrationInventory(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const migrationRoot = resolve(root, options.migrationRoot ?? MIGRATION_ROOT)
  const files = readdirSync(migrationRoot)
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
  const entries = files.map((name) => {
    const bytes = readFileSync(resolve(migrationRoot, name))
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
  return {
    version: '1.0.0',
    historicalBaseline: {
      file: BASELINE_PATH,
      immutableThroughVersion: baseline.immutableThroughVersion,
      sha256: baseline.migrationsSha256,
    },
    migrationCount: entries.length,
    migrationsSha256: digest(entries.map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join('')),
    databaseTypes: {
      file: TYPES_PATH,
      sha256: digest(readFileSync(resolve(root, TYPES_PATH))),
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
    const bytes = readFileSync(path)
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
  const expectedVersions = inventory.entries.map((entry) => entry.version)
  const actualVersions = remoteEntries.map((entry) => String(entry.version ?? entry.id ?? ''))
    .filter(Boolean)
  const expectedSet = new Set(expectedVersions)
  const actualSet = new Set(actualVersions)
  const missing = expectedVersions.filter((version) => !actualSet.has(version))
  const unknown = actualVersions.filter((version) => !expectedSet.has(version))
  if (missing.length) problems.push(`remote is missing migrations: ${missing.join(', ')}`)
  if (unknown.length) problems.push(`remote has unknown migrations: ${unknown.join(', ')}`)
  if (actualVersions.join('\n') !== [...actualVersions].sort().join('\n')) {
    problems.push('remote migration history is out of order')
  }
  return problems
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
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
