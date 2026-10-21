import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { resolveReviewedMainMerge } from './github-merge-approval.mjs'
import { RELEASE_SECRET_NAMES, readReleaseCredentials, redactSensitiveText } from './production-release-credentials.mjs'
import { selectExactEasBuilds, verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { STALE_CANDIDATE_TIMEOUT_MS } from './release-control-timing.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PIPELINE_PATH = resolve(ROOT, 'scripts/harness/production-release-steps.yml')
const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
const PRODUCTION_PROJECT_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`
const REQUIRED_REVIEWER = 'kouuuuuuuuu'
const GITHUB_API = 'https://api.github.com'
const API_VERSION = '2022-11-28'
const QUALITY_JOB_NAME = 'quality, security, integration, SQL, and immutable-source gates'
export const CANARY_EXECUTION_BUDGET_MS = 80 * 60 * 1_000
export const RECOVERY_STEP_BUDGET_MS = 15 * 60 * 1_000
export const RELEASE_EXECUTION_BUDGET_MS = 90 * 60 * 1_000
const LOCAL_READ_COMMAND_TIMEOUT_MS = 60 * 1_000
const LOCAL_SUBMISSION_TIMEOUT_MS = 30 * 60 * 1_000
const LOCAL_GIT_COMMAND_TIMEOUT_MS = 10 * 1_000
const LOCAL_CLI_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024
const RELEASE_VARIABLE_NAMES = Object.freeze([
  'KAEL_AI_KILL_SWITCH',
  'KAEL_DURABLE_GUARDS_ENABLED',
  'NESTSCOUT_ANDROID_FCM_V1_READY',
  'NESTSCOUT_IOS_APNS_READY',
  'NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY',
])
const SUPABASE_TARGET_VARIABLES = Object.freeze([
  'SUPABASE_PROJECT_REF',
  'SUPABASE_PROJECT_ID',
  'STAGE1_SUPABASE_PROJECT_REF',
  'STAGING_SUPABASE_PROJECT_REF',
])
const SOURCE_SHA = /^[0-9a-f]{40}$/u

export function parseProductionReleaseArgs(args) {
  const forwarded = args[0] === '--' ? args.slice(1) : args
  const result = { execute: false, submitPlatform: null }
  const seen = new Set()
  for (let index = 0; index < forwarded.length; index += 1) {
    const arg = forwarded[index]
    if (arg === '--execute') {
      if (seen.has(arg)) throw new Error('--execute may be specified once')
      seen.add(arg)
      result.execute = true
      continue
    }
    if (arg === '--source-sha' || arg === '--submit-platform') {
      if (seen.has(arg)) throw new Error(`${arg} may be specified once`)
      seen.add(arg)
      const value = forwarded[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      if (arg === '--source-sha') result.sourceSha = value.toLowerCase()
      else {
        if (!['ios', 'android', 'all'].includes(value)) throw new Error('--submit-platform must be ios, android, or all')
        result.submitPlatform = value
      }
      continue
    }
    throw new Error(`unknown Production release argument: ${arg}`)
  }
  if (!result.sourceSha || !SOURCE_SHA.test(result.sourceSha)) throw new Error('--source-sha must be a 40-character lowercase Git SHA')
  return Object.freeze(result)
}

export function parseProductionReleasePlan(text) {
  const lines = String(text).replace(/\r\n/gu, '\n').split('\n')
  const jobEnv = parseYamlEnv(lines, 2)
  const stepsHeader = lines.findIndex((line) => indentOf(line) === 2 && /^\s*steps:\s*$/u.test(line))
  if (stepsHeader < 0) throw new Error('local Production release pipeline has no steps block')

  const steps = []
  for (let index = stepsHeader + 1; index < lines.length;) {
    const current = lines[index]
    if (!current.trim() || current.trimStart().startsWith('#')) { index += 1; continue }
    if (indentOf(current) < 4) break
    if (indentOf(current) !== 4 || !current.trimStart().startsWith('- ')) { index += 1; continue }

    const step = { name: '', id: null, condition: '', uses: '', env: {}, run: '' }
    const first = current.trimStart().slice(2)
    index += 1
    parseScalarField(first, step)
    while (index < lines.length) {
      const line = lines[index]
      if (indentOf(line) === 4 && line.trimStart().startsWith('- ')) break
      if (line.trim() && indentOf(line) < 4) break
      if (indentOf(line) === 6) {
        const match = /^\s{6}([A-Za-z0-9_-]+):(?:\s*(.*))?$/u.exec(line)
        if (match) {
          const [, field, raw = ''] = match
          index += 1
          if (field === 'env' && raw === '') {
            const parsed = parseYamlEnv(lines, 6, index - 1)
            step.env = parsed.values
            index = parsed.nextIndex
            continue
          }
          if (field === 'run' && ['|', '|-', '|+', '>', '>-', '>+'].includes(raw.trim())) {
            const bodyStart = index
            let bodyEnd = index
            while (bodyEnd < lines.length && (!lines[bodyEnd].trim() || indentOf(lines[bodyEnd]) > 6)) bodyEnd += 1
            const body = lines.slice(bodyStart, bodyEnd)
            const bodyIndent = Math.min(...body.filter((item) => item.trim()).map(indentOf), 8)
            step.run = body.map((item) => item.trim() ? item.slice(bodyIndent) : '').join('\n')
            if (raw.trim().startsWith('>')) step.run = step.run.replace(/\n+/gu, ' ')
            index = bodyEnd
            continue
          }
          step[field === 'if' ? 'condition' : field === 'uses' ? 'uses' : field] = unquoteYamlScalar(raw)
          continue
        }
      }
      index += 1
    }
    if (!step.name) step.name = step.run ? step.run.split(/\s+/u).slice(0, 4).join(' ') : step.uses || 'unnamed step'
    steps.push(Object.freeze({ ...step, env: Object.freeze(step.env) }))
  }
  if (steps.length === 0) throw new Error('local Production release pipeline has no executable steps')
  return Object.freeze({ jobEnv: Object.freeze(jobEnv.values), steps: Object.freeze(steps) })
}

function parseYamlEnv(lines, headerIndent, start = 0) {
  const values = {}
  let header = -1
  for (let index = start; index < lines.length; index += 1) {
    if (indentOf(lines[index]) === headerIndent && /^\s*env:\s*$/u.test(lines[index])) { header = index; break }
    if (index > start && indentOf(lines[index]) < headerIndent) break
  }
  if (header < 0) return { values, nextIndex: start }
  let index = header + 1
  while (index < lines.length && (!lines[index].trim() || indentOf(lines[index]) > headerIndent)) {
    const line = lines[index]
    const field = new RegExp(`^\\s{${headerIndent + 2}}([A-Z][A-Z0-9_]*):\\s*(.*)$`, 'u').exec(line)
    if (field) values[field[1]] = unquoteYamlScalar(field[2])
    index += 1
  }
  return { values, nextIndex: index }
}

function parseScalarField(first, step) {
  const field = /^(name|id|if|uses|run):\s*(.*)$/u.exec(first)
  if (!field) return
  const [, name, raw] = field
  if (name === 'name') step.name = unquoteYamlScalar(raw)
  else if (name === 'id') step.id = unquoteYamlScalar(raw)
  else if (name === 'if') step.condition = unquoteYamlScalar(raw)
  else if (name === 'uses') step.uses = unquoteYamlScalar(raw)
  else step.run = unquoteYamlScalar(raw)
}

function unquoteYamlScalar(value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function indentOf(line) {
  return String(line).length - String(line).trimStart().length
}

export function evaluateProductionPreflight(input) {
  const gates = []
  const add = (id, pass, detail, status = pass ? 'PASS' : 'BLOCKED') => gates.push({ id, status, detail })
  const sourceSha = String(input?.sourceSha ?? '').toLowerCase()
  add('source-sha-format', SOURCE_SHA.test(sourceSha), SOURCE_SHA.test(sourceSha) ? sourceSha : 'a valid 40-character source SHA is required')

  const git = input?.git ?? {}
  add('main-branch', git.branch === 'main', git.branch ? `local branch is ${git.branch}` : 'local branch could not be read')
  add('exact-clean-source', git.headSha === sourceSha && git.dirty === false,
    git.headSha === sourceSha && git.dirty === false ? 'clean local HEAD matches the requested source SHA' : 'main must be clean and HEAD must equal --source-sha')
  add('remote-main', git.remoteMainSha === sourceSha,
    git.remoteMainSha === sourceSha ? 'GitHub main matches the requested source SHA' : 'GitHub main is not at the requested source SHA')

  add('reviewed-merge', input?.review?.status === 'PASS', input?.review?.detail ?? 'current approval by the configured independent reviewer is unverified')
  add('exact-sha-ci', input?.ci?.status === 'PASS', input?.ci?.detail ?? 'successful main quality run for the exact SHA is unverified')
  add('production-project', input?.projectRef === PRODUCTION_PROJECT_REF,
    input?.projectRef === PRODUCTION_PROJECT_REF ? `fixed Production project ${PRODUCTION_PROJECT_REF}` : 'resolved Supabase project ref does not match the locked Production project')

  const credentials = input?.credentials ?? { values: {}, missing: RELEASE_SECRET_NAMES }
  const secretValues = credentials.values ?? {}
  const secureStore = ['windows-credential-manager', 'linux-secret-service'].includes(credentials.store)
  const missingCredentials = [...new Set([
    ...(!secureStore ? ['SECURE_CREDENTIAL_STORE'] : []),
    ...RELEASE_SECRET_NAMES.filter((name) => typeof secretValues[name] !== 'string' || secretValues[name].length === 0),
    ...(input?.githubToken ? [] : ['GITHUB_CLI_AUTH']),
  ])]
  add('secure-credentials', missingCredentials.length === 0,
    missingCredentials.length === 0 ? `required values loaded from ${credentials.store ?? 'the OS credential store'}` : `missing credential names: ${missingCredentials.join(', ')}`)

  const variables = input?.variables ?? {}
  const missingVariables = RELEASE_VARIABLE_NAMES.filter((name) => typeof variables[name] !== 'string' || variables[name].length === 0)
  const requiredTrueVariables = RELEASE_VARIABLE_NAMES.filter((name) => name.endsWith('_READY') || name === 'KAEL_DURABLE_GUARDS_ENABLED')
  const falseReadinessVariables = requiredTrueVariables.filter((name) => variables[name] !== 'true')
  const killSwitchEnabled = variables.KAEL_AI_KILL_SWITCH === 'true'
  add('release-configuration', missingVariables.length === 0 && falseReadinessVariables.length === 0 && !killSwitchEnabled,
    missingVariables.length ? `missing configuration names: ${missingVariables.join(', ')}` : falseReadinessVariables.length ? `readiness must be true: ${falseReadinessVariables.join(', ')}` : killSwitchEnabled ? 'KAEL_AI_KILL_SWITCH is enabled' : 'release flags are present and required readiness flags are enabled')

  const targetConflicts = Object.entries(input?.supabaseTargetVariables ?? {})
    .filter(([, value]) => value && value.trim().toLowerCase() !== PRODUCTION_PROJECT_REF)
    .map(([name]) => name)
  add('supabase-target-lock', targetConflicts.length === 0,
    targetConflicts.length ? `conflicting target environment names: ${targetConflicts.join(', ')}` : `all configured Supabase targets resolve to ${PRODUCTION_PROJECT_REF}`)

  const scopedPat = typeof secretValues.SUPABASE_ACCESS_TOKEN === 'string' && secretValues.SUPABASE_ACCESS_TOKEN.startsWith('sbp_fc')
  add('scoped-pat-format', scopedPat,
    scopedPat ? 'Supabase credential uses the scoped PAT format; its exact resource permissions must match the runbook' : 'SUPABASE_ACCESS_TOKEN must be a scoped Supabase PAT, not a legacy account-wide token')

  const candidate = input?.candidate
  const candidateKnown = candidate?.status === 'read' && typeof candidate.hasCandidate === 'boolean'
  add('no-active-candidate', candidateKnown && candidate.hasCandidate === false,
    !candidateKnown ? 'Production release-control state is unreadable' : candidate.hasCandidate ? 'an active or unresolved Production candidate already exists' : 'no active or unresolved Production candidate exists')

  const scopeChecks = input?.supabaseScopes ?? {}
  add('supabase-pat-production-read', scopeChecks.functions === true && scopeChecks.secrets === true,
    scopeChecks.functions === true && scopeChecks.secrets === true ? 'PAT can read Edge Functions and Edge Function Secrets on the locked Production project' : 'PAT read access to the locked Production Edge Functions and Edge Function Secrets is unverified')

  add('expo-project', input?.expoProject?.status === 'PASS', input?.expoProject?.detail ?? 'EAS authentication or exact project identity is unverified')

  const blocked = gates.some((gate) => gate.status === 'BLOCKED')
  return Object.freeze({
    schema: 'production-release-preflight/v1',
    status: blocked ? 'BLOCKED' : 'PASS',
    sourceSha,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    review: input?.review?.status ?? 'UNVERIFIED',
    ci: input?.ci?.status ?? 'UNVERIFIED',
    credentialStore: credentials.store ?? 'unavailable',
    missingCredentials,
    gates: Object.freeze(gates.map(Object.freeze)),
  })
}

export async function runProductionRelease(options, adapters) {
  const preflight = await adapters.preflight(options.sourceSha)
  const result = { preflight, executed: false, pipeline: null, submissions: [] }
  if (preflight.status !== 'PASS' || !options.execute) return Object.freeze(result)
  if (typeof adapters.runPipeline !== 'function') throw new Error('Production release execution adapter is unavailable')

  result.executed = true
  result.pipeline = await adapters.runPipeline({ sourceSha: options.sourceSha })
  if (result.pipeline?.status === 'PASS' && options.submitPlatform) {
    const platforms = options.submitPlatform === 'all' ? ['ios', 'android'] : [options.submitPlatform]
    for (const platform of platforms) {
      try {
        result.submissions.push(await adapters.submitBuild({
          platform, sourceSha: options.sourceSha, artifactDirectory: result.pipeline.artifactDirectory,
        }))
      } catch (error) {
        result.submissions.push({ platform, status: 'FAILED', detail: safeErrorMessage(error) })
      }
    }
    await adapters.recordSubmissions?.(result.pipeline, result.submissions)
  }
  return Object.freeze({ ...result, submissions: Object.freeze(result.submissions) })
}

export function productionReleaseExitCode(result) {
  if (result.preflight.status !== 'PASS') return 2
  if (result.pipeline?.status === 'FAILED' || result.submissions.some((submission) => submission.status !== 'PASS')) return 1
  return 0
}

export async function executeProductionReleaseSteps(steps, executeStep) {
  let failed = false
  let configuredAttempted = false
  let rollbackFailed = false
  const outcomes = []
  for (const step of steps) {
    if (step.condition && !shouldRunStep(step.condition, { failed, configuredAttempted })) {
      outcomes.push({ name: step.name, status: 'SKIPPED' })
      continue
    }
    if (step.uses || !step.run) {
      outcomes.push({ name: step.name, status: 'SKIPPED_LOCAL_ACTION' })
      continue
    }
    if (failed && !step.condition?.includes('failure()')) {
      outcomes.push({ name: step.name, status: 'SKIPPED_AFTER_FAILURE' })
      continue
    }
    if (step.id === 'configure') configuredAttempted = true
    let passed = false
    try { passed = await executeStep(step) === true } catch { passed = false }
    outcomes.push({ name: step.name, status: passed ? 'PASS' : 'FAILED' })
    if (!passed) {
      failed = true
      if (step.condition?.includes('failure()')) rollbackFailed = true
    }
  }
  const rollbackSteps = outcomes.filter((outcome) => {
    const step = steps.find((candidate) => candidate.name === outcome.name)
    return step?.condition?.includes('failure()')
  })
  const rollback = !failed ? 'NOT_REQUIRED'
    : !configuredAttempted ? 'NOT_REQUIRED_PRECANARY'
      : rollbackFailed || rollbackSteps.length === 0 || rollbackSteps.some((outcome) => outcome.status !== 'PASS') ? 'UNPROVEN'
        : 'PROVEN'
  return Object.freeze({
    status: failed ? 'FAILED' : 'PASS',
    rollback,
    steps: Object.freeze(outcomes.map(Object.freeze)),
  })
}

export function productionReleaseStepTimeoutMs(step, { releaseDeadline = null, canaryDeadline = null, now = Date.now() } = {}) {
  if (step?.condition?.includes('failure()')) return RECOVERY_STEP_BUDGET_MS
  const deadlines = [releaseDeadline, canaryDeadline].filter(Number.isFinite)
  if (deadlines.length === 0) return undefined
  return Math.max(0, Math.min(...deadlines) - now)
}

export function assertAttestedSubmissionBuild({ release, builds, attestation, platform, sourceSha }) {
  if (!['ios', 'android'].includes(platform)) throw new Error('submission platform is invalid')
  if (release?.gitSha !== sourceSha) throw new Error('release SHA does not match the requested submission source')
  const attestationProblems = verifyMobileBinaryAttestation(attestation, release)
  if (attestationProblems.length > 0) throw new Error('mobile binary attestation is invalid')
  if (attestation.gitSha !== sourceSha || attestation.binaryRelation === 'active_production') {
    throw new Error('submission requires an exact-source mobile binary attestation')
  }
  const selected = selectExactEasBuilds(release, builds)[platform]
  const attested = attestation.platforms?.[platform]
  if (!selected || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(selected.id ?? '') ||
      selected.gitCommitHash !== sourceSha || selected.id?.toLowerCase() !== attested?.easBuildId?.toLowerCase() ||
      String(selected.appBuildVersion ?? '') !== String(attested?.buildNumber ?? '') || selected.appVersion !== attested.appVersion ||
      selected.applicationIdentifier !== attested.applicationId) {
    throw new Error(`attested ${platform} build does not match the exact source, project, version, and build number`)
  }
  return selected
}

export function buildAttestedEasSubmissionArgs(platform, buildId) {
  if (!['ios', 'android'].includes(platform) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(buildId ?? '')) {
    throw new Error('attested EAS submission identity is invalid')
  }
  return Object.freeze([
    '--dir', 'apps/mobile', 'dlx', 'eas-cli@22.0.0', 'submit',
    '--platform', platform, '--id', buildId, '--non-interactive', '--wait',
  ])
}

export function createLocalAdapters() {
  return {
    preflight: localPreflight,
    runPipeline: executeLocalPipeline,
    submitBuild: submitAttestedBuild,
    recordSubmissions: recordSubmissionEvidence,
  }
}

async function localPreflight(sourceSha) {
  const git = readGitIdentity()
  const credentialState = readReleaseCredentials()
  const githubToken = readGitHubCliToken()
  const repository = gitHubRepository()
  const review = { status: 'BLOCKED', detail: 'GitHub approval could not be verified' }
  const ci = { status: 'BLOCKED', detail: 'exact-SHA CI could not be verified' }
  let remoteMainSha = null

  if (githubToken && repository) {
    try {
      const main = await githubJson(`${GITHUB_API}/repos/${repository}/commits/main`, githubToken)
      remoteMainSha = main.sha ?? null
      const receipt = await resolveReviewedMainMerge({
        repository,
        mergeCommitSha: sourceSha,
        requiredReviewer: REQUIRED_REVIEWER,
        token: githubToken,
      })
      review.status = receipt.mergeCommitSha === sourceSha ? 'PASS' : 'BLOCKED'
      review.detail = review.status === 'PASS' ? `merged PR #${receipt.pullRequest.number} has current approval by ${REQUIRED_REVIEWER}` : 'review approval did not bind the requested source SHA'
      const ciResult = await verifyExactMainQualityRun(repository, sourceSha, githubToken)
      ci.status = ciResult.status
      ci.detail = ciResult.detail
    } catch (error) {
      review.detail = safeErrorMessage(error)
      ci.detail = safeErrorMessage(error)
    }
  } else {
    review.detail = 'GitHub CLI authentication or a github.com origin is unavailable'
    ci.detail = 'GitHub CLI authentication or a github.com origin is unavailable'
  }
  git.remoteMainSha = remoteMainSha

  const pipeline = parseProductionReleasePlan(readFileSync(PIPELINE_PATH, 'utf8'))
  const projectRef = pipeline.jobEnv.PRODUCTION_PROJECT_REF ?? null
  const variables = Object.fromEntries(RELEASE_VARIABLE_NAMES.map((name) => [name, process.env[name] ?? '']))
  const targetVariables = Object.fromEntries(SUPABASE_TARGET_VARIABLES.map((name) => [name, process.env[name] ?? '']))
  const secrets = credentialState.values
  const targetIsLocked = readProductionTargetLock() === PRODUCTION_PROJECT_REF && projectRef === PRODUCTION_PROJECT_REF
  const readTarget = targetIsLocked && secrets.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
    ? await readCandidateState(secrets.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY)
    : { status: 'unreadable', hasCandidate: null }
  const supabaseScopes = secrets.SUPABASE_ACCESS_TOKEN
    ? await checkSupabaseReadScopes(secrets.SUPABASE_ACCESS_TOKEN)
    : { functions: false, secrets: false }
  const expoProject = secrets.EXPO_TOKEN
    ? await checkExpoProject(secrets.EXPO_TOKEN)
    : { status: 'BLOCKED', detail: 'EXPO_TOKEN is missing from the OS credential store' }
  const preflight = evaluateProductionPreflight({
    sourceSha,
    git,
    review,
    ci,
    projectRef: targetIsLocked ? projectRef : 'unlocked-or-mismatched',
    credentials: credentialState,
    githubToken,
    variables,
    supabaseTargetVariables: targetVariables,
    candidate: readTarget,
    supabaseScopes,
    expoProject,
  })
  return Object.freeze({ ...preflight, githubRepository: repository ?? 'unavailable' })
}

