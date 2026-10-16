import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalMigrationEntries, resolveHostedMigrationState } from './migration-history.mjs'
import { pendingMigrationEntries } from './release-safety.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// The Edge worker contract imports this data outside the functions tree.
const LOCAL_FUNCTION_DEPENDENCY = 'packages/shared/src/worker-capability-data.ts'

export function buildMigrationApplyPlan(input) {
  if (input.localInstance) throw new Error('local instance selection requires an empty local migration plan')
  if (input.mode === 'staging-catchup') {
    throw new Error('Staging migration catch-up is locked; only the Production migration lane is available.')
  }
  const expectedPending = pendingMigrationEntries(input.inventory, input.hosted.migrations)
  const stagingCatchup = input.mode === 'staging-catchup'
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
  const localRuntime = validateLocalInstance(input.localInstance)
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
    projectRef: localRuntime ? `nestscout-qa-${localRuntime.name}` : 'nestscout',
    ...(localRuntime ? { localRuntime } : {}),
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
  const plan = buildEmptyMigrationApplyPlan(input)
  if (existsSync(resolve(root, 'supabase/functions'))) plan.functionFiles = localFunctionSources(root)
  if (plan.localRuntime && relative(root, output).replaceAll('\\', '/') !== `.scratch/local-migrations-qa-${plan.localRuntime.name}`) {
    throw new Error('local instance workdir must use its dedicated scratch path')
  }
  if (existsSync(output)) {
    if (!input.reuseExisting) throw new Error('empty reset migration workdir already exists')
    try {
      assertReusableEmptyMigrationWorkdir({ root, output, plan })
    } catch (error) {
      if (!input.refreshStaleExisting) throw error
      const archivedPath = refreshStaleEmptyMigrationWorkdir({ root, output, plan })
      input.onStaleSnapshotArchived?.(relative(root, archivedPath))
    }
    return plan
  }
  materializeMigrationWorkdir({ root, output, plan, includeSeed: true })
  return plan
}

function assertReusableEmptyMigrationWorkdir(input) {
  const applyPlanPath = resolve(input.output, 'apply-plan.json')
  if (!existsSync(applyPlanPath)) throw new Error('existing local migration workdir has no apply plan')
  const existingPlan = JSON.parse(readFileSync(applyPlanPath, 'utf8'))
  if (JSON.stringify(existingPlan) !== JSON.stringify(input.plan)) {
    throw new Error('existing local migration workdir is stale; remove .scratch/local-migrations and retry')
  }

  const copiedConfig = readFileSync(resolve(input.output, 'supabase/config.toml'))
  const sourceConfig = localMigrationConfig(input.root, input.plan)
  if (!copiedConfig.equals(sourceConfig)) throw new Error('existing local migration workdir config differs from source')

  const copiedSeed = readFileSync(resolve(input.output, 'supabase/seed.sql'))
  const sourceSeed = readFileSync(resolve(input.root, 'supabase/seed.sql'))
  if (!copiedSeed.equals(sourceSeed)) throw new Error('existing local migration workdir seed differs from source')
  if (readFileSync(resolve(input.output, 'supabase/.temp/postgres-version'), 'utf8') !== '17.6.1.121\n') {
    throw new Error('existing local migration workdir Postgres image pin differs from source')
  }

  const migrationRoot = resolve(input.output, 'supabase/migrations')
  const expectedFiles = input.plan.files.map((entry) => entry.file.split('/').at(-1)).sort()
  const actualFiles = readdirSync(migrationRoot).sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('existing local migration workdir does not contain the canonical migration file set')
  }
  for (const entry of input.plan.files) {
    const source = resolveInsideRoot(input.root, entry.file)
    const copied = resolve(migrationRoot, entry.file.split('/').at(-1))
    const sourceDigest = migrationDigest(readFileSync(source, 'utf8'))
    const copiedDigest = migrationDigest(readFileSync(copied, 'utf8'))
    if (sourceDigest !== entry.sha256 || copiedDigest !== entry.sha256) {
      throw new Error(`existing local migration workdir source checksum mismatch: ${entry.version}`)
    }
  }
  for (const entry of input.plan.functionFiles ?? []) {
    const copied = resolveInsideRoot(input.output, entry.file)
    if (!existsSync(copied) || createHash('sha256').update(readFileSync(copied)).digest('hex') !== entry.sha256) {
      throw new Error('existing local function source checksum mismatch')
    }
  }
}

function refreshStaleEmptyMigrationWorkdir(input) {
  const staged = uniqueSiblingPath(input.output, 'refresh')
  const archived = uniqueSiblingPath(input.output, 'stale')
  materializeMigrationWorkdir({ root: input.root, output: staged, plan: input.plan, includeSeed: true })
  assertReusableEmptyMigrationWorkdir({ ...input, output: staged })

  renameSync(input.output, archived)
  try {
    renameSync(staged, input.output)
  } catch (error) {
    if (!existsSync(input.output)) renameSync(archived, input.output)
    throw new Error(`could not install refreshed local migration workdir; prior snapshot remains at ${archived}`, {
      cause: error,
    })
  }
  return archived
}

function uniqueSiblingPath(path, label) {
  const parent = dirname(path)
  const name = basename(path)
  const prefix = `${name}-${label}-${Date.now()}-${process.pid}`
  let candidate = resolve(parent, prefix)
  let suffix = 0
  while (existsSync(candidate)) {
    suffix += 1
    candidate = resolve(parent, `${prefix}-${suffix}`)
  }
  return candidate
}

