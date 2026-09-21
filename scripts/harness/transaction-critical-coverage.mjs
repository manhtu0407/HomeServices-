// Catalog bindings are reviewable claims. Only runner assertion results prove their tests ran;
// neither source names nor passing collected tests prove hosted or native transaction behavior.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MANIFEST_PATH = resolve(ROOT, 'config/harness/transaction-critical-coverage.json')
const CAPABILITIES_PATH = resolve(ROOT, 'config/harness/capabilities.json')
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'build', '.next', '.expo', '.turbo'])

const REQUIRED_ACTORS = ['customer', 'worker', 'admin', 'system']
const REQUIRED_STATES = [
  'signed_out',
  'authenticated',
  'worker_application_draft',
  'worker_application_pending',
  'worker_access_approved',
  'worker_kyc_pending',
  'worker_ready',
  'intake',
  'coverage_ready',
  'confirmation_pending',
  'job_created',
  'matching_queued',
  'broadcasting',
  'candidate_ready',
  'official_match',
  'scheduled',
  'on_way',
  'arrived',
  'inspecting',
  'working',
  'scope_change_pending',
  'completion_proposed',
  'customer_confirmed',
  'payment_pending',
  'paid',
  'reviewed',
  'closed',
  'cancelled',
  'recovery_required',
  'refund_required',
]

const REQUIRED_ROUTE_KINDS = [
  'workerApplications.me',
  'workerApplications.submit',
  'workers.registrationDraft',
  'workers.registrationCommand.submit',
  'workers.registrationCommand.get',
  'workers.register',
  'workers.me',
  'admin.workerApplications.decision',
  'admin.workerApplications.profileDecision',
  'services.coverage',
  'kael.chat.create',
  'kael.chat.turn',
  'kael.chat.confirm',
  'kael.chat.operation',
  'jobs.confirmSearch',
  'jobs.matchingRetry',
  'jobs.matchingOperation',
  'jobs.matchingPreference',
  'jobs.matchingPreferenceReceipt',
  'workers.matchingHeartbeat',
  'workers.broadcasts',
  'workers.broadcastSeen',
  'notifications.matchingDeliveryAck',
  'notifications.deviceToken',
  'notifications.deviceToken.unregister',
  'jobs.accept',
  'jobs.decline',
  'jobs.workerCandidate',
  'jobs.workerCandidateConfirm',
  'jobs.workerCandidateReject',
  'jobs.accessAuthorize',
  'jobs.rfqPrice',
  'jobs.rfqPricePropose',
  'jobs.rfqPriceDecide',
  'jobs.status',
  'jobs.mediaUpload',
  'jobs.scopeChange',
  'scope.decide',
  'jobs.confirmCompletion',
  'jobs.paymentOrder',
  'jobs.paymentOrderClaim',
  'jobs.review',
  'jobs.customerCancellation',
  'jobs.workerCancellation',
  'jobs.openDispute',
  'disputes.counterStatement',
  'disputes.adminDecision',
  'admin.operations.recoveryCases.list',
  'admin.operations.recoveryCases.detail',
  'admin.operations.recoveryCases.action',
  'admin.paymentReconciliations.list',
  'admin.paymentReconciliations.decision',
  'harness.health',
]

const REQUIRED_SYSTEM_SURFACES = [
  'auth.customer',
  'auth.worker',
  'confirmation.atomic',
  'matching.outbox',
  'matching.delivery_reconcile',
  'workflow.recovery_scan',
  'payment.synthetic_terminal',
  'release.production_promotion',
]

function walk(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const name of readdirSync(directory)) {
    if (SKIP_DIRS.has(name)) continue
    const path = resolve(directory, name)
    if (statSync(path).isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function relativePath(path) {
  return relative(ROOT, path).split('\\').join('/')
}

export function collectedPillars() {
  const files = [
    ...walk(resolve(ROOT, 'apps')),
    ...walk(resolve(ROOT, 'packages')),
    ...walk(resolve(ROOT, 'supabase/tests')),
  ]
  const pillars = new Map()
  for (const path of files) {
    const file = relativePath(path)
    const tsCollected = /(?:-pillar\.test|-pillar-test)\.[jt]sx?$/u.test(file)
    const sqlCollected = file.startsWith('supabase/tests/') && file.endsWith('.sql')
    if (!tsCollected && !sqlCollected) continue
    const source = readFileSync(path, 'utf8')
    const id = tsCollected
      ? source.match(/\bid:\s*'([^']+)'/u)?.[1]
      : source.match(/^--\s*@pillar\s+id:\s*(\S+)/mu)?.[1]
    if (id) pillars.set(id, file)
  }
  return pillars
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value))
}