function readGitIdentity() {
  const branch = gitOutput(['branch', '--show-current'])
  const headSha = gitOutput(['rev-parse', 'HEAD']).toLowerCase()
  const remoteMainSha = gitOutput(['rev-parse', 'refs/remotes/origin/main']).toLowerCase()
  const dirty = gitOutput(['status', '--porcelain=v1', '--untracked-files=all']).length > 0
  return { branch, headSha, remoteMainSha, dirty }
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: LOCAL_GIT_COMMAND_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.error || result.status !== 0) return ''
  return result.stdout.trim()
}

function gitHubRepository() {
  const remote = gitOutput(['config', '--get', 'remote.origin.url'])
  const match = /(?:github\.com[:/])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/iu.exec(remote)
  return match?.[1] ?? null
}

function readGitHubCliToken() {
  const result = spawnSync('gh', ['auth', 'token'], { cwd: ROOT, encoding: 'utf8', timeout: LOCAL_GIT_COMMAND_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] })
  if (result.error || result.status !== 0) return null
  const value = result.stdout.trim()
  return value.length >= 20 ? value : null
}

async function verifyExactMainQualityRun(repository, sourceSha, token) {
  const url = `${GITHUB_API}/repos/${repository}/actions/workflows/release-production.yml/runs?head_sha=${sourceSha}&event=push&per_page=100`
  const payload = await githubJson(url, token)
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : []
  const run = runs.filter((item) => item?.head_sha === sourceSha && item?.head_branch === 'main' && item?.event === 'push')
    .sort((left, right) => Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? ''))[0]
  if (!run) return { status: 'BLOCKED', detail: 'no release-production.yml push run exists for this exact SHA on main' }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    return { status: 'BLOCKED', detail: `exact-SHA quality workflow is ${run.status}/${run.conclusion ?? 'pending'}` }
  }
  const jobs = await githubJson(`${GITHUB_API}/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`, token)
  const quality = (jobs.jobs ?? []).find((job) => job.name === QUALITY_JOB_NAME)
  if (quality?.status !== 'completed' || quality?.conclusion !== 'success') {
    return { status: 'BLOCKED', detail: 'exact-SHA main quality job is missing or not successful' }
  }
  return { status: 'PASS', detail: `quality run ${run.id} succeeded for ${sourceSha}` }
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': API_VERSION },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`GitHub release gate returned HTTP ${response.status}`)
  return response.json()
}

