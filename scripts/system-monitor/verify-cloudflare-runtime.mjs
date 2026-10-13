import { basename } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MAX_EVIDENCE_AGE_MS = 180_000

export function verifyCloudflareRuntimeEvidence(input) {
  const release = input?.release
  const observer = release?.systemHealthObserver
  if (!observer || !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(release.gitSha ?? '')) throw new Error('CLOUDFLARE_RELEASE_IDENTITY_INVALID')

  const deployments = parseJson(input.deployments)
  const listed = Array.isArray(deployments) ? deployments : deployments?.deployments ?? deployments?.result
  const latest = Array.isArray(listed) ? listed[0] : null
  const tag = latest?.annotations?.['workers/tag']
  const versions = latest?.versions
  if (!latest || tag !== release.releaseId || !Array.isArray(versions) || versions.length === 0 ||
      versions.some((version) => typeof version.version_id !== 'string' || !Number.isFinite(version.percentage)) ||
      Math.abs(versions.reduce((sum, version) => sum + version.percentage, 0) - 100) > 0.01) {
    throw new Error('CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH')
  }

  const d1 = parseD1Evidence(input.d1Evidence)
  const expectedMigrations = observer.d1Migrations.map((migration) => basename(migration.path)).sort()
  const appliedMigrations = [...new Set(d1.migrations)].sort()
  if (expectedMigrations.length === 0 || expectedMigrations.some((migration) => !appliedMigrations.includes(migration))) {
    throw new Error('CLOUDFLARE_D1_MIGRATION_EVIDENCE_INCOMPLETE')
  }

  const nowMs = input.nowMs ?? Date.now()
  const scheduledAt = Date.parse(d1.latestTick?.scheduled_at ?? '')
  const completedAt = Date.parse(d1.latestTick?.completed_at ?? '')
  const snapshotAt = Date.parse(d1.state?.last_snapshot_at ?? '')
  if (d1.latestTick?.outcome !== 'completed' || !Number.isFinite(scheduledAt) || !Number.isFinite(completedAt) ||
      !Number.isFinite(snapshotAt) || scheduledAt > completedAt || completedAt > nowMs || snapshotAt > nowMs ||
      nowMs - completedAt > MAX_EVIDENCE_AGE_MS || nowMs - snapshotAt > MAX_EVIDENCE_AGE_MS || d1.state.last_error_code !== null) {
    throw new Error('CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY')
  }

  return Object.freeze({
    status: 'verified',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    profileId: observer.profileId,
    workerName: observer.workerName,
    workerBundleSha256: observer.workerBundleSha256,
    deploymentId: latest.id ?? null,
    workerVersions: versions.map((version) => ({ versionId: version.version_id, percentage: version.percentage })),
    d1Database: observer.d1Database,
    d1MigrationsSha256: observer.d1MigrationsSha256,
    appliedMigrations,
    latestTick: {
      scheduledAt: new Date(scheduledAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      snapshotAt: new Date(snapshotAt).toISOString(),
    },
  })
}

function parseD1Evidence(value) {
  const parsed = parseJson(value)
  const evidenceRows = []
  collectEvidenceStrings(parsed, evidenceRows)
  for (const item of evidenceRows) {
    try {
      const evidence = JSON.parse(item)
      if (evidence && Array.isArray(evidence.migrations)) return evidence
    } catch {
      continue
    }
  }
  if (parsed && Array.isArray(parsed.migrations)) return parsed
  throw new Error('CLOUDFLARE_D1_RUNTIME_EVIDENCE_INVALID')
}

function collectEvidenceStrings(value, result) {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceStrings(item, result)
  } else if (value && typeof value === 'object') {
    if (typeof value.evidence === 'string') result.push(value.evidence)
    for (const item of Object.values(value)) collectEvidenceStrings(item, result)
  }
}

function parseJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('CLOUDFLARE_RUNTIME_OUTPUT_INVALID')
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main(args) {
  const deploymentPath = args[args.indexOf('--deployments') + 1]
  const d1Path = args[args.indexOf('--d1-evidence') + 1]
  const releasePath = args[args.indexOf('--release') + 1]
  const outputPath = args[args.indexOf('--output') + 1]
  if ([deploymentPath, d1Path, releasePath, outputPath].some((value) => !value || value.startsWith('--'))) {
    throw new Error('CLOUDFLARE_RUNTIME_ARGUMENTS_INVALID')
  }
  const evidence = verifyCloudflareRuntimeEvidence({
    deployments: readJson(deploymentPath),
    d1Evidence: readJson(d1Path),
    release: readJson(releasePath),
  })
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write('Cloudflare deployment, D1 migrations, and live observer tick verified\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'CLOUDFLARE_RUNTIME_VERIFICATION_FAILED'}\n`)
    process.exitCode = 1
  }
}