export function validateTransactionCoverage(manifest, capabilities, pillars) {
  const problems = []
  if (manifest.version !== '1.0.0') problems.push('manifest version must be 1.0.0')
  if (manifest.minimum_public_workers !== 3) problems.push('minimum_public_workers must remain 3')
  if (!sameMembers(manifest.actors ?? [], REQUIRED_ACTORS)) problems.push('actor set drifted from customer, worker, admin, system')
  if (!sameMembers(manifest.states ?? [], REQUIRED_STATES)) problems.push('canonical transaction state set drifted')

  const capabilityByKind = new Map((capabilities.entries ?? []).map((entry) => [entry.kind, entry]))
  const entryIds = new Set()
  const coveredRoutes = new Set()
  const coveredStates = new Set()
  const coveredActors = new Set()
  const coveredSystemSurfaces = new Set()

  for (const entry of manifest.entries ?? []) {
    if (!entry.id || entryIds.has(entry.id)) problems.push(`duplicate or missing entry id: ${entry.id ?? '(missing)'}`)
    entryIds.add(entry.id)
    if (!REQUIRED_ACTORS.includes(entry.actor)) problems.push(`${entry.id}: unknown actor ${entry.actor}`)
    else coveredActors.add(entry.actor)
    if (!entry.authority) problems.push(`${entry.id}: authority is required`)
    if (!Array.isArray(entry.from) || entry.from.length === 0) problems.push(`${entry.id}: from states are required`)
    if (!Array.isArray(entry.to) || entry.to.length === 0) problems.push(`${entry.id}: to states are required`)
    for (const state of [...(entry.from ?? []), ...(entry.to ?? [])]) {
      if (!REQUIRED_STATES.includes(state)) problems.push(`${entry.id}: unknown state ${state}`)
      else coveredStates.add(state)
    }
    if (!Array.isArray(entry.pillars) || entry.pillars.length === 0) problems.push(`${entry.id}: at least one pillar is required`)
    for (const pillar of entry.pillars ?? []) {
      if (!pillars.has(pillar)) problems.push(`${entry.id}: pillar ${pillar} is not collected`)
    }

    if (entry.route_kind) {
      coveredRoutes.add(entry.route_kind)
      const capability = capabilityByKind.get(entry.route_kind)
      if (!capability) {
        problems.push(`${entry.id}: route ${entry.route_kind} is absent from capabilities.json`)
        continue
      }
      if (entry.actor === 'system') {
        if (!capability.public || (capability.roles ?? []).length !== 0) {
          problems.push(`${entry.id}: unauthenticated system/public route ${entry.route_kind} widened unexpectedly`)
        }
      } else if (!(capability.roles ?? []).includes(entry.actor)) {
        problems.push(`${entry.id}: route ${entry.route_kind} does not authorize actor ${entry.actor}`)
      }
      if ((entry.confirmation_gate ?? 'none') !== capability.confirmationGate) {
        problems.push(`${entry.id}: confirmation gate differs from capability ${capability.confirmationGate}`)
      }
    } else if (entry.system_surface) {
      coveredSystemSurfaces.add(entry.system_surface)
      if (!Array.isArray(entry.sources) || entry.sources.length === 0) problems.push(`${entry.id}: system surface needs sources`)
      for (const source of entry.sources ?? []) {
        if (!existsSync(resolve(ROOT, source))) problems.push(`${entry.id}: source does not exist: ${source}`)
      }
    } else {
      problems.push(`${entry.id}: route_kind or system_surface is required`)
    }
  }

  for (const actor of REQUIRED_ACTORS) if (!coveredActors.has(actor)) problems.push(`actor has no transaction entry: ${actor}`)
  for (const state of REQUIRED_STATES) if (!coveredStates.has(state)) problems.push(`state has no transaction entry: ${state}`)
  for (const route of REQUIRED_ROUTE_KINDS) if (!coveredRoutes.has(route)) problems.push(`critical route has no covered entry: ${route}`)
  for (const route of coveredRoutes) if (!REQUIRED_ROUTE_KINDS.includes(route)) problems.push(`manifest route is not in the critical allowlist: ${route}`)
  for (const surface of REQUIRED_SYSTEM_SURFACES) if (!coveredSystemSurfaces.has(surface)) problems.push(`critical system surface has no covered entry: ${surface}`)
  for (const surface of coveredSystemSurfaces) if (!REQUIRED_SYSTEM_SURFACES.includes(surface)) problems.push(`manifest system surface is not in the critical allowlist: ${surface}`)
  problems.push(...validateBehavioralBindings(manifest, pillars))
  return problems
}

function caseTests(binding) {
  return [...(binding.success_tests ?? []), ...(binding.denial_tests ?? []), ...(binding.recovery_tests ?? [])]
}