function readProductionTargetLock() {
  const wrapper = readFileSync(resolve(ROOT, 'scripts/run-supabase.ps1'), 'utf8')
  const match = /^\$ProductionProjectRef\s*=\s*"([a-z0-9]+)"\s*$/mu.exec(wrapper)
  return match?.[1]?.toLowerCase() ?? null
}

async function checkSupabaseReadScopes(token) {
  const sharedEnv = { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF }
  const [functions, secrets] = await Promise.all([
    runPnpm(['supabase', '--', 'functions', 'list', '--project-ref', PRODUCTION_PROJECT_REF], sharedEnv),
    runPnpm(['supabase', '--', 'secrets', 'list', '--project-ref', PRODUCTION_PROJECT_REF], sharedEnv),
  ])
  return { functions: functions.status === 0, secrets: secrets.status === 0 }
}

async function checkExpoProject(token) {
  const result = await runPnpm(['--dir', 'apps/mobile', 'dlx', 'eas-cli@22.0.0', 'project:info'], { EXPO_TOKEN: token })
  const exactIdentity = result.status === 0 && result.output.includes('@nestscout/home-services') &&
    result.output.includes('c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b')
  return {
    status: exactIdentity ? 'PASS' : 'BLOCKED',
    detail: exactIdentity ? 'EAS credentials resolve to the registered NestScout project' : 'EAS credentials or project identity do not match the registered NestScout project',
  }
}

