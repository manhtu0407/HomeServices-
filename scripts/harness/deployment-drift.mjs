import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function compareDeploymentState(input) {
  const problems = []
  const release = input.release
  const inventory = input.inventory
  const remote = input.remote
  if (!release || typeof release !== 'object') return { ok: false, problems: ['release artifact is missing'] }
  if (!inventory || !Array.isArray(inventory.entries)) return { ok: false, problems: ['migration inventory is missing'] }
  if (!remote || typeof remote !== 'object') return { ok: false, problems: ['remote deployment snapshot is missing'] }
  if (remote.environment !== release.environment) problems.push(`environment mismatch: release ${release.environment}, remote ${remote.environment}`)
  if (!remote.releaseId) problems.push('remote release ID is missing')
  else if (remote.releaseId !== release.releaseId) problems.push(`release ID mismatch: expected ${release.releaseId}, remote ${remote.releaseId}`)
  if (!remote.gitSha) problems.push('remote Git SHA is missing')
  else if (remote.gitSha !== release.gitSha) problems.push(`Git SHA mismatch: expected ${release.gitSha}, remote ${remote.gitSha}`)
  if (!remote.migrationInventorySha256) problems.push('remote migration inventory digest is missing')
  else if (remote.migrationInventorySha256 !== release.migrationInventorySha256) problems.push('migration inventory digest mismatch')
  const expectedVersions = inventory.entries.map((entry) => entry.version)
  const remoteMigrations = remote.migrations ?? []
  if (!Array.isArray(remoteMigrations)) problems.push('remote migrations snapshot is not an array')
  const suppliedVersions = (Array.isArray(remoteMigrations) ? remoteMigrations : [])
    .map((entry) => String(entry?.version ?? entry?.id ?? ''))
  if (suppliedVersions.some((version) => !version)) problems.push('remote migrations snapshot contains an entry without a version')
  const actualVersions = suppliedVersions.filter(Boolean)
  const expectedSet = new Set(expectedVersions)
  const actualSet = new Set(actualVersions)
  if (actualSet.size !== actualVersions.length) problems.push('remote migration history contains duplicate versions')
  const missing = expectedVersions.filter((version) => !actualSet.has(version))
  const unknown = actualVersions.filter((version) => !expectedSet.has(version))
  if (missing.length) problems.push(`remote is missing migrations: ${missing.join(', ')}`)
  if (unknown.length) problems.push(`remote has unknown migrations: ${unknown.join(', ')}`)
  if (actualVersions.join('\n') !== [...actualVersions].sort().join('\n')) problems.push('remote migration history is out of order')
  const expectedFunctions = release.edgeFunctions ?? {}
  const actualFunctions = remote.edgeFunctions ?? {}
  for (const [name, digest] of Object.entries(expectedFunctions)) {
    if (!actualFunctions[name]) problems.push(`remote Edge function is missing: ${name}`)
    else if (actualFunctions[name] !== digest) problems.push(`remote Edge function digest mismatch: ${name}`)
  }
  for (const name of Object.keys(actualFunctions)) {
    if (!(name in expectedFunctions)) problems.push(`remote has unknown Edge function: ${name}`)
  }
  return {
    ok: problems.length === 0,
    problems,
    expectedReleaseId: release.releaseId,
    remoteReleaseId: remote.releaseId ?? null,
  }
}

function parseArgs(values) {
  const options = {}
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--release') options.release = values[++index]
    else if (values[index] === '--inventory') options.inventory = values[++index]
    else if (values[index] === '--remote') options.remote = values[++index]
    else throw new Error(`unknown argument: ${values[index]}`)
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.release || !options.remote) throw new Error('--release and --remote are required')
    const report = compareDeploymentState({
      release: JSON.parse(readFileSync(resolve(ROOT, options.release), 'utf8')),
      inventory: JSON.parse(readFileSync(resolve(ROOT, options.inventory ?? 'config/harness/migration-inventory.json'), 'utf8')),
      remote: JSON.parse(readFileSync(resolve(ROOT, options.remote), 'utf8')),
    })
    if (!report.ok) {
      for (const problem of report.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`deployment state matches ${report.expectedReleaseId}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