function validateBehavioralBindings(manifest, pillars) {
  const problems = []
  const contract = manifest.behavioral_contract
  if (contract?.default_status !== 'UNVERIFIED' || contract?.evidence_scope !== 'collected_tests_only') {
    return ['behavioral contract must default to UNVERIFIED and declare collected_tests_only scope']
  }
  const entries = new Map((manifest.entries ?? []).map((entry) => [entry.id, entry]))
  const caseIds = new Set()
  for (const [id, coverage] of Object.entries(contract.bindings ?? {})) {
    const entry = entries.get(id)
    if (!entry) { problems.push(`${id}: behavioral binding has no transaction entry`); continue }
    if (!['PARTIAL', 'MAPPED'].includes(coverage.status)) problems.push(`${id}: invalid behavioral binding status`)
    if (!Array.isArray(coverage.gaps) || (coverage.status === 'PARTIAL' && coverage.gaps.length === 0) ||
      (coverage.status === 'MAPPED' && coverage.gaps.length !== 0)) {
      problems.push(`${id}: PARTIAL needs named gaps and MAPPED must have none`)
    }
    if (!Array.isArray(coverage.cases) || coverage.cases.length === 0) problems.push(`${id}: behavioral cases are required`)
    const origins = new Set()
    const destinations = new Set()
    for (const binding of coverage.cases ?? []) {
      if (!binding.id || caseIds.has(binding.id)) problems.push(`${id}: missing or duplicate behavioral case id`)
      caseIds.add(binding.id)
      if (!entry.pillars?.includes(binding.pillar)) problems.push(`${id}: behavioral pillar ${binding.pillar} is absent from entry support pillars`)
      if (pillars.get(binding.pillar) !== binding.file) problems.push(`${id}: behavioral file does not match collected pillar ${binding.pillar}`)
      if (!binding.owner || !existsSync(resolve(ROOT, binding.owner)) || !binding.invocation) {
        problems.push(`${id}: a real domain owner and invoked operation are required`)
      }
      if (binding.file && existsSync(resolve(ROOT, binding.file))) {
        const declaredTarget = readFileSync(resolve(ROOT, binding.file), 'utf8').match(/\btarget:\s*'([^']+)'/u)?.[1]
        if (declaredTarget !== binding.owner) problems.push(`${id}: behavioral owner differs from the pillar target`)
      }
      if (!['http', 'service', 'ui', 'system'].includes(binding.seam)) problems.push(`${id}: invalid behavioral seam`)
      if (binding.actor !== entry.actor) problems.push(`${id}: behavioral actor differs from the transaction actor`)
      for (const [field, covered] of [['from', origins], ['to', destinations]]) {
        if (!Array.isArray(binding[field]) || binding[field].length === 0) problems.push(`${id}: behavioral ${field} states are required`)
        for (const state of binding[field] ?? []) {
          if (!entry[field].includes(state)) problems.push(`${id}: behavioral ${field} state ${state} is outside the entry`)
          covered.add(state)
        }
      }
      if (!Array.isArray(binding.success_tests) || binding.success_tests.length === 0 ||
        !Array.isArray(binding.denial_tests) || binding.denial_tests.length === 0) {
        problems.push(`${id}: behavioral success and denial test names are required`)
      }
      const names = caseTests(binding)
      if (names.some((name) => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length) {
        problems.push(`${id}: behavioral test names must be nonempty and unique`)
      }
    }
    if (coverage.status === 'MAPPED') {
      if (entry.route_kind && !coverage.cases.some((binding) => binding.seam === 'http')) {
        problems.push(`${id}: MAPPED public route needs an HTTP behavioral case`)
      }
      for (const state of entry.from) if (!origins.has(state)) problems.push(`${id}: MAPPED has no behavioral origin ${state}`)
      for (const state of entry.to) if (!destinations.has(state)) problems.push(`${id}: MAPPED has no behavioral destination ${state}`)
    }
  }
  return problems
}