async function readCandidateState(serviceRoleKey) {
  const result = await runNodeTool('scripts/harness/release-control.mjs', [
    '--action', 'read', '--environment', 'production', '--project-ref', PRODUCTION_PROJECT_REF,
  ], { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey })
  if (result.status !== 0) return { status: 'unreadable', hasCandidate: null }
  try {
    const snapshot = JSON.parse(result.stdout.trim())
    const state = snapshot.result
    if (!state || !Object.hasOwn(state, 'candidate_release_id')) return { status: 'unreadable', hasCandidate: null }
    return { status: 'read', hasCandidate: Boolean(state.candidate_release_id || state.candidate_cohort_id) }
  } catch {
    return { status: 'unreadable', hasCandidate: null }
  }
}

async function executeLocalPipeline({ sourceSha }) {
  const plan = parseProductionReleasePlan(readFileSync(PIPELINE_PATH, 'utf8'))
  const secrets = readReleaseCredentials().values
  const secretsForRedaction = Object.values(secrets)
  const runId = `${Math.floor(Date.now() / 1000)}${String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')}`
  const attempt = '1'
  const artifactRoot = `artifacts/production-release-${runId}`
  const tempRoot = resolve(process.env.TEMP || process.env.TMP || process.env.TMPDIR || '/tmp', `nestscout-production-release-${runId}`)
  mkdirSync(tempRoot, { recursive: true, mode: 0o700 })
  const envFile = resolve(tempRoot, 'github-env')
  writeFileSync(envFile, '', { flag: 'wx' })
  const variables = Object.fromEntries(RELEASE_VARIABLE_NAMES.map((name) => [name, process.env[name] ?? '']))
  let githubEnv = {
    ...releaseProcessEnvironment(),
    ...Object.fromEntries(Object.entries(plan.jobEnv).map(([name, value]) => [name, unquoteYamlScalar(value)])),
    GITHUB_WORKSPACE: toBashPath(ROOT),
    GITHUB_SHA: sourceSha,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_ENV: toBashPath(envFile),
    RUNNER_TEMP: toBashPath(tempRoot),
    TMPDIR: toBashPath(tempRoot),
    TEMP: tempRoot,
    TMP: tempRoot,
    ARTIFACT_ROOT: artifactRoot,
    ...variables,
  }
  githubEnv.PRODUCTION_PROJECT_REF = PRODUCTION_PROJECT_REF
  githubEnv.PRODUCTION_PROJECT_URL = PRODUCTION_PROJECT_URL
  githubEnv.SUPABASE_PROJECT_REF = PRODUCTION_PROJECT_REF

  const shell = findBash()
  const log = []
  let canaryDeadline = null

  try {
    const releaseDeadline = Date.now() + RELEASE_EXECUTION_BUDGET_MS
    const execution = await executeProductionReleaseSteps(plan.steps, async (step) => {
      process.stdout.write(`Release step: ${step.name}\n`)
      if (step.id === 'configure' && canaryDeadline === null) canaryDeadline = Date.now() + CANARY_EXECUTION_BUDGET_MS
      const recoveryStep = step.condition?.includes('failure()') === true
      const timeoutMs = productionReleaseStepTimeoutMs(step, { releaseDeadline, canaryDeadline })
      const activeDeadline = canaryDeadline === null ? releaseDeadline : Math.min(releaseDeadline, canaryDeadline)
      if (!recoveryStep && Date.now() >= activeDeadline) {
        const reason = canaryDeadline !== null && canaryDeadline <= releaseDeadline
          ? 'RELEASE_CANARY_BUDGET_EXCEEDED' : 'RELEASE_EXECUTION_BUDGET_EXCEEDED'
        log.push(`## ${step.name}\n${reason}`)
        process.stderr.write(`Release step failed: ${step.name}\n${reason}\n`)
        return false
      }
      if (timeoutMs === 0 && !recoveryStep) {
        const reason = canaryDeadline !== null && canaryDeadline <= releaseDeadline
          ? 'RELEASE_CANARY_BUDGET_EXCEEDED' : 'RELEASE_EXECUTION_BUDGET_EXCEEDED'
        log.push(`## ${step.name}\n${reason}`)
        process.stderr.write(`Release step failed: ${step.name}\n${reason}\n`)
        return false
      }
      const stepEnv = resolveStepEnv(step.env, githubEnv, secrets)
      const script = step.run.replaceAll('artifacts/', `${artifactRoot}/`)
      const execution = await runBashStep(shell, script, { ...githubEnv, ...stepEnv }, timeoutMs)
      const visibleOutput = redactSensitiveText(execution.output, secretsForRedaction)
      readFileSync(envFile, 'utf8').split(/\r?\n/u).filter(Boolean).forEach((entry) => {
        const separator = entry.indexOf('=')
        if (separator <= 0) return
        const name = entry.slice(0, separator)
        const value = entry.slice(separator + 1)
        if (secretsForRedaction.some((secret) => value.includes(secret))) throw new Error('pipeline attempted to place a credential in GITHUB_ENV')
        githubEnv[name] = value
      })
      writeFileSync(envFile, '', 'utf8')
      if (execution.status !== 0) {
        const tail = sanitizeReleaseLog(visibleOutput.split(/\r?\n/u).slice(-80).join('\n'), secretsForRedaction)
        if (tail.trim()) log.push(`## ${step.name}\n${tail}`)
        process.stderr.write(`Release step failed: ${step.name}\n${tail}\n`)
      }
      return execution.status === 0
    })
    const pipelineStatus = execution.status
    const artifactDirectory = resolve(ROOT, artifactRoot)
    const summary = Object.freeze({
      schema: 'production-release-runner-result/v1',
      status: pipelineStatus,
      sourceSha,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      runId,
      artifactDirectory: relativeRoot(artifactDirectory),
      releaseId: githubEnv.RELEASE_ID ?? null,
      cohortId: githubEnv.COHORT_ID ?? null,
      rollback: execution.rollback,
      steps: execution.steps,
    })
    saveExecutedEvidence(summary, log.join('\n\n'), secretsForRedaction, artifactDirectory)
    return summary
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

export function resolveStepEnv(environment, parent, secrets = {}) {
  const result = {}
  for (const [name, rawValue] of Object.entries(environment)) {
    const secret = /^\$\{\{\s*secrets\.([A-Z][A-Z0-9_]*)\s*\}\}$/u.exec(rawValue)
    const variable = /^\$\{\{\s*vars\.([A-Z][A-Z0-9_]*)\s*\}\}$/u.exec(rawValue)
    if (secret) result[name] = secrets[secret[1]] ?? ''
    else if (variable) result[name] = parent[variable[1]] ?? ''
    else result[name] = unquoteYamlScalar(rawValue)
  }
  return result
}

function shouldRunStep(condition, state) {
  if (condition.includes('failure()') || condition.includes('cancelled()')) return state.failed && state.configuredAttempted
  if (condition.includes('always()')) return true
  return false
}

function findBash() {
  if (process.platform !== 'win32') return 'bash'
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean)
  for (const base of roots) {
    const candidate = resolve(base, 'Git/bin/bash.exe')
    if (existsSync(candidate)) return candidate
  }
  const gitPath = spawnSync('where.exe', ['git.exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout?.split(/\r?\n/u)[0]
  if (gitPath) {
    const gitRoot = resolve(dirname(gitPath), '..')
    for (const candidate of [resolve(gitRoot, 'bin/bash.exe'), resolve(gitRoot, 'usr/bin/bash.exe')]) {
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error('Git for Windows Bash is required to run the local release pipeline')
}

function toBashPath(path) {
  if (process.platform !== 'win32') return path
  const normalized = resolve(path).replaceAll('\\', '/')
  return normalized.replace(/^([A-Za-z]):/u, (_, drive) => `/${drive.toLowerCase()}`)
}

function runBashStep(shell, script, env, timeoutMs = undefined) {
  return new Promise((resolvePromise) => {
    const child = spawn(shell, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: ROOT,
      env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let tooMuchOutput = false
    let timedOut = false
    const timeout = Number.isFinite(timeoutMs) ? setTimeout(() => {
      timedOut = true
      terminateChildTree(child)
    }, timeoutMs) : null
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        if (Buffer.byteLength(output) > 16 * 1024 * 1024) {
          tooMuchOutput = true
          terminateChildTree(child)
          return
        }
        output += chunk
      })
    }
    child.on('error', () => {
      if (timeout) clearTimeout(timeout)
      resolvePromise({ status: 1, output: 'release step could not start' })
    })
    child.on('close', (status) => {
      if (timeout) clearTimeout(timeout)
      const suffix = timedOut ? '\nRELEASE_STEP_TIMEOUT' : tooMuchOutput ? '\nRELEASE_STEP_OUTPUT_LIMIT' : ''
      resolvePromise({ status: timedOut || tooMuchOutput ? 1 : (status ?? 1), output: `${output.slice(-10000)}${suffix}` })
    })
  })
}

function terminateChildTree(child) {
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.on('error', () => child.kill())
    return
  }
  try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }, 10_000).unref()
}

