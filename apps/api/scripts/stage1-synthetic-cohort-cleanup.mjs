#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

import { checkHarnessRelease, resolveReleaseArtifactPath } from '../../../scripts/harness/release-bundle.mjs'
import { assertReleaseTarget } from '../../../scripts/harness/release-safety.mjs'
import { buildSyntheticCleanupReceipt } from './lib/stage1-synthetic-cleanup-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8'))
  const problems = checkHarnessRelease(release)
  if (problems.length > 0) throw new Error(`release artifact is invalid: ${problems.join('; ')}`)
  const target = assertReleaseTarget({
    environment: options.environment,
    projectRef: options.projectRef,
    projectUrl: options.projectUrl,
  })
  if (release.environment !== target.environment ||
      !options.cohort.startsWith(`synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-`)) {
    throw new Error('cleanup target is not bound to the immutable release')
  }
  const approval = `stage1-cleanup:${options.runId}:${options.cohort}`
  if (process.env.STAGE1_CLEANUP_MUTATION_APPROVAL?.trim() !== approval) {
    throw new Error('explicit exact-cohort cleanup approval is missing')
  }
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(target.projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await removeExactCohortMedia(admin, options.cohort)
  const cleanup = await admin.rpc('cleanup_synthetic_matching_cohort', {
    p_cohort_id: options.cohort,
  })
  if (cleanup.error) throw new Error('exact synthetic cohort cleanup failed')
  const verification = await admin.rpc('verify_synthetic_matching_cohort_cleanup', {
    p_cohort_id: options.cohort,
  })
  const proof = verification.data?.[0]
  if (verification.error || !proof) throw new Error('exact synthetic cohort cleanup proof is unavailable')
  const receipt = buildSyntheticCleanupReceipt({
    releaseId: release.releaseId,
    cohortId: options.cohort,
    runId: options.runId,
    proof,
  })
  const output = resolveReleaseArtifactPath(ROOT, options.output)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`Stage 1 cleanup proven: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
}

async function removeExactCohortMedia(admin, cohortId) {
  const jobs = await admin.from('jobs').select('id').eq('synthetic_cohort_id', cohortId)
  if (jobs.error) throw new Error('exact cohort media cleanup could not resolve jobs')
  const jobIds = (jobs.data ?? []).map((job) => job.id).filter(Boolean)
  if (jobIds.length === 0) return
  const [assets, intents] = await Promise.all([
    admin.from('job_media_assets').select('job_id,object_path').in('job_id', jobIds),
    admin.from('job_media_upload_intents').select('job_id,object_path').in('job_id', jobIds),
  ])
  if (assets.error || intents.error) throw new Error('exact cohort media cleanup could not enumerate objects')
  const jobIdSet = new Set(jobIds)
  const objectPaths = [...new Set([...(assets.data ?? []), ...(intents.data ?? [])]
    .filter((row) => jobIdSet.has(row.job_id) && isExactJobMediaPath(row.job_id, row.object_path))
    .map((row) => row.object_path))]
  if (objectPaths.length === 0) return
  const removed = await admin.storage.from('job-media').remove(objectPaths)
  if (removed.error) throw new Error('exact cohort media cleanup could not remove objects')
}

function isExactJobMediaPath(jobId, objectPath) {
  return typeof jobId === 'string' && typeof objectPath === 'string' &&
    objectPath.startsWith(`${jobId}/`) &&
    /^[0-9a-f-]{36}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence|access_check_in)\/[A-Za-z0-9._-]+$/iu.test(objectPath)
}

function parseArgs(args) {
  const values = {}
  const allowed = new Set([
    '--release', '--cohort', '--run-id', '--environment', '--project-ref',
    '--project-url', '--output',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!allowed.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  for (const key of ['release', 'cohort', 'runId', 'environment', 'projectRef', 'projectUrl', 'output']) {
    if (!values[key]) throw new Error(`cleanup option is missing: ${key}`)
  }
  return values
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
