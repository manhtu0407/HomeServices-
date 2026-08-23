import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveHostedMigrationState } from './migration-history.mjs'
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

export function materializeMigrationApplyWorkdir(input) {
  const root = resolve(input.root ?? ROOT)
  const output = resolveInsideRoot(root, input.output)
  if (existsSync(output)) throw new Error('migration apply workdir already exists')
  const plan = buildMigrationApplyPlan(input)
  const supabaseRoot = resolve(output, 'supabase')
  const migrationRoot = resolve(supabaseRoot, 'migrations')
  mkdirSync(migrationRoot, { recursive: true })
  copyFileSync(resolve(root, 'supabase/config.toml'), resolve(supabaseRoot, 'config.toml'))
  for (const entry of plan.files) {
    const source = resolveInsideRoot(root, entry.file)
    const bytes = readFileSync(source)
    if (createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/gu, '\n')).digest('hex') !== entry.sha256) {
      throw new Error(`migration apply source checksum mismatch: ${entry.version}`)
    }
    copyFileSync(source, resolve(migrationRoot, entry.file.split('/').at(-1)))
  }
  writeFileSync(resolve(output, 'apply-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
  return plan
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
    for (const required of ['inventory', 'hosted', 'output']) {
      if (!options[required]) throw new Error(`--${required} is required`)
    }
    if (!options.stagingCatchup && !options.receipt) throw new Error('--receipt is required')
    const plan = materializeMigrationApplyWorkdir({
      root: ROOT,
      inventory: JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.inventory), 'utf8')),
      hosted: JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.hosted), 'utf8')),
      receipt: options.receipt
        ? JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.receipt), 'utf8'))
        : null,
      mode: options.stagingCatchup ? 'staging-catchup' : 'expand-only-release',
      output: options.output,
    })
    console.log(`prepared isolated migration workdir: ${plan.pendingVersions.length} pending migration(s)`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