async function submitAttestedBuild({ platform, sourceSha, artifactDirectory }) {
  const runRoot = resolve(ROOT, artifactDirectory)
  const buildList = resolve(runRoot, 'mobile/eas-builds.json')
  if (!existsSync(buildList)) throw new Error('attested EAS build list is unavailable for submission')
  const releasePath = resolve(runRoot, 'release/release.json')
  const release = JSON.parse(readFileSync(releasePath, 'utf8'))
  const builds = JSON.parse(readFileSync(buildList, 'utf8'))
  const attestation = JSON.parse(readFileSync(resolve(runRoot, 'release/mobile-binary-attestation.json'), 'utf8'))
  const selected = assertAttestedSubmissionBuild({ release, builds, attestation, platform, sourceSha })
  const secretState = readReleaseCredentials()
  const submission = await runPnpm(buildAttestedEasSubmissionArgs(platform, selected.id), {
    EXPO_TOKEN: secretState.values.EXPO_TOKEN,
  }, LOCAL_SUBMISSION_TIMEOUT_MS)
  if (submission.status !== 0) throw new Error(`EAS ${platform} submission failed: ${sanitizeReleaseLog(submission.output, Object.values(secretState.values))}`)
  return Object.freeze({ platform, status: 'PASS', buildId: selected.id, upload: 'PASS', storeProcessing: 'UNVERIFIED', testerInstall: 'UNVERIFIED' })
}

