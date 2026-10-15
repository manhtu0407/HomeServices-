import { basename } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MAX_EVIDENCE_AGE_MS = 180_000

export function verifyCloudflareWorkerDeploymentIdentity(input) {
  const release = input?.release
  const observer = release?.systemHealthObserver
  if (!observer || !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(release.gitSha ?? '')) throw new Error('CLOUDFLARE_RELEASE_IDENTITY_INVALID')

  const deployments = parseJson(input.deployments)
  const listed = Array.isArray(deployments) ? deployments : deployments?.deployments ?? deployments?.result
  const latest = latestWorkerDeployment(listed)
  const deployedVersions = latest?.versions
  const versionsDocument = parseJson(input.versions)
  const versionEntries = Array.isArray(versionsDocument)
    ? versionsDocument
    : Array.isArray(versionsDocument?.result)
      ? versionsDocument.result
      : Array.isArray(versionsDocument?.result?.items)
        ? versionsDocument.result.items
        : versionsDocument?.versions ?? versionsDocument?.items ?? versionsDocument?.data
  const version = Array.isArray(versionEntries)
    ? versionEntries.find((entry) => (entry?.id ?? entry?.version_id) === deployedVersions?.[0]?.version_id)
    : null
  const deploymentVersion = deployedVersions?.[0]
  if (!latest || !Array.isArray(deployedVersions) || deployedVersions.length !== 1 ||
      deploymentVersion?.version_id !== version?.id && deploymentVersion?.version_id !== version?.version_id ||
      !Number.isFinite(deploymentVersion?.percentage) || Math.abs(deploymentVersion.percentage - 100) > 0.01 ||
      version?.annotations?.['workers/tag'] !== release.releaseId ||
      version?.annotations?.['workers/message'] !== release.gitSha) {
    throw new Error('CLOUDFLARE_WORKER_DEPLOYMENT_IDENTITY_MISMATCH')
  }

  return Object.freeze({
    status: 'verified',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    profileId: observer.profileId,
    workerName: observer.workerName,
    workerBundleSha256: observer.workerBundleSha256,
    deploymentId: latest.id ?? null,
    workerVersions: deployedVersions.map((deployedVersion) => ({
      versionId: deployedVersion.version_id,
      percentage: deployedVersion.percentage,
    })),
  })
}

export function verifyCloudflareRuntimeEvidence(input) {
  const release = input?.release
  const observer = release?.systemHealthObserver
  const workerIdentity = verifyCloudflareWorkerDeploymentIdentity(input)
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
  if (d1.state?.last_error_code !== null && d1.state?.last_error_code !== undefined) {
    throw new Error('CLOUDFLARE_OBSERVER_REPORTED_ERROR')
  }
  if (d1.latestTick?.outcome !== 'completed' || !Number.isFinite(scheduledAt) || !Number.isFinite(completedAt) ||
      !Number.isFinite(snapshotAt) || scheduledAt > completedAt || completedAt > nowMs || snapshotAt > nowMs ||
      nowMs - completedAt > MAX_EVIDENCE_AGE_MS || nowMs - snapshotAt > MAX_EVIDENCE_AGE_MS) {
    throw new Error('CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY')
  }

  return Object.freeze({
    ...workerIdentity,
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

function latestWorkerDeployment(deployments) {
  if (!Array.isArray(deployments) || deployments.length === 0) return null

  let latest = null
  let latestCreatedAt = Number.NEGATIVE_INFINITY
  let newestCount = 0
  for (const deployment of deployments) {
    const createdAt = Date.parse(deployment?.created_on ?? '')
    if (!Number.isFinite(createdAt)) return null
    if (createdAt > latestCreatedAt) {
      latest = deployment
      latestCreatedAt = createdAt
      newestCount = 1
    } else if (createdAt === latestCreatedAt) {
      newestCount += 1
    }
  }
  return newestCount === 1 ? latest : null
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
  const argument = (name) => args[args.indexOf(name) + 1]
  const deploymentPath = argument('--deployments')
  const versionsPath = argument('--versions')
  const releasePath = argument('--release')
  const d1Path = argument('--d1-evidence')
  const outputPath = argument('--output')
  const identityOnly = args.includes('--identity-only')
  if ([deploymentPath, versionsPath, releasePath].some((value) => !value || value.startsWith('--')) ||
      (!identityOnly && [d1Path, outputPath].some((value) => !value || value.startsWith('--')))) {
    throw new Error('CLOUDFLARE_RUNTIME_ARGUMENTS_INVALID')
  }
  const identityInput = {
    deployments: readJson(deploymentPath),
    versions: readJson(versionsPath),
    release: readJson(releasePath),
  }
  if (identityOnly) {
    verifyCloudflareWorkerDeploymentIdentity(identityInput)
    process.stdout.write('Cloudflare Worker version and deployment identity verified\n')
    return
  }
  const evidence = verifyCloudflareRuntimeEvidence({ ...identityInput, d1Evidence: readJson(d1Path) })
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
