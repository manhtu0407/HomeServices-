import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P56-stage1-production-release-workflow',
  invariant:
    'the verified local runner is the only Production release authority; exact reviewed source and release gates precede the cohort canary, three full synthetic smokes, atomic promotion, acceptance note, and downloaded-source rollback',
  authority: [
    'approved Stage 1 implementation plan (post-merge release integrity)',
    'owner-authorized Production policy (no independent GitHub reviewer gate)',
    'governance/critical.md #3 (No False Completion)',
    'governance/RULES.md #1 and #8 (safe boundaries and no fake success)',
  ],
  target: 'scripts/harness/production-release-runner.mjs',
  layer: 'security-negative',
  siblings: [
    'P53-stage1-release-integrity',
    'P54-synthetic-cohort-nonvisibility',
    'P66-stage1-synthetic-actor-provision',
  ],
  mutation:
    'deploy without the local runner preflight, skip full source-closure attestation, remove an exact canary/smoke/rollback gate, or add prune/delete — this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(import.meta.dirname, '../../../../..')
const workflow = readFileSync(resolve(root, '.github/workflows/release-production.yml'), 'utf8').replace(/\r\n/gu, '\n')
const pipeline = readFileSync(resolve(root, 'scripts/harness/production-release-steps.yml'), 'utf8').replace(/\r\n/gu, '\n')
const runner = readFileSync(resolve(root, 'scripts/harness/production-release-runner.mjs'), 'utf8')
const credentials = readFileSync(resolve(root, 'scripts/harness/production-release-credentials.mjs'), 'utf8')
const smoke = readFileSync(resolve(root, 'apps/api/scripts/stage1-synthetic-release-smoke.mjs'), 'utf8')

const NO_DEPLOYMENT_RECORD = /^ {4}environment:\n {6}name: production\n {6}deployment: false$/mu

function workflowJobs(source: string): Map<string, string> {
  const start = source.indexOf('\njobs:\n')
  if (start < 0) throw new Error(pillarWhy(PILLAR, 'the workflow has no jobs: section'))
  const jobs = source.slice(start + '\njobs:\n'.length)
  const headers = [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gmu)]
  return new Map(headers.map((header, index): [string, string] => [
    header[1] as string,
    jobs.slice(header.index ?? 0, headers[index + 1]?.index ?? jobs.length),
  ]))
}

