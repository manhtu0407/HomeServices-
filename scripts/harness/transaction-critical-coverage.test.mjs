import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

import {
  collectedPillars,
  evaluateBehavioralEvidence,
  unmappedEntries,
  validateTransactionCoverage,
} from './transaction-critical-coverage.mjs'

const manifest = JSON.parse(readFileSync(resolve('config/harness/transaction-critical-coverage.json'), 'utf8'))
const capabilities = JSON.parse(readFileSync(resolve('config/harness/capabilities.json'), 'utf8'))
const referencedPillars = collectedPillars()

function clone(value) {
  return structuredClone(value)
}

test('transaction coverage baseline satisfies the pinned contract', () => {
  assert.deepEqual(validateTransactionCoverage(manifest, capabilities, referencedPillars), [])
})

test('transaction coverage reports a missing critical route', () => {
  const changed = clone(manifest)
  changed.entries = changed.entries.filter((entry) => entry.route_kind !== 'jobs.review')
  assert.ok(
    validateTransactionCoverage(changed, capabilities, referencedPillars)
      .includes('critical route has no covered entry: jobs.review'),
  )
})

test('transaction coverage reports actor widening and a dormant pillar reference', () => {
  const changed = clone(manifest)
  const entry = changed.entries.find((item) => item.route_kind === 'jobs.accept')
  entry.actor = 'customer'
  entry.pillars = ['P999-dormant-placeholder']
  const problems = validateTransactionCoverage(changed, capabilities, referencedPillars)
  assert.ok(problems.includes('worker.offer.accept: route jobs.accept does not authorize actor customer'))
  assert.ok(problems.includes('worker.offer.accept: pillar P999-dormant-placeholder is not collected'))
})

test('one unrelated route-preview pillar cannot stand in for the entire transaction', () => {
  const changed = clone(manifest)
  for (const entry of changed.entries) entry.pillars = ['P36-worker-route-unit-protection']
  const problems = validateTransactionCoverage(changed, capabilities, referencedPillars)
  assert.ok(problems.length > 0, 'unrelated support pillars must not satisfy behavioral bindings')
  assert.ok(problems.some((problem) => problem.includes('P79-worker-completion-media-ownership')))
  assert.ok(problems.some((problem) => problem.includes('P82-review-submission-runtime')))
})

test('partial bindings cannot be relabelled mapped while their route or state coverage is missing', () => {
  const changed = clone(manifest)
  for (const coverage of Object.values(changed.behavioral_contract.bindings)) {
    coverage.status = 'MAPPED'
    coverage.gaps = []
  }
  const problems = validateTransactionCoverage(changed, capabilities, referencedPillars)
  assert.ok(problems.some((problem) => problem.includes('MAPPED has no behavioral origin scheduled')))
  assert.ok(problems.some((problem) => problem.includes('MAPPED public route needs an HTTP behavioral case')))
})

test('catalog metadata alone leaves every transaction entry unproven', () => {
  const evidence = evaluateBehavioralEvidence(manifest)
  assert.equal(evidence.entries.length, manifest.entries.length)
  assert.ok(evidence.entries.every((entry) => entry.problems.length > 0))
  for (const entry of evidence.entries) {
    assert.equal(entry.status, manifest.behavioral_contract.bindings[entry.id]?.status ?? 'UNVERIFIED')
  }
  assert.ok(evidence.entries.every((entry) => entry.passedTests === 0))
})

test('the mapping precheck lists exactly the entries that are not MAPPED', () => {
  const unmapped = unmappedEntries(manifest)
  const expected = evaluateBehavioralEvidence(manifest).entries.filter((entry) => entry.status !== 'MAPPED')
  assert.deepEqual(unmapped.map((entry) => entry.id), expected.map((entry) => entry.id))
  assert.ok(unmapped.every((entry) => entry.status === 'PARTIAL' || entry.status === 'UNVERIFIED'))
})

test('the mapping precheck passes only when every entry has a MAPPED binding', () => {
  const changed = clone(manifest)
  for (const coverage of Object.values(changed.behavioral_contract.bindings)) {
    coverage.status = 'MAPPED'
    coverage.gaps = []
  }
  const withoutBinding = changed.entries.filter((entry) => !changed.behavioral_contract.bindings[entry.id])
  assert.deepEqual(unmappedEntries(changed).map((entry) => entry.id), withoutBinding.map((entry) => entry.id))
  changed.entries = changed.entries.filter((entry) => changed.behavioral_contract.bindings[entry.id])
  assert.deepEqual(unmappedEntries(changed), [])
})

test('the release quality job fails on an unmapped transaction before it spends runner time on tests', () => {
  const release = readFileSync(resolve('.github/workflows/release-production.yml'), 'utf8')
  const quality = release.indexOf('  quality:')
  const mapped = release.indexOf('transaction-critical-coverage.mjs --require-mapped')
  const install = release.indexOf('pnpm install --frozen-lockfile', quality)
  const gates = release.indexOf('Whole-workspace quality gates')
  assert.ok(quality >= 0 && mapped > quality, 'the precheck belongs to the quality job')
  assert.ok(mapped < install && install < gates, 'the precheck runs before install and the whole-workspace gates')
  assert.ok(mapped < release.indexOf('  release-config-gate:'))
})