function materializeMigrationWorkdir(input) {
  const { root, output, plan } = input
  const config = localMigrationConfig(root, plan)
  const supabaseRoot = resolve(output, 'supabase')
  const migrationRoot = resolve(supabaseRoot, 'migrations')
  mkdirSync(migrationRoot, { recursive: true })
  writeFileSync(resolve(supabaseRoot, 'config.toml'), config)
  if (input.includeSeed) {
    copyFileSync(resolve(root, 'supabase/seed.sql'), resolve(supabaseRoot, 'seed.sql'))
    // supautils <3.2.2 can crash on EXECUTE denial; keep the actual negative SQL tests intact.
    mkdirSync(resolve(supabaseRoot, '.temp'), { recursive: true })
    writeFileSync(resolve(supabaseRoot, '.temp/postgres-version'), '17.6.1.121\n')
  }
  for (const entry of plan.files) {
    const source = resolveInsideRoot(root, entry.file)
    const bytes = readFileSync(source)
    if (migrationDigest(bytes.toString('utf8')) !== entry.sha256) {
      throw new Error(`migration apply source checksum mismatch: ${entry.version}`)
    }
    copyFileSync(source, resolve(migrationRoot, entry.file.split('/').at(-1)))
  }
  for (const entry of plan.functionFiles ?? []) {
    const source = resolveInsideRoot(root, entry.file)
    if (createHash('sha256').update(readFileSync(source)).digest('hex') !== entry.sha256) {
      throw new Error('local function source checksum changed during preparation')
    }
    const copied = resolveInsideRoot(output, entry.file)
    mkdirSync(dirname(copied), { recursive: true })
    copyFileSync(source, copied)
  }
  writeFileSync(resolve(output, 'apply-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
}

function localFunctionSources(root) {
  let tracked
  try {
    tracked = execFileSync('git', ['ls-files', '-z', '--', 'supabase/functions', LOCAL_FUNCTION_DEPENDENCY], {
      cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true, stdio: 'pipe',
    }).split('\0').filter(Boolean).sort()
  } catch {
    throw new Error('tracked local function source inventory unavailable')
  }
  return tracked.map((file) => {
    if ((!file.startsWith('supabase/functions/') && file !== LOCAL_FUNCTION_DEPENDENCY) || /(?:^|\/)\.env(?:\.|$)/u.test(file)) {
      throw new Error('local function source inventory contains an unsafe file')
    }
    const source = resolveInsideRoot(root, file)
    if (!lstatSync(source).isFile()) throw new Error('local function source must be a regular file')
    return { file, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') }
  })
}

function resolveInsideRoot(root, value) {
  const path = resolve(root, value)
  const local = relative(root, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${value}`)
  return path
}

function migrationDigest(source) {
  return createHash('sha256').update(source.replace(/\r\n/gu, '\n')).digest('hex')
}

function validateLocalInstance(value) {
  if (value == null) return null
  if (typeof value.name !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/u.test(value.name) ||
      ['production', 'staging', 'main', 'default', 'nestscout'].includes(value.name)) {
    throw new Error('invalid local instance name')
  }
  if (!Number.isInteger(value.portBase) || value.portBase < 1024 || value.portBase > 65520) {
    throw new Error('invalid local instance port base')
  }
  return { name: value.name, portBase: value.portBase }
}

function localMigrationConfig(root, plan) {
  const source = readFileSync(resolve(root, 'supabase/config.toml'))
  const target = validateLocalInstance(plan.localRuntime)
  if (!target) return source
  let projectCount = 0
  const config = source.toString('utf8').replace(/^project_id[ \t]*=[ \t]*"([^"]+)"[ \t]*\r?$/gmu, (_line, project) => {
    if (project !== 'nestscout') throw new Error('local instance source project differs from nestscout')
    projectCount += 1
    return `project_id = "nestscout-qa-${target.name}"`
  }).replace(/^((?:shadow_|inspector_)?port[ \t]*=[ \t]*)(\d+)(.*)$/gmu, (_line, prefix, digits, suffix) => {
    const port = Number(digits)
    const offset = port === 8083 ? 8 : port - 55320
    if (offset < 0 || offset > 9) throw new Error('local instance config contains an unrecognized port')
    return `${prefix}${target.portBase + offset}${suffix}`
  })
  if (projectCount !== 1) throw new Error('local instance source must contain exactly one project identity')
  return Buffer.from(config)
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
    if (key === '--reuse') {
      options.reuse = true
      continue
    }
    if (key === '--refresh-stale') {
      options.refreshStale = true
      continue
    }
    if (!['--inventory', '--hosted', '--receipt', '--output', '--instance', '--port-base'].includes(key)) {
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
    if (options.reuse && !options.emptyReset) throw new Error('--reuse requires --empty-reset')
    if (options.refreshStale && (!options.emptyReset || !options.reuse)) {
      throw new Error('--refresh-stale requires --empty-reset and --reuse')
    }
    if (options.emptyReset && (options.stagingCatchup || options.receipt || options.hosted)) {
      throw new Error('--empty-reset cannot be combined with hosted release options')
    }
    if ((options.instance || options['port-base']) && (!options.emptyReset || !options.instance || !options['port-base'])) {
      throw new Error('local instance requires --empty-reset, --instance and --port-base together')
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
      reuseExisting: options.reuse,
      refreshStaleExisting: options.refreshStale,
      localInstance: options.instance ? { name: options.instance, portBase: Number(options['port-base']) } : null,
      onStaleSnapshotArchived: (path) => console.log(`archived stale local migration workdir: ${path}`),
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