describe('Stage 1 production release workflow', () => {
  it('runs only from main and never from a pull request', () => {
    expect(workflow, pillarWhy(PILLAR, 'quality and scheduled reconciliation are the only GitHub release jobs'))
      .toContain('branches: [main]')
    expect(workflow, pillarWhy(PILLAR, 'the workflow has no PR or manual production trigger'))
      .not.toMatch(/^\s*(?:pull_request|workflow_dispatch):/mu)
    expect([...workflowJobs(workflow).keys()]).toEqual(['stale-canary-reconciler', 'quality'])
    expect(workflow, pillarWhy(PILLAR, 'GitHub Actions cannot deploy or promote Production'))
      .not.toMatch(/functions deploy|db push --linked|--action (?:configure|promote)|eas-cli@\S+ submit/u)
    expect(runner, pillarWhy(PILLAR, 'the local runner checks the reviewed merge and its owner approval'))
      .toContain('github-merge-approval.mjs')
    expect(runner).toContain('kouuuuuuuuu')
  })

  it('binds before one candidate deploy and attests the exact redownloaded source before smoke', () => {
    const configure = pipeline.indexOf('--action configure')
    const binding = pipeline.indexOf('runtime-release-bindings.mjs')
    const deploy = pipeline.indexOf('functions deploy mobile-api')
    const maintainerDeploy = pipeline.indexOf('functions deploy kael-matching-maintainer', deploy)
    const sourceDownload = pipeline.indexOf('--workdir artifacts/candidate-source functions download mobile-api')
    const sourceProof = pipeline.indexOf('edge-source-proof.mjs', sourceDownload)
    const attestation = pipeline.indexOf('source-deployment-attestation.mjs')
    const actorProvision = pipeline.indexOf('stage1-synthetic-actor-provision.mjs')
    const smokeStep = pipeline.indexOf('stage1-synthetic-release-smoke.mjs')
    const promote = pipeline.indexOf('--action promote')
    const finalCleanup = pipeline.indexOf('final-cleanup.json')
    const acceptanceNote = pipeline.indexOf('production-acceptance-note.mjs')
    expect(configure, pillarWhy(PILLAR, 'canary lane exists before candidate Edge code')).toBeGreaterThan(0)
    expect(binding, pillarWhy(PILLAR, 'old bytes see candidate secrets only through the attested fail-closed lane')).toBeGreaterThan(configure)
    expect(deploy, pillarWhy(PILLAR, 'candidate Edge deploy follows its safe runtime binding')).toBeGreaterThan(binding)
    expect(maintainerDeploy, pillarWhy(PILLAR, 'autonomous dispatcher ships in the same candidate release')).toBeGreaterThan(deploy)
    expect(sourceDownload, pillarWhy(PILLAR, 'hosted candidate source is redownloaded after both deploys')).toBeGreaterThan(maintainerDeploy)
    expect(sourceProof, pillarWhy(PILLAR, 'the hosted import closure is compared to the reviewed candidate')).toBeGreaterThan(sourceDownload)
    expect(attestation, pillarWhy(PILLAR, 'the exact provider deployment is bound only after byte proof')).toBeGreaterThan(sourceProof)
    expect(actorProvision, pillarWhy(PILLAR, 'dedicated actors are safely created and permanently classified after source proof')).toBeGreaterThan(attestation)
    expect(smokeStep, pillarWhy(PILLAR, 'smoke begins only after actor classification proof')).toBeGreaterThan(actorProvision)
    expect(promote, pillarWhy(PILLAR, 'atomic promotion follows smoke evidence')).toBeGreaterThan(smokeStep)
    expect(finalCleanup, pillarWhy(PILLAR, 'exact cohort cleanup is proven before real traffic promotion')).toBeGreaterThan(smokeStep)
    expect(promote, pillarWhy(PILLAR, 'promotion follows exact cleanup proof')).toBeGreaterThan(finalCleanup)
    expect(acceptanceNote, pillarWhy(PILLAR, 'final Dev-review evidence is written in Supabase Production')).toBeGreaterThan(promote)
    expect(pipeline, pillarWhy(PILLAR, 'exactly three sequential runs are requested')).toContain('for sequence in 1 2 3')
    expect(pipeline.slice(configure, smokeStep).match(/functions deploy mobile-api/gu)?.length,
      pillarWhy(PILLAR, 'candidate source is deployed exactly once before smoke')).toBe(1)
    expect(pipeline.slice(configure, smokeStep).match(/functions deploy kael-matching-maintainer/gu)?.length,
      pillarWhy(PILLAR, 'candidate dispatcher is deployed exactly once before smoke')).toBe(1)
    expect(pipeline.slice(sourceDownload, smokeStep)).toContain('functions download kael-matching-maintainer')
    expect(pipeline.slice(sourceDownload, promote)).toContain('--maintainer-source-proof')
    expect(pipeline.slice(attestation, smokeStep)).toContain('STAGE1_ACTOR_PROVISION_APPROVAL=')
    expect(pipeline.slice(attestation, smokeStep)).toContain('synthetic-actor-provision.json')
  })

  it('downloads the hosted rollback source and aborts plus redeploys it on failure', () => {
    for (const contract of [
      'functions download mobile-api',
      'functions download kael-matching-maintainer',
      'failure-receipt.mjs',
      '--action recover',
      '--workdir artifacts/rollback',
      'rollback_source',
      'rollback-proof.mjs',
      'control-after-recovery.json',
      'restored-mobile-source-sha256',
      'restored-maintainer-source-sha256',
      'Hosted identity or Edge redeploy evidence did not converge',
      '--source-root artifacts/rollback',
      '--source-root artifacts/rollback-proof',
      '--digest-only',
    ]) expect(pipeline, pillarWhy(PILLAR, `rollback contract ${contract}`)).toContain(contract)
    expect(pipeline, pillarWhy(PILLAR, 'path-only hashes omit imported global shared source'))
      .not.toContain('path-digest.mjs')
    expect(pipeline, pillarWhy(PILLAR, 'rollback commands must be checked individually')).not.toContain('set +e')
    expect(pipeline, pillarWhy(PILLAR, 'a cancelled canary must enter the same recovery path')).toContain(
      "if: always() && (failure() || cancelled()) && steps.configure.outcome != 'skipped'",
    )
    expect(pipeline, pillarWhy(PILLAR, 'release must not delete remote functions')).not.toContain('--prune')
    expect(pipeline, pillarWhy(PILLAR, 'release must not delete remote functions')).not.toContain('functions delete')
    expect(pipeline, pillarWhy(PILLAR, 'the runner never merges GitHub pull requests')).not.toMatch(/\bgh\s+pr\s+merge\b/u)
  })

  it('uses real release, authorization, and confirmation failures for safe-error proof', () => {
    for (const contract of [
      'CLIENT_UPDATE_REQUIRED',
      'AUTH_FORBIDDEN',
      'INVALID_STATUS',
      'release_mismatch',
      'worker_customer_boundary',
      'confirmation_contract',
      'rejected confirmation created durable workflow state',
    ]) expect(smoke, pillarWhy(PILLAR, `safe error contract ${contract}`)).toContain(contract)
    expect(smoke.match(/stage1-synthetic-intentional-not-found/gu)?.length,
      pillarWhy(PILLAR, 'routing 404 is only one supplemental safe-error case')).toBe(1)
  })

  it('renews Worker reachability after intake and immediately before Customer confirmation', () => {
    const readiness = smoke.indexOf('const ready = await this.createReadySession')
    const confirmationGuard = smoke.indexOf('await this.assertConfirmationMismatch', readiness)
    const heartbeat = smoke.indexOf("'/workers/me/matching-heartbeat'", confirmationGuard)
    const confirmation = smoke.indexOf('`/kael/chat/${sessionId}/confirm`', confirmationGuard)
    expect(readiness, pillarWhy(PILLAR, 'the potentially long intake precedes the final reachability proof')).toBeGreaterThan(0)
    expect(confirmationGuard, pillarWhy(PILLAR, 'the rejected confirmation guard precedes the real mutation')).toBeGreaterThan(readiness)
    expect(heartbeat, pillarWhy(PILLAR, 'Worker foreground proof is refreshed after intake completes')).toBeGreaterThan(confirmationGuard)
    expect(confirmation, pillarWhy(PILLAR, 'Customer confirmation follows the fresh Worker heartbeat')).toBeGreaterThan(heartbeat)
  })

  it('runs the local pipeline only after read-only identity, review, CI, project, and credential checks', () => {
    const required = [
      '--untracked-files=all',
      'github-merge-approval.mjs',
      'verifyExactMainQualityRun',
      'SUPABASE_ACCESS_TOKEN',
      'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
      'readProductionTargetLock',
      'project:info',
      'no-active-candidate',
    ]
    for (const contract of required) expect(runner, pillarWhy(PILLAR, `preflight contract ${contract}`)).toContain(contract)
    expect(credentials).toContain('SUPABASE_DB_PASSWORD')
    expect(runner.indexOf('evaluateProductionPreflight')).toBeGreaterThan(-1)
    expect(runner.indexOf('!options.execute')).toBeGreaterThan(runner.indexOf('evaluateProductionPreflight'))
    expect(runner, pillarWhy(PILLAR, 'missing preflight evidence stops before production commands'))
      .toContain('preflight.status !== \'PASS\'')
    expect(runner, pillarWhy(PILLAR, 'all CLI calls are passed through secret-redacted output handling'))
      .toContain('redactSensitiveText')
  })

  it('records a deployment only for the scheduled stale-canary reconciler', () => {
    const jobs = workflowJobs(workflow)
    expect([...jobs.keys()].sort(), pillarWhy(PILLAR, 'GitHub Actions has only read-only jobs'))
      .toEqual(['quality', 'stale-canary-reconciler'])
    expect(jobs.get('stale-canary-reconciler'), pillarWhy(PILLAR, 'the reconciler is explicitly not a deployment'))
      .toMatch(NO_DEPLOYMENT_RECORD)
    expect(workflow, pillarWhy(PILLAR, 'quality runs on main pushes'))
      .toContain("if: github.event_name != 'schedule' && github.ref == 'refs/heads/main'")
  })
})
