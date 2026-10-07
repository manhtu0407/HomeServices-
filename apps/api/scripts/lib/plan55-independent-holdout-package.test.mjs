import assert from 'node:assert/strict'
import test from 'node:test'

import { PLAN55_SOURCE_ASSETS } from './kael-playbook-production-attestation.mjs'
import {
  assertPlan55BlindPackageContext,
  buildPlan55BlindHoldoutPackage,
} from './plan55-independent-holdout-package.mjs'

const services = Object.keys(PLAN55_SOURCE_ASSETS)
const digest = (letter) => `sha256:${letter.repeat(64)}`

function fixture(overrides = {}) {
  const holdoutCasesByService = Object.fromEntries(services.map((service) => [service,
    Array.from({ length: 24 }, (_, index) => ({
      id: `${service}-case-${String(index + 1).padStart(2, '0')}`,
      input_text_vi: `synthetic blind scenario ${service} ${index + 1}`,
      expected: { intent: `label-${index + 1}`, safety: index % 2 === 0 },
      rationale: `private rationale ${service} ${index + 1}`,
      difficulty: 'edge',
      detail: `private detail ${service} ${index + 1}`,
    }))]))
  return {
    reviewedHeadSha: '1'.repeat(40),
    holdoutCasesByService,
    holdoutHashes: Object.fromEntries(services.map((service, index) => [service, digest('abcdef'[index])])),
    corpusHashes: Object.fromEntries(services.map((service, index) => [service, digest('fedcba'[index])])),
    playbookHashes: Object.fromEntries(services.map((service, index) => [service, digest('123456'[index])])),
    actorGuardFileBlobSha: 'a'.repeat(40),
    ...overrides,
  }
}

test('blind holdout package is source-bound and omits expected labels, rationales, and details', () => {
  const result = buildPlan55BlindHoldoutPackage(fixture())

  assert.equal(result.schema, 'plan55-independent-blind-holdout-package/v3')
  assert.equal(result.reviewed_head_sha, '1'.repeat(40))
  assert.equal(result.coverage.service_count, 6)
  assert.equal(result.coverage.case_count_per_service, 24)
  assert.equal(result.coverage.total_case_count, 144)
  assert.deepEqual(Object.keys(result.cases_by_service), services)
  for (const service of services) {
    assert.equal(result.cases_by_service[service].length, 24)
    assert.deepEqual(Object.keys(result.cases_by_service[service][0]), ['id', 'input_text_vi'])
  }
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('private rationale'))
  assert.ok(!serialized.includes('private detail'))
  assert.ok(!serialized.includes('"expected"'))
  assert.equal(result.rubric_version, 'plan55-independent-holdout-rubric/v1')
  assert.match(result.rubric_sha256, /^sha256:[a-f0-9]{64}$/u)
  assert.ok(!Object.hasOwn(result, 'holdout_hashes'))
  assert.ok(!Object.hasOwn(result, 'labels_sha256'))
  assert.ok(!Object.hasOwn(result, 'independent_attestation_comment_body'))
  assert.match(result.holdout_root_sha256, /^[a-f0-9]{64}$/u)
  assert.equal(result.input_hashes_by_service.hvac.length, 24)
  assert.match(result.input_hashes_by_service.hvac[0].input_sha256, /^sha256:[a-f0-9]{64}$/u)
  assert.match(result.package_sha256, /^sha256:[a-f0-9]{64}$/u)
})

test('blind holdout package rejects missing services, non-24 slices, malformed identities, and missing labels', () => {
  const base = fixture()
  const { holdoutCasesByService } = base

  assert.throws(() => buildPlan55BlindHoldoutPackage({
    ...base,
    holdoutCasesByService: Object.fromEntries(Object.entries(holdoutCasesByService).slice(1)),
  }), /plan55_blind_holdout_package_invalid/u)
  const tooShort = structuredClone(holdoutCasesByService)
  tooShort.hvac.pop()
  assert.throws(() => buildPlan55BlindHoldoutPackage({ ...base, holdoutCasesByService: tooShort }),
    /plan55_blind_holdout_package_invalid/u)
  const missingLabels = structuredClone(holdoutCasesByService)
  delete missingLabels.hvac[0].expected
  assert.throws(() => buildPlan55BlindHoldoutPackage({ ...base, holdoutCasesByService: missingLabels }),
    /plan55_blind_holdout_package_invalid/u)
  assert.throws(() => buildPlan55BlindHoldoutPackage({ ...base, reviewedHeadSha: 'not-a-sha' }),
    /plan55_blind_holdout_package_invalid/u)
})

