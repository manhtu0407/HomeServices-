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