function completeFixture() {
  const value = clone(manifest)
  const entry = value.entries.find((item) => item.id === 'worker.fulfillment.advance')
  const coverage = value.behavioral_contract.bindings[entry.id]
  const binding = coverage.cases[0]
  value.entries = [entry]
  entry.from = [...binding.from]
  entry.to = [...binding.to]
  coverage.status = 'MAPPED'
  coverage.gaps = []
  value.behavioral_contract.bindings = { [entry.id]: coverage }
  const report = {
    success: true,
    testResults: [{
      name: `/ci/workspace/${binding.file}`,
      status: 'passed',
      assertionResults: [...binding.success_tests, ...binding.denial_tests, ...binding.recovery_tests]
        .map((fullName) => ({ fullName, status: 'passed' })),
    }],
  }
  return { value, report }
}

test('a mapped slice requires exact passed assertion names in the bound file', () => {
  const { value, report } = completeFixture()
  assert.deepEqual(evaluateBehavioralEvidence(value, [report]).problems, [])
  report.testResults[0].name = '/ci/workspace/unrelated-pillar.test.ts'
  assert.ok(evaluateBehavioralEvidence(value, [report]).problems.some((problem) => problem.includes('missing, skipped, failed')))
})

for (const outcome of ['missing', 'pending', 'skipped', 'failed', 'ambiguous']) {
  test(`required behavioral proof rejects ${outcome} test execution`, () => {
    const { value, report } = completeFixture()
    const results = report.testResults[0].assertionResults
    if (outcome === 'missing') results.shift()
    else if (outcome === 'ambiguous') results.push({ ...results[0] })
    else results[0].status = outcome
    assert.ok(evaluateBehavioralEvidence(value, [report]).problems.some((problem) => problem.includes('missing, skipped, failed')))
  })
}

test('a red runner report cannot prove selected green assertions', () => {
  const { value, report } = completeFixture()
  report.success = false
  assert.ok(evaluateBehavioralEvidence(value, [report]).problems.includes('runner report is missing, malformed, or reports a failed run'))
})

test('passing bound cases do not erase explicitly remaining transaction gaps', () => {
  const { report } = completeFixture()
  const evidence = evaluateBehavioralEvidence(manifest, [report])
  const worker = evidence.entries.find((entry) => entry.id === 'worker.fulfillment.advance')
  assert.equal(worker.passedTests, worker.requiredTests)
  assert.ok(worker.problems.some((problem) => problem.startsWith('PARTIAL:')))
})

test('PR assertion verification preserves completion debt without treating it as a failed test', () => {
  const { value, report } = completeFixture()
  const coverage = Object.values(value.behavioral_contract.bindings)[0]
  coverage.status = 'PARTIAL'
  coverage.gaps = ['Hosted transaction proof remains open.']
  value.entries.push({ id: 'unmapped-route' })
  const evidence = evaluateBehavioralEvidence(value, [report])
  assert.deepEqual(evidence.executionProblems, [])
  assert.equal(evidence.entries[0].status, 'PARTIAL')
  assert.equal(evidence.entries[1].status, 'UNVERIFIED')
  assert.equal(evidence.problems.length, 2, 'release completion must still fail on both gaps')
})

for (const outcome of ['missing', 'pending', 'skipped', 'failed', 'ambiguous', 'wrong-file', 'red-runner']) {
  test(`PR assertion verification still rejects ${outcome} execution`, () => {
    const { value, report } = completeFixture()
    const coverage = Object.values(value.behavioral_contract.bindings)[0]
    coverage.status = 'PARTIAL'
    coverage.gaps = ['Hosted transaction proof remains open.']
    const suite = report.testResults[0]
    if (outcome === 'missing') suite.assertionResults.shift()
    else if (outcome === 'ambiguous') suite.assertionResults.push({ ...suite.assertionResults[0] })
    else if (outcome === 'wrong-file') suite.name = '/unrelated.test.ts'
    else if (outcome === 'red-runner') report.success = false
    else suite.assertionResults[0].status = outcome
    assert.ok(evaluateBehavioralEvidence(value, [report]).executionProblems.length > 0)
  })
}

test('PR assertion verification refuses absent reports and empty reviewed bindings', () => {
  const { value, report } = completeFixture()
  assert.ok(evaluateBehavioralEvidence(value).executionProblems.length > 0)
  value.behavioral_contract.bindings = {}
  assert.ok(evaluateBehavioralEvidence(value, [report]).executionProblems.length > 0)
})

test('PR and Production workflows keep different evidence obligations', () => {
  const pr = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')
  const release = readFileSync(resolve('.github/workflows/release-production.yml'), 'utf8')
  assert.match(pr, /transaction-critical-coverage\.mjs --require-bound-assertions/u)
  assert.doesNotMatch(pr, /--require-behavioral/u)
  assert.match(release, /transaction-critical-coverage\.mjs --require-behavioral/u)
  assert.doesNotMatch(release, /--require-bound-assertions/u)
})

test('Local integration checks out the PR head required by its release preflight', () => {
  const integration = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')
  assert.ok(integration.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'))
  assert.ok(integration.includes("EXPECTED_GIT_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || '' }}"))
})