test('blind holdout package fails closed on contact details and secrets in review inputs', () => {
  const base = fixture()
  const holdoutCasesByService = structuredClone(base.holdoutCasesByService)
  holdoutCasesByService.hvac[0].input_text_vi = 'Contact user@example.com for service'

  assert.throws(() => buildPlan55BlindHoldoutPackage({ ...base, holdoutCasesByService }),
    /plan55_blind_holdout_package_invalid/u)
})

test('blind holdout checksum changes when the exact reviewed source changes', () => {
  const base = fixture()
  const original = buildPlan55BlindHoldoutPackage(base)
  const revised = buildPlan55BlindHoldoutPackage({ ...base, reviewedHeadSha: '2'.repeat(40) })

  assert.notEqual(revised.package_sha256, original.package_sha256)
  assert.equal(revised.reviewed_head_sha, '2'.repeat(40))
})

test('blind package context binds PR head rather than the synthetic merge ref and fails closed on drift', () => {
  const headSha = 'a'.repeat(40)
  const context = {
    githubActions: 'true',
    eventName: 'pull_request',
    repository: 'manhtu0407/HomeServices-',
    githubRef: 'refs/pull/17/merge',
    githubBaseRef: 'main',
    event: {
      repository: { full_name: 'manhtu0407/HomeServices-' },
      pull_request: {
        number: 17,
        base: { ref: 'main' },
        head: { sha: headSha, repo: { full_name: 'manhtu0407/HomeServices-' } },
      },
    },
    reviewedHeadSha: headSha,
    pullRequestNumber: 17,
    checkoutHeadSha: headSha,
    workingTreeClean: true,
    productionBaseAncestor: true,
  }

  assert.deepEqual(assertPlan55BlindPackageContext(context), {
    reviewedHeadSha: headSha,
    pullRequestNumber: 17,
  })
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    checkoutHeadSha: 'b'.repeat(40),
  }), /plan55_blind_holdout_context_invalid/u)
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    workingTreeClean: false,
  }), /plan55_blind_holdout_context_invalid/u)
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    productionBaseAncestor: false,
  }), /plan55_blind_holdout_context_invalid/u)
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    event: {
      ...context.event,
      pull_request: {
        ...context.event.pull_request,
        head: { ...context.event.pull_request.head, repo: { full_name: 'untrusted/fork' } },
      },
    },
  }), /plan55_blind_holdout_context_invalid/u)
})

test('blind package dispatch accepts only a verified PR head invoked from default main', () => {
  const headSha = 'c'.repeat(40)
  const context = {
    githubActions: 'true',
    eventName: 'workflow_dispatch',
    repository: 'manhtu0407/HomeServices-',
    githubRef: 'refs/heads/main',
    reviewedHeadSha: headSha,
    pullRequestNumber: 23,
    checkoutHeadSha: headSha,
    workingTreeClean: true,
    productionBaseAncestor: true,
    dispatchReviewedHeadSha: headSha,
    dispatchPullRequestNumber: '23',
  }

  assert.equal(assertPlan55BlindPackageContext(context).reviewedHeadSha, headSha)
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    githubRef: 'refs/heads/codex/unreviewed',
  }), /plan55_blind_holdout_context_invalid/u)
  assert.throws(() => assertPlan55BlindPackageContext({
    ...context,
    dispatchReviewedHeadSha: 'd'.repeat(40),
  }), /plan55_blind_holdout_context_invalid/u)
})