function runNodeTool(script, args, env = {}) {
  const result = spawnSync(process.execPath, [resolve(ROOT, script), ...args], { cwd: ROOT, env: releaseProcessEnvironment(env), encoding: 'utf8', timeout: LOCAL_READ_COMMAND_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function runPnpm(args, env = {}, timeoutMs = LOCAL_READ_COMMAND_TIMEOUT_MS) {
  const windows = process.platform === 'win32'
  const command = windows ? 'powershell.exe' : 'pnpm'
  const commandArgs = windows
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(ROOT, 'scripts/harness/run-production-release-pnpm.ps1'), ...args]
    : args
  return new Promise((resolvePromise) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env: releaseProcessEnvironment(env),
      detached: !windows,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let timedOut = false
    let tooMuchOutput = false
    const timeout = setTimeout(() => {
      timedOut = true
      terminateChildTree(child)
    }, timeoutMs)
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        if (Buffer.byteLength(output) > LOCAL_CLI_OUTPUT_LIMIT_BYTES) {
          tooMuchOutput = true
          terminateChildTree(child)
          return
        }
        output += chunk
      })
    }
    child.on('error', () => {
      clearTimeout(timeout)
      resolvePromise({ status: 1, output: 'release CLI could not start' })
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const suffix = timedOut ? '\nRELEASE_COMMAND_TIMEOUT' : tooMuchOutput ? '\nRELEASE_COMMAND_OUTPUT_LIMIT' : ''
      resolvePromise({ status: timedOut || tooMuchOutput ? 1 : (status ?? 1), output: `${output.slice(-10_000)}${suffix}` })
    })
  })
}

