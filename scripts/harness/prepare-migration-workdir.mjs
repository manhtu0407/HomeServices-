import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalMigrationEntries, resolveHostedMigrationState } from './migration-history.mjs'
import { pendingMigrationEntries } from './release-safety.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function buildMigrationApplyPlan(input) {
  const expectedPending = pendingMigrationEntries(input.inventory, input.hosted.migrations)
  const stagingCatchup = input.mode === 'staging-catchup'
  if (stagingCatchup && (input.hosted.environment !== 'staging' || input.hosted.projectRef !== 'xyylanuyflrjzbjzhqfl')) {
    throw new Error('migration catch-up mode is restricted to the registered Staging project')
  }
  const suppliedPending = stagingCatchup ? expectedPending : input.receipt?.pendingMigrations
  if (!Array.isArray(suppliedPending)) throw new Error('expand-only receipt has no pending migration inventory')
  const expectedIdentity = expectedPending.map((entry) => `${entry.version}:${entry.file}`)
  const suppliedIdentity = suppliedPending.map((entry) => `${entry.version}:${entry.file}`)
  if (JSON.stringify(suppliedIdentity) !== JSON.stringify(expectedIdentity)) {
    throw new Error('expand-only receipt pending inventory does not match hosted history')
  }
  if (!stagingCatchup && (input.receipt.environment !== input.hosted.environment ||
      input.receipt.projectRef !== input.hosted.projectRef)) {
    throw new Error('expand-only receipt target does not match hosted history')
  }
  const hostedState = resolveHostedMigrationState(input.inventory, input.hosted.migrations)
  const entriesByVersion = new Map(input.inventory.entries.map((entry) => [entry.version, entry]))
  const selected = [
    ...hostedState.rawVersions.map((version) => entriesByVersion.get(version)),
    ...expectedPending,
  ]
  if (selected.some((entry) => !entry)) throw new Error('migration apply plan references a missing local migration')
  const versions = selected.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length) throw new Error('migration apply plan contains a duplicate version')
  return {
    schemaVersion: '1.0.0',
    mode: stagingCatchup ? 'staging-catchup' : 'expand-only-release',
    environment: input.hosted.environment,
    projectRef: input.hosted.projectRef,
    hostedVersions: hostedState.rawVersions,
    pendingVersions: expectedPending.map((entry) => entry.version),
    files: selected.sort((left, right) => left.version.localeCompare(right.version)).map((entry) => ({
      version: entry.version,
      file: entry.file,
      sha256: entry.sha256,
    })),
  }
}

export function buildEmptyMigrationApplyPlan(input) {
  const selected = canonicalMigrationEntries(input.inventory)
  if (selected.length === 0) throw new Error('empty reset migration inventory is empty')
  const versions = selected.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length) {
    throw new Error('empty reset migration inventory contains a duplicate version')
  }
  return {
    schemaVersion: '1.0.0',
    mode: 'empty-reset',
    environment: 'local',
    projectRef: 'nestscout',
    hostedVersions: [],
    pendingVersions: versions,
    files: selected.map((entry) => ({
      version: entry.version,
      file: entry.file,
      sha256: entry.sha256,
    })),
  }
}

export function materializeMigrationApplyWorkdir(input) {
  const root = resolve(input.root ?? ROOT)
  const output = resolveInsideRoot(root, input.output)
  if (existsSync(output)) throw new Error('migration apply workdir already exists')
  const plan = buildMigrationApplyPlan(input)
  materializeMigrationWorkdir({ root, output, plan, includeSeed: false })
  return plan
}

export function materializeEmptyMigrationWorkdir(input) {
  const root = resolve(input.root ?? ROOT)
  const output = resolveInsideRoot(root, input.output)
  if (existsSync(output)) throw new Error('empty reset migration workdir already exists')
  const plan = buildEmptyMigrationApplyPlan(input)
  materializeMigrationWorkdir({ root, output, plan, includeSeed: true })
  return plan
}

function materializeMigrationWorkdir(input) {
  const { root, output, plan } = input
  const supabaseRoot = resolve(output, 'supabase')
  const migrationRoot = resolve(supabaseRoot, 'migrations')
  mkdirSync(migrationRoot, { recursive: true })
  copyFileSync(resolve(root, 'supabase/config.toml'), resolve(supabaseRoot, 'config.toml'))
  if (input.includeSeed) {
    copyFileSync(resolve(root, 'supabase/seed.sql'), resolve(supabaseRoot, 'seed.sql'))
    // supautils <3.2.2 can crash on EXECUTE denial; keep the actual negative SQL tests intact.
    mkdirSync(resolve(supabaseRoot, '.temp'), { recursive: true })
    writeFileSync(resolve(supabaseRoot, '.temp/postgres-version'), '17.6.1.121\n')
  }
  for (const entry of plan.files) {
    const source = resolveInsideRoot(root, entry.file)
    const bytes = readFileSync(source)
    if (createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/gu, '\n')).digest('hex') !== entry.sha256) {
      throw new Error(`migration apply source checksum mismatch: ${entry.version}`)
    }
    copyFileSync(source, resolve(migrationRoot, entry.file.split('/').at(-1)))
  }
  writeFileSync(resolve(output, 'apply-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
}

function resolveInsideRoot(root, value) {
  const path = resolve(root, value)
  const local = relative(root, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${value}`)
  return path
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--staging-catchup') {
      options.stagingCatchup = true
      continue
    }
    if (key === '--empty-reset') {
      options.emptyReset = true
      continue
    }
    if (!['--inventory', '--hosted', '--receipt', '--output'].includes(key)) {
      throw new Error(`unknown argument: ${key}`)
    }
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2)] = value
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const requiredOptions = options.emptyReset ? ['inventory', 'output'] : ['inventory', 'hosted', 'output']
    for (const required of requiredOptions) {
      if (!options[required]) throw new Error(`--${required} is required`)
    }
    if (options.emptyReset && (options.stagingCatchup || options.receipt || options.hosted)) {
      throw new Error('--empty-reset cannot be combined with hosted release options')
    }
    if (!options.emptyReset && !options.stagingCatchup && !options.receipt) {
      throw new Error('--receipt is required')
    }
    const input = {
      root: ROOT,
      inventory: JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.inventory), 'utf8')),
      hosted: options.hosted
        ? JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.hosted), 'utf8'))
        : null,
      receipt: options.receipt
        ? JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.receipt), 'utf8'))
        : null,
      mode: options.stagingCatchup ? 'staging-catchup' : 'expand-only-release',
      output: options.output,
    }
    const plan = options.emptyReset
      ? materializeEmptyMigrationWorkdir(input)
      : materializeMigrationApplyWorkdir(input)
    console.log(`prepared isolated migration workdir: ${plan.pendingVersions.length} pending migration(s)`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
