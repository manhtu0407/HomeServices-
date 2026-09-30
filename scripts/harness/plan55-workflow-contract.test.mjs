import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const releasePath = '.github/workflows/plan55-production-only.yml'
const servicePath = '.github/workflows/plan55-production-canary-service.yml'
const release = readFileSync(releasePath, 'utf8')
const service = readFileSync(servicePath, 'utf8')
const sourceAttestation = readFileSync('apps/api/scripts/lib/kael-playbook-production-attestation.mjs', 'utf8')

function needsFor(job) {
  const match = new RegExp(`^  ${job}:\\r?\\n    needs: (.+)$`, 'mu').exec(release)
  assert.ok(match, `workflow must declare needs for ${job}`)
  const value = match[1].trim()
  return value.startsWith('[')
    ? value.slice(1, -1).split(',').map((item) => item.trim())
    : [value]
}

test('Plan 55 release is dispatch-only, pinned to the exact Production-base merge, and never targets Staging', () => {
  assert.match(release, /^on:\r?\n  workflow_dispatch:/mu)
  assert.doesNotMatch(release, /^  (?:push|pull_request|schedule):/mu)
  assert.match(release, /refs\/heads\/codex\/plan55-production-base-645c907e/u)
  assert.match(release, /inputs\.source_sha == github\.sha/u)
  assert.match(release, /test "\$\(git show -s --format=%P/u)
  assert.doesNotMatch(`${release}\n${service}`, /staging/iu)
})

test('guard deploy is rollback-protected, deploys only mobile-api, and applies no migration or global service flag', () => {
  assert.match(release, /plan55-production-release-preflight\.mjs/u)
  assert.match(release, /runtime-release-bindings\.mjs/u)
  assert.match(release, /functions deploy mobile-api/u)
  assert.match(release, /rollback\(\)/u)
  assert.match(release, /hosted-after-rollback\.json/u)
  assert.doesNotMatch(release, /functions deploy kael-matching-maintainer/u)
  assert.doesNotMatch(release, /\bdb push\b/u)
  assert.doesNotMatch(release, /KAEL_PLAYBOOK_(?:HVAC|HANDYMAN|CLEANING|UPHOLSTERY|PLUMBING|ELECTRICAL)_ENABLED/u)
})

test('service workflow preserves the fixed serialized order and one complete, cleaned receipt per job', () => {
  const ordered = ['hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical']
  for (const [index, serviceName] of ordered.entries()) {
    const expectedNeeds = ['deploy_guard_off', ...ordered.slice(0, index)]
    assert.deepEqual(needsFor(serviceName), expectedNeeds, `${serviceName} must wait for the release and all prior services`)
    assert.match(release, new RegExp(`service: ${serviceName}\\r?\\n`, 'u'))
  }
  assert.deepEqual(needsFor('validate-six-receipts'), ['deploy_guard_off', ...ordered])
  assert.match(service, /timeout-minutes: 360/u)
  assert.match(service, /--run --service "\$PLAN55_SERVICE"/u)
  assert.match(service, /BLOCKED_UNVERIFIED/u)
  assert.match(service, /records\/\*\*/u)
  assert.match(service, /actions\/runs\/\$\{runId\}\/artifacts/u)
  assert.match(service, /steps\.resume\.outputs\.artifact_id/u)
  assert.match(service, /plan55-start-\$\{runId\}-/u)
  assert.match(service, /plan55_resume_checkpoint_unverified/u)
  assert.match(service, /Reject an earlier attempt unless its complete cleaned receipt is recoverable/u)
  assert.match(service, /plan55_resume_prior_attempt_not_reusable/u)
  assert.match(service, /previous_attempt=\$\{selected\?\.attempt/u)
  assert.match(service, /cleanup\?\.canaryFlag !== 'absent'/u)
  assert.match(service, /cleanup\?\.authStatus !== 404/u)
  assert.match(service, /plan55-service-start\/v1/u)
  assert.match(service, /include-hidden-files: true/u)
  assert.ok(service.indexOf('name: Preserve the service start marker before canary execution') <
    service.indexOf('name: Run one service and capture only a scrubbed receipt or safe failure code'))
  assert.match(service, /result_file="\$raw_attempt_dir\/result\.json"/u)
  assert.match(service, /error_file="\$raw_attempt_dir\/stderr\.txt"/u)
  assert.match(release, /--checkpoint-status/u)
  assert.match(release, /--run \\\r?\n/u)
  assert.match(release, /G5_FAILED_SERVICE_OFF/u)
  assert.match(release, /cleanup\?\.reused !== true/u)
  assert.match(release, /item\.slice_count !== 8 \|\| item\.case_count !== 96 \|\| item\.error_count !== 0/u)
  assert.doesNotMatch(release, /item\.slices\?/u)
})

test('release workflows are covered by the deployed evaluator source attestation', () => {
  assert.match(sourceAttestation, /'\.github\/workflows\/plan55-production-only\.yml'/u)
  assert.match(sourceAttestation, /'\.github\/workflows\/plan55-production-canary-service\.yml'/u)
})