function releaseProcessEnvironment(overrides = {}) {
  const environment = { ...process.env }
  for (const name of RELEASE_SECRET_NAMES) delete environment[name]
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_TOKEN', 'GH_TOKEN']) delete environment[name]
  return { ...environment, ...overrides }
}

function relativeRoot(path) {
  const value = resolve(path)
  if (!value.startsWith(`${ROOT}${sep}`)) throw new Error('release artifact path escapes the workspace')
  return value.slice(ROOT.length + 1).replaceAll('\\', '/')
}

function saveExecutedEvidence(summary, pipelineLog, secrets, artifactDirectory) {
  mkdirSync(artifactDirectory, { recursive: true })
  const machineReceipt = redactSensitiveText(`${JSON.stringify(summary, null, 2)}\n`, secrets)
  writeFileSync(resolve(artifactDirectory, 'runner-result.json'), machineReceipt)
  if (pipelineLog.trim()) writeFileSync(resolve(artifactDirectory, 'runner-log.redacted.txt'), sanitizeReleaseLog(pipelineLog, secrets))
  const reportDirectory = resolve(ROOT, 'docs/test-logs')
  mkdirSync(reportDirectory, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19)
  const reportPath = resolve(reportDirectory, `${timestamp}_production-release-${summary.sourceSha.slice(0, 8)}-${summary.runId}.md`)
  const report = [
    `# Production release ${summary.sourceSha.slice(0, 8)}`,
    '',
    `- Status: ${summary.status}`,
    `- Source SHA: ${summary.sourceSha}`,
    `- Project ref: ${summary.productionProjectRef}`,
    `- Release: ${summary.releaseId ?? 'not registered'}`,
    `- Cohort: ${summary.cohortId ?? 'not configured'}`,
    `- Rollback: ${summary.rollback}`,
    `- Machine evidence: ${relativeRoot(resolve(artifactDirectory, 'runner-result.json'))}`,
    '',
    '## Steps',
    '',
    ...summary.steps.map((step) => `- ${step.status}: ${step.name}`),
    '',
    '## Limits',
    '',
    '- Store processing and tester installation are separate checks and are not inferred from EAS upload output.',
    '- Device installation or runtime behavior is not claimed without device evidence.',
    '',
  ].join('\n')
  writeFileSync(reportPath, sanitizeReleaseLog(report, secrets))
  process.stdout.write(`Release evidence: ${relativeRoot(reportPath)}\n`)
}

