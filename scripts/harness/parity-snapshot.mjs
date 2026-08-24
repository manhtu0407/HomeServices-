// Builds the two artifacts deployment-drift.mjs has always expected but never had.
//
// compareDeploymentState() takes a `release` (what the repository expects) and a
// `remote` (what the target actually runs). Nothing produced the second one, so the
// comparison only ever ran against its own unit test while real deployments went
// unchecked. This closes that by reading the public harness health endpoint and a
// migration list the caller obtains from the target database.
//
// Two rules govern what gets written:
//   - `--environment` is stated by the caller, never copied from the health
//     response. Deriving both sides from one source makes the environment check
//     compare a value with itself and pass regardless of where it pointed.
//   - Unknown identity is written through as-is. A runtime reporting "unreleased"
//     must reach the report as "unreleased"; substituting a plausible value would
//     turn a real gap into a green tick (governance/RULES.md #8).

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const INVENTORY = 'config/harness/migration-inventory.json'
const HEALTH_TIMEOUT_MS = 15_000

export function buildRemote(health, migrationVersions, inventorySha256 = null) {
  const release = health?.release ?? {}
  return {
    environment: health?.environment?.name ?? null,
    projectRef: health?.environment?.project_ref ?? null,
    releaseId: release.release_id ?? null,
    gitSha: release.git_sha ?? null,
    // The health payload carries the harness manifest and bundle digests, and no
    // migration-inventory digest at all. Passing manifest_sha256 off as that field
    // would compare two unrelated hashes and manufacture a mismatch. It comes from
    // the target's registered release row instead, supplied by the caller; absent
    // that, it stays null and the drift gate reports it missing, which is the truth.
    migrationInventorySha256: inventorySha256,
    manifestSha256: release.manifest_sha256 ?? null,
    registered: release.registered === true,
    migrations: migrationVersions.map((version) => ({ version })),
  }
}

export function buildRelease(input) {
  return {
    environment: input.environment,
    releaseId: input.releaseId ?? null,
    gitSha: input.gitSha,
    migrationInventorySha256: input.migrationInventorySha256,
  }
}

// Accepts a bare array of versions, or the row shapes a SQL client returns.
export function readMigrationVersions(raw) {
  const rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.result ?? raw.migrations ?? [])
  return rows
    .map((row) => (typeof row === 'string' ? row : String(row?.version ?? row?.id ?? '')))
    .filter(Boolean)
}

async function fetchHealth(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`health endpoint returned ${response.status}`)
  return await response.json()
}

function parseArgs(values) {
  const options = {}
  const flags = {
    '--health-url': 'healthUrl',
    '--health-file': 'healthFile',
    '--migrations': 'migrations',
    '--environment': 'environment',
    '--release-id': 'releaseId',
    '--remote-inventory-sha': 'remoteInventorySha',
    '--out-remote': 'outRemote',
    '--out-release': 'outRelease',
  }
  for (let index = 0; index < values.length; index += 1) {
    const key = flags[values[index]]
    if (!key) throw new Error(`unknown argument: ${values[index]}`)
    options[key] = values[++index]
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.healthUrl && !options.healthFile) throw new Error('--health-url or --health-file is required')
    if (!options.migrations) throw new Error('--migrations is required')

    const health = options.healthFile
      ? JSON.parse(readFileSync(resolve(root, options.healthFile), 'utf-8'))
      : await fetchHealth(options.healthUrl)
    const versions = readMigrationVersions(JSON.parse(readFileSync(resolve(root, options.migrations), 'utf-8')))
    const inventory = JSON.parse(readFileSync(resolve(root, INVENTORY), 'utf-8'))

    const remote = buildRemote(health, versions, options.remoteInventorySha ?? null)
    const environment = options.environment ?? remote.environment
    if (!options.environment) {
      console.warn('no --environment given, so the environment check compares the health response with itself')
    }
    const release = buildRelease({
      environment,
      releaseId: options.releaseId,
      gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim(),
      migrationInventorySha256: inventory.migrationsSha256 ?? null,
    })

    if (options.outRemote) writeFileSync(resolve(root, options.outRemote), JSON.stringify(remote, null, 2) + '\n')
    if (options.outRelease) writeFileSync(resolve(root, options.outRelease), JSON.stringify(release, null, 2) + '\n')

    console.log(`environment: ${remote.environment} (${remote.projectRef})`)
    console.log(`remote identity: release ${remote.releaseId}, git ${remote.gitSha}, registered ${remote.registered}`)
    console.log(`remote migrations: ${remote.migrations.length}, repository inventory: ${inventory.entries?.length ?? 0}`)
    if (!remote.registered) {
      console.log('the runtime does not declare its release, so identity cannot be verified from it')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