export function evaluateBehavioralEvidence(manifest, reports = []) {
  const reportProblems = []
  if (reports.length === 0) reportProblems.push('runner reports are required for assertion verification')
  const suites = []
  for (const report of reports) {
    if (report.success !== true || !Array.isArray(report.testResults)) {
      reportProblems.push('runner report is missing, malformed, or reports a failed run')
      continue
    }
    suites.push(...report.testResults)
  }
  const entries = (manifest.entries ?? []).map((entry) => {
    const coverage = manifest.behavioral_contract?.bindings?.[entry.id]
    const status = coverage?.status ?? 'UNVERIFIED'
    const gaps = coverage?.gaps ?? ['No reviewed behavioral case binding exists.']
    const problems = []
    let passedTests = 0
    let requiredTests = 0
    for (const binding of coverage?.cases ?? []) {
      const fileSuites = suites.filter((suite) => {
        const path = String(suite.name ?? '').replaceAll('\\', '/')
        return path === binding.file || path.endsWith(`/${binding.file}`)
      })
      for (const testName of caseTests(binding)) {
        requiredTests += 1
        const matches = fileSuites.flatMap((suite) =>
          (suite.assertionResults ?? []).filter((result) => result.fullName === testName)
            .map((result) => ({ suiteStatus: suite.status, status: result.status })),
        )
        if (matches.length !== 1 || matches[0].suiteStatus !== 'passed' || matches[0].status !== 'passed') {
          problems.push(`${binding.id}: missing, skipped, failed, or ambiguous runner result for ${testName}`)
        } else passedTests += 1
      }
    }
    const executionProblems = [...problems]
    if (status !== 'MAPPED') problems.push(`${status}: ${gaps.join(' ')}`)
    return { id: entry.id, status, passedTests, requiredTests, gaps, problems, executionProblems }
  })
  if (entries.every((entry) => entry.requiredTests === 0)) {
    reportProblems.push('at least one reviewed assertion binding is required')
  }
  return {
    entries,
    executionProblems: [...reportProblems, ...entries.flatMap((entry) =>
      entry.executionProblems.map((problem) => `${entry.id}: ${problem}`))],
    problems: [...reportProblems, ...entries.flatMap((entry) => entry.problems.map((problem) => `${entry.id}: ${problem}`))],
  }
}

/**
 * Entries whose behavioral binding is not MAPPED. `--require-behavioral` cannot pass while any
 * exist, and this reads only the manifest, so a caller can learn that before running any test.
 */
export function unmappedEntries(manifest) {
  return evaluateBehavioralEvidence(manifest).entries.filter((entry) => entry.status !== 'MAPPED')
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const capabilities = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'))
  const pillars = collectedPillars()
  const problems = validateTransactionCoverage(manifest, capabilities, pillars)
  const reports = []
  let requireBehavioral = false
  let requireBoundAssertions = false
  let requireMapped = false
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === '--require-behavioral') requireBehavioral = true
    else if (argument === '--require-bound-assertions') requireBoundAssertions = true
    else if (argument === '--require-mapped') requireMapped = true
    else if (argument === '--results' && process.argv[index + 1]) {
      reports.push(JSON.parse(readFileSync(resolve(process.argv[++index]), 'utf8')))
    } else problems.push(`unknown or incomplete argument: ${argument}`)
  }
  if (problems.length > 0) {
    console.error('transaction-critical coverage problems:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(
    `transaction-critical catalog integrity ok: ${manifest.entries.length} actor-state entries, ` +
    `${REQUIRED_ROUTE_KINDS.length} routes, ${REQUIRED_SYSTEM_SURFACES.length} system surfaces, ` +
    `${pillars.size} collected pillars`,
  )
  if (requireMapped) {
    const unmapped = unmappedEntries(manifest)
    if (unmapped.length > 0) {
      console.error(
        `required behavioral mapping failed: ${unmapped.length} of ${manifest.entries.length} transaction entries ` +
        'are not MAPPED, so --require-behavioral cannot pass (collected tests only; no hosted/native proof is implied):',
      )
      for (const entry of unmapped.slice(0, 10)) console.error(`  ${entry.status} ${entry.id}: ${entry.gaps.join(' ')}`)
      if (unmapped.length > 10) console.error(`  ... and ${unmapped.length - 10} more`)
      process.exit(1)
    }
    console.log(`behavioral mapping ok: all ${manifest.entries.length} transaction entries are MAPPED`)
  }
  const evidence = evaluateBehavioralEvidence(manifest, reports)
  const missing = evidence.entries.filter((entry) => entry.status === 'UNVERIFIED')
  const partial = evidence.entries.filter((entry) => entry.status === 'PARTIAL')
  const passedTests = evidence.entries.reduce((sum, entry) => sum + entry.passedTests, 0)
  const requiredTests = evidence.entries.reduce((sum, entry) => sum + entry.requiredTests, 0)
  console.log(`behavioral verification: ${missing.length} UNVERIFIED, ${partial.length} PARTIAL; ${passedTests}/${requiredTests} bound assertions passed`)
  for (const entry of [...missing, ...partial]) console.log(`  ${entry.status} ${entry.id}: ${entry.gaps.join(' ')}`)
  if (requireBehavioral && evidence.problems.length > 0) {
    console.error('required behavioral proof failed (collected tests only; no hosted/native proof is implied):')
    for (const problem of evidence.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  if (requireBoundAssertions) {
    if (evidence.executionProblems.length > 0) {
      console.error('required bound assertion execution failed:')
      for (const problem of evidence.executionProblems) console.error(`  - ${problem}`)
      process.exit(1)
    }
    console.log('bound assertion execution passed; transaction completion and hosted/native readiness are not implied')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