function recordSubmissionEvidence(pipeline, submissions) {
  const runRoot = resolve(ROOT, pipeline.artifactDirectory)
  const reportDirectory = resolve(ROOT, 'docs/test-logs')
  const destination = resolve(runRoot, 'expo-submission-result.json')
  const secrets = Object.values(readReleaseCredentials().values)
  const receipt = {
    schema: 'production-release-expo-submission/v1',
    sourceSha: pipeline.sourceSha,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    submissions,
  }
  const safeReceipt = sanitizeReleaseLog(`${JSON.stringify(receipt, null, 2)}\n`, secrets)
  writeFileSync(destination, safeReceipt)
  const matchingReport = readdirSync(reportDirectory).filter((file) => file.endsWith(`-${pipeline.runId}.md`))[0]
  if (matchingReport) {
    const reportPath = resolve(reportDirectory, matchingReport)
    const suffix = [
      '',
      '## Expo submission',
      '',
      ...submissions.map((item) => `- ${item.platform}: upload ${item.upload ?? 'FAILED'}; store processing ${item.storeProcessing ?? 'UNVERIFIED'}; tester install ${item.testerInstall ?? 'UNVERIFIED'}`),
      '',
    ].join('\n')
    appendFileSync(reportPath, sanitizeReleaseLog(suffix, secrets))
  }
}

function sanitizeReleaseLog(text, secrets) {
  return redactSensitiveText(String(text)
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/giu, '$1?[REDACTED_QUERY]')
    .replace(/(\b(?:email|password|secret|token)\s*[=:]\s*)[^\s,;]+/giu, '$1[REDACTED]'), secrets)
}

function safeErrorMessage(error) {
  return error instanceof Error ? redactSensitiveText(error.message) : 'Production preflight could not be verified'
}

async function localMain() {
  if (process.argv.includes('--set-credential')) {
    const index = process.argv.indexOf('--set-credential')
    const name = process.argv[index + 1]
    if (!RELEASE_SECRET_NAMES.includes(name)) throw new Error('--set-credential requires an allow-listed credential name')
    const { setReleaseCredential } = await import('./production-release-credentials.mjs')
    process.stdout.write(`${setReleaseCredential(name)}\n`)
    return
  }

  const args = parseProductionReleaseArgs(process.argv.slice(2))
  const result = await runProductionRelease(args, createLocalAdapters())
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = productionReleaseExitCode(result)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  localMain().catch((error) => {
    process.stderr.write(`production release runner failed: ${safeErrorMessage(error)}\n`)
    process.exitCode = 1
  })
}
