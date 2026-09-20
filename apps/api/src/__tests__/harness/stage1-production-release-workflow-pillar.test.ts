import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P56-stage1-production-release-workflow',
  invariant:
    'the immutable main release lane and one locked operator recovery dispatch can run the production release; provider/source and normal-UI attestation gate a clean cohort canary, three full synthetic smokes, atomic promotion, Supabase Production acceptance note, and a full-closure downloaded-source rollback',
  authority: [
    'approved Stage 1 implementation plan (post-merge release integrity)',
    'owner-authorized Production policy (no independent GitHub reviewer gate)',
    'governance/critical.md #3 (No False Completion)',
    'governance/RULES.md #1 and #8 (safe boundaries and no fake success)',
  ],
  target: '.github/workflows/release-production.yml',
  layer: 'security-negative',
  siblings: [
    'P53-stage1-release-integrity',
    'P54-synthetic-cohort-nonvisibility',
    'P66-stage1-synthetic-actor-provision',
  ],
  mutation:
    'deploy before safe binding, skip full source-closure attestation, remove an exact canary/smoke/rollback gate, or add prune/delete — this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(import.meta.dirname, '../../../../..')

describe('Stage 1 production release workflow', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/release-production.yml'), 'utf8')
  const smoke = readFileSync(resolve(root, 'apps/api/scripts/stage1-synthetic-release-smoke.mjs'), 'utf8')

  it('runs from main or the exact locked recovery dispatch and never from a pull request', () => {
    expect(workflow, pillarWhy(PILLAR, 'main is the production release authority')).toContain('branches: [main]')
    expect(workflow, pillarWhy(PILLAR, 'PR workflows only build and test')).not.toContain('pull_request:')
    expect(workflow, pillarWhy(PILLAR, 'normal production job stays on main')).toContain("github.ref == 'refs/heads/main'")
    expect(workflow, pillarWhy(PILLAR, 'operator recovery must be explicit')).toContain('workflow_dispatch:')
    expect(workflow, pillarWhy(PILLAR, 'operator recovery must carry its exact input')).toContain('kael_production_recovery:')
    expect(workflow, pillarWhy(PILLAR, 'operator recovery branch is locked')).toContain(
      "github.ref == 'refs/heads/codex/kael-chat-production-reliability'",
    )
    expect(workflow, pillarWhy(PILLAR, 'operator recovery acknowledgement is locked')).toContain(
      "inputs.kael_production_recovery == 'RECOVER_KAEL_PRODUCTION'",
    )
    expect(workflow, pillarWhy(PILLAR, 'both jobs require the same ref proof')).toContain('RELEASE_REF_VERIFIED')
    expect(workflow, pillarWhy(PILLAR, 'the release lane is explicitly reviewerless')).not.toContain('github-merge-approval.mjs')
    expect(workflow, pillarWhy(PILLAR, 'the release lane has no reviewer argument')).not.toMatch(/--reviewer\b/u)
    expect(workflow, pillarWhy(PILLAR, 'reviewer evidence is not bound into promotion')).not.toContain('merge-approval')
    expect(workflow, pillarWhy(PILLAR, 'the promotion packet records the resolved authority')).toContain('RELEASE_AUTHORITY')
    expect(workflow, pillarWhy(PILLAR, 'normal Production release retains main authority')).toContain('main-branch-merge')
    expect(workflow, pillarWhy(PILLAR, 'operator recovery is recorded distinctly')).toContain('operator-kael-production-recovery')
  })

  it('reruns quality, SQL, generated-type, and hosted expand-only gates before deploy', () => {
    for (const gate of [
      'pnpm type-check',
      'pnpm test',
      'pnpm build',
      'pnpm lint:comments',
      'pnpm lint:structure',
      'pnpm lint:workplan',
      'pnpm lint:production-ui-copy',
      'pnpm harness:verify',
      'run-sql-tests',
      'assert-expand-only.mjs',
      'prepare-migration-workdir.mjs',
      'hosted-state.mjs',
      'iwevizmsedyqozxlawwl',
      '@nestscout/home-services',
      'c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b',
      'eas-project.txt',
    ]) expect(workflow, pillarWhy(PILLAR, `release gate ${gate}`)).toContain(gate)
    expect(workflow, pillarWhy(PILLAR, 'token-authenticated CLI link does not depend on an unrecoverable DB password'))
      .toContain('link --project-ref "$PRODUCTION_PROJECT_REF" --yes')
    expect(workflow, pillarWhy(PILLAR, 'release has no undeclared DB-password dependency'))
      .not.toContain('PRODUCTION_SUPABASE_DB_PASSWORD')
    const productionJob = workflow.slice(workflow.indexOf('  production-release:'))
    expect(productionJob, pillarWhy(PILLAR, 'native release and rollback have enough bounded execution time'))
      .toContain('timeout-minutes: 240')
  })

  it('binds before one candidate deploy and attests the exact redownloaded source before smoke', () => {
    const configure = workflow.indexOf('--action configure')
    const binding = workflow.indexOf('runtime-release-bindings.mjs')
    const deploy = workflow.indexOf('functions deploy mobile-api')
    const maintainerDeploy = workflow.indexOf('functions deploy kael-matching-maintainer', deploy)
    const sourceDownload = workflow.indexOf('--workdir artifacts/candidate-source functions download mobile-api')
    const sourceProof = workflow.indexOf('edge-source-proof.mjs', sourceDownload)
    const attestation = workflow.indexOf('source-deployment-attestation.mjs')
    const actorProvision = workflow.indexOf('stage1-synthetic-actor-provision.mjs')
    const smoke = workflow.indexOf('stage1-synthetic-release-smoke.mjs')
    const promote = workflow.indexOf('--action promote')
    const finalCleanup = workflow.indexOf('final-cleanup.json')
    const acceptanceNote = workflow.indexOf('production-acceptance-note.mjs')
    expect(configure, pillarWhy(PILLAR, 'canary lane exists before candidate Edge code')).toBeGreaterThan(0)
    expect(binding, pillarWhy(PILLAR, 'old bytes see candidate secrets only through the attested fail-closed lane')).toBeGreaterThan(configure)
    expect(deploy, pillarWhy(PILLAR, 'candidate Edge deploy follows its safe runtime binding')).toBeGreaterThan(binding)
    expect(maintainerDeploy, pillarWhy(PILLAR, 'autonomous dispatcher ships in the same candidate release')).toBeGreaterThan(deploy)
    expect(sourceDownload, pillarWhy(PILLAR, 'hosted candidate source is redownloaded after both deploys')).toBeGreaterThan(maintainerDeploy)
    expect(sourceProof, pillarWhy(PILLAR, 'the hosted import closure is compared to the reviewed candidate')).toBeGreaterThan(sourceDownload)
    expect(attestation, pillarWhy(PILLAR, 'the exact provider deployment is bound only after byte proof')).toBeGreaterThan(sourceProof)
    expect(actorProvision, pillarWhy(PILLAR, 'dedicated actors are safely created and permanently classified after source proof')).toBeGreaterThan(attestation)
    expect(smoke, pillarWhy(PILLAR, 'smoke begins only after actor classification proof')).toBeGreaterThan(actorProvision)
    expect(smoke, pillarWhy(PILLAR, 'full synthetic workflow follows source attestation')).toBeGreaterThan(attestation)
    expect(promote, pillarWhy(PILLAR, 'atomic promotion follows smoke evidence')).toBeGreaterThan(smoke)
    expect(finalCleanup, pillarWhy(PILLAR, 'exact cohort cleanup is proven before real traffic promotion')).toBeGreaterThan(smoke)
    expect(promote, pillarWhy(PILLAR, 'promotion follows exact cleanup proof')).toBeGreaterThan(finalCleanup)
    expect(acceptanceNote, pillarWhy(PILLAR, 'final Dev-review evidence is written in Supabase Production')).toBeGreaterThan(promote)
    expect(workflow, pillarWhy(PILLAR, 'exactly three sequential runs are requested')).toContain('for sequence in 1 2 3')
    expect(workflow.slice(configure, smoke).match(/functions deploy mobile-api/gu)?.length,
      pillarWhy(PILLAR, 'candidate source is deployed exactly once before smoke')).toBe(1)
    expect(workflow.slice(configure, smoke).match(/functions deploy kael-matching-maintainer/gu)?.length,
      pillarWhy(PILLAR, 'candidate dispatcher is deployed exactly once before smoke')).toBe(1)
    expect(workflow.slice(sourceDownload, smoke)).toContain('functions download kael-matching-maintainer')
    expect(workflow.slice(sourceDownload, promote)).toContain('--maintainer-source-proof')
    expect(workflow.slice(attestation, smoke)).toContain('STAGE1_ACTOR_PROVISION_APPROVAL=')
    expect(workflow.slice(attestation, smoke)).toContain('synthetic-actor-provision.json')
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
    ]) expect(workflow, pillarWhy(PILLAR, `rollback contract ${contract}`)).toContain(contract)
    expect(workflow, pillarWhy(PILLAR, 'path-only hashes omit imported global shared source'))
      .not.toContain('path-digest.mjs')
    expect(workflow, pillarWhy(PILLAR, 'rollback commands must be checked individually')).not.toContain('set +e')
    expect(workflow, pillarWhy(PILLAR, 'a cancelled canary must enter the same recovery path')).toContain(
      "if: always() && (failure() || cancelled()) && steps.configure.outcome != 'skipped'",
    )
    expect(workflow, pillarWhy(PILLAR, 'release must not delete remote functions')).not.toContain('--prune')
    expect(workflow, pillarWhy(PILLAR, 'release must not delete remote functions')).not.toContain('functions delete')
    expect(workflow, pillarWhy(PILLAR, 'Codex and automation do not merge')).not.toMatch(/\bgh\s+pr\s+merge\b/u)
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
    expect(readiness, pillarWhy(PILLAR, 'the potentially long intake precedes the final reachability proof'))
      .toBeGreaterThan(0)
    expect(confirmationGuard, pillarWhy(PILLAR, 'the rejected confirmation guard precedes the real mutation'))
      .toBeGreaterThan(readiness)
    expect(heartbeat, pillarWhy(PILLAR, 'Worker foreground proof is refreshed after intake completes'))
      .toBeGreaterThan(confirmationGuard)
    expect(confirmation, pillarWhy(PILLAR, 'Customer confirmation follows the fresh Worker heartbeat'))
      .toBeGreaterThan(heartbeat)
  })
})
