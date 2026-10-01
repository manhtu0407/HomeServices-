import {
  PLAN55_PRODUCTION_SOURCE_BASE,
  createPlan55GithubIndependentHoldoutPreflightProvider,
} from './lib/plan55-independent-holdout-review.mjs'
import { readPlan55HoldoutAssets } from './lib/plan55-production-canary-operations.mjs'

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/iu

try {
  const sourceSha = String(process.env.PLAN55_SOURCE_SHA ?? '').toLowerCase()
  const expectedRef = `refs/heads/${PLAN55_PRODUCTION_SOURCE_BASE.branch}`
  if (!GIT_SHA_PATTERN.test(sourceSha) || sourceSha !== String(process.env.GITHUB_SHA ?? '').toLowerCase() ||
      process.env.GITHUB_REF !== expectedRef || !process.env.GH_TOKEN) {
    throw new Error('plan55_predeployment_holdout_context_invalid')
  }

  const assets = await readPlan55HoldoutAssets()
  const evidence = await createPlan55GithubIndependentHoldoutPreflightProvider()({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: assets.hashes,
    expectedHoldoutCaseCounts: assets.caseCounts,
    expectedHoldoutLabelsSha256: assets.labelsSha256,
  })
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
} catch (error) {
  const code = error instanceof Error ? error.message : 'plan55_predeployment_holdout_preflight_failed'
  process.stderr.write(`${/^[a-z0-9_:-]{1,180}$/i.test(code)
    ? code
    : 'plan55_predeployment_holdout_preflight_failed'}\n`)
  process.exitCode = 1
}
