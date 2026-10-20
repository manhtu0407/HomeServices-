import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compareDeploymentState } from './deployment-drift.mjs'
import { buildHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// A snapshot counts as deployment evidence only when collectHostedDeploymentState produced it from the
// Supabase Management API and read-only SQL. Any other file is a claim, not evidence.
export const HOSTED_EVIDENCE_SOURCE = 'hosted-api-and-readonly-sql'
export const PARITY_STATES = Object.freeze(['VERIFIED_MATCH', 'VERIFIED_DRIFT', 'UNVERIFIED'])

const DEFAULT_SOURCE_PATHS = Object.freeze([
  'supabase/functions/mobile-api/_shared/domains/kael-chat/case-question.service.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/turn-intent-router.ts',
  'supabase/functions/mobile-api/_shared/domains/customer/assistant.ts',
  'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant.ts',
  'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-policy.ts',
  'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-turn-context.ts',
  'supabase/functions/mobile-api/_shared/kael/kael-guardrails/permission-gate.ts',
])

const verified = (component, value, source, note) => ({ component, value, status: 'VERIFIED', source, ...(note ? { note } : {}) })
const unknown = (component, source, note) => ({ component, value: null, status: 'UNKNOWN', source, note })

function hostedEvidenceProblem(remote) {
  if (!remote || typeof remote !== 'object') return 'no hosted deployment snapshot was supplied'
  if (remote.evidenceSource !== HOSTED_EVIDENCE_SOURCE) {
    return `snapshot evidenceSource is not ${HOSTED_EVIDENCE_SOURCE}; it was not collected by collectHostedDeploymentState`
  }
  if (!remote.releaseId || !remote.deploymentId) {
    return 'hosted snapshot carries no release or deployment identity, so there is nothing to compare'
  }
  if (!remote.managedEdgeFunctions || typeof remote.managedEdgeFunctions !== 'object') {
    return 'hosted snapshot carries no managed Edge function evidence'
  }
  return null
}

export function classifyParity({ expectedRelease, inventory, remote }) {
  const untrusted = hostedEvidenceProblem(remote)
  if (untrusted) return { state: 'UNVERIFIED', reasons: [untrusted], problems: [] }
  if (!expectedRelease) {
    return { state: 'UNVERIFIED', reasons: ['the expected release for this checkout could not be computed offline'], problems: [] }
  }
  const report = compareDeploymentState({ release: expectedRelease, inventory, remote })
  return report.ok
    ? { state: 'VERIFIED_MATCH', reasons: [], problems: [] }
    : { state: 'VERIFIED_DRIFT', reasons: [], problems: report.problems }
}

function repositoryRows(local) {
  return [
    verified('repository_head_sha', local.headSha, 'git rev-parse HEAD'),
    verified('worktree_state', local.worktreeDirty ? 'dirty' : 'clean', 'git status --porcelain=v1',
      local.worktreeDirty ? 'expected_release_id below describes the working tree, not the commit' : undefined),
    local.originMainSha
      ? verified('github_main_ref', local.originMainSha, 'git rev-parse origin/main',
        'a local remote-tracking ref that may be stale; it is not evidence of what is deployed')
      : unknown('github_main_ref', 'git rev-parse origin/main', 'no origin/main ref in this checkout'),
    local.sourceChange
      ? verified('source_change_commit', local.sourceChange.sha, `git log -1 -- ${local.sourceChange.paths.length} paths`,
        local.sourceChange.paths.join(', '))
      : unknown('source_change_commit', 'git log -1 -- <paths>', 'no commit touches the listed paths in this checkout'),
    local.ci
      ? verified('ci_build_id', local.ci.runId, 'GITHUB_RUN_ID', `workflow ${local.ci.workflow ?? 'unknown'}, sha ${local.ci.sha ?? 'unknown'}`)
      : unknown('ci_build_id', 'GITHUB_RUN_ID', 'not running inside CI; the build that produced the deployed artifact needs the GitHub Actions run record'),
  ]
}

function expectedRows(expectedRelease, expectedError) {
  if (!expectedRelease) {
    return ['expected_release_id', 'expected_edge_bundle_sha256'].map((component) =>
      unknown(component, 'scripts/harness/release-bundle.mjs buildHarnessRelease', expectedError ?? 'not computed'))
  }
  const source = 'scripts/harness/release-bundle.mjs buildHarnessRelease (offline, production environment)'
  return [
    verified('expected_release_id', expectedRelease.releaseId, source),
    verified('expected_edge_bundle_sha256', expectedRelease.edgeBundleSha256, source),
  ]
}

function mobileRows(mobilePolicy, remote) {
  const rows = []
  rows.push(mobilePolicy
    ? verified('mobile_app_version_declared', mobilePolicy.appVersion, 'apps/mobile/config/release-client-policy.json',
      `ios build ${mobilePolicy.platforms.ios.buildNumber}, android build ${mobilePolicy.platforms.android.buildNumber}; declared in source, not proof of what is installed`)
    : unknown('mobile_app_version_declared', 'apps/mobile/config/release-client-policy.json', 'file unreadable'))
  const enforced = remote?.clientCompatibility
  rows.push(enforced && remote.evidenceSource === HOSTED_EVIDENCE_SOURCE
    ? verified('edge_enforced_minimum_client',
      `ios>=${enforced.ios?.minimumBuildNumber ?? 'unknown'}, android>=${enforced.android?.minimumBuildNumber ?? 'unknown'}`,
      'hosted snapshot clientCompatibility', 'the oldest client Edge still accepts, not the client a given customer runs')
    : unknown('edge_enforced_minimum_client', 'hosted snapshot clientCompatibility', 'needs an authorized hosted snapshot'))
  rows.push(unknown('mobile_binary_in_field', 'turn_trace.client_* on a persisted reply turn, or x-client-* request headers',
    'no offline source can say which binary a customer runs; the trace added with this change is the first persisted record'))
  return rows
}

function deployedRows(remote, untrustedReason) {
  const names = ['edge_release_id_deployed', 'edge_deployment_id', 'edge_mobile_api_version', 'edge_bundle_sha256_deployed', 'runtime_flags_provider_route']
  if (untrustedReason) {
    return names.map((component) => unknown(component, 'pnpm harness:release:hosted-state (authorized operator)', untrustedReason))
  }
  const mobileApi = remote.managedEdgeFunctions['mobile-api']
  const source = `hosted snapshot (${remote.evidenceSource})`
  const readiness = remote.providerReadiness && typeof remote.providerReadiness === 'object'
    ? Object.entries(remote.providerReadiness).map(([key, value]) => `${key}=${value === true}`).join(' ')
    : null
  return [
    verified('edge_release_id_deployed', remote.releaseId, source),
    verified('edge_deployment_id', remote.deploymentId, source),
    mobileApi && Number.isInteger(mobileApi.version)
      ? verified('edge_mobile_api_version', String(mobileApi.version), source)
      : unknown('edge_mobile_api_version', source, 'mobile-api absent from the managed function list'),
    remote.edgeBundleSha256
      ? verified('edge_bundle_sha256_deployed', remote.edgeBundleSha256, source)
      : unknown('edge_bundle_sha256_deployed', source, 'digest missing from the snapshot'),
    readiness
      ? verified('runtime_flags_provider_route', readiness, source, `lane ${remote.releaseLane ?? 'none'}; booleans only, no keys or secrets`)
      : unknown('runtime_flags_provider_route', source, 'provider readiness missing from the snapshot'),
  ]
}

export function buildProvenanceMatrix(input) {
  const untrustedReason = hostedEvidenceProblem(input.remote)
  const parity = classifyParity({
    expectedRelease: input.expectedRelease ?? null,
    inventory: input.inventory,
    remote: input.remote ?? null,
  })
  return {
    parity,
    rows: [
      ...repositoryRows(input.local),
      ...expectedRows(input.expectedRelease ?? null, input.expectedError),
      ...mobileRows(input.mobilePolicy ?? null, untrustedReason ? null : input.remote),
      ...deployedRows(input.remote ?? null, untrustedReason),
    ],
  }
}

export function renderProvenanceMarkdown(matrix) {
  const lines = ['| component | status | value | source |', '|---|---|---|---|']
  for (const row of matrix.rows) {
    lines.push(`| ${row.component} | ${row.status} | ${row.value ?? 'UNKNOWN'} | ${row.source}${row.note ? ` — ${row.note}` : ''} |`)
  }
  lines.push('', `Deployment parity: **${matrix.parity.state}**`)
  for (const reason of matrix.parity.reasons) lines.push(`- ${reason}`)
  for (const problem of matrix.parity.problems) lines.push(`- ${problem}`)
  return `${lines.join('\n')}\n`
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function gitOrNull(root, args) {
  try {
    return git(root, args) || null
  } catch {
    return null
  }
}

export function collectLocalInputs(root = ROOT, options = {}) {
  const paths = options.paths ?? DEFAULT_SOURCE_PATHS
  const sourceSha = gitOrNull(root, ['log', '-1', '--format=%H', '--', ...paths])
  const env = options.env ?? process.env
  const local = {
    headSha: git(root, ['rev-parse', 'HEAD']),
    worktreeDirty: git(root, ['status', '--porcelain=v1', '--untracked-files=all']).length > 0,
    originMainSha: gitOrNull(root, ['rev-parse', 'origin/main']),
    sourceChange: sourceSha ? { sha: sourceSha, paths: [...paths] } : null,
    ci: env.GITHUB_RUN_ID ? { runId: env.GITHUB_RUN_ID, workflow: env.GITHUB_WORKFLOW, sha: env.GITHUB_SHA } : null,
  }
  let expectedRelease = null
  let expectedError
  try {
    expectedRelease = buildHarnessRelease({ root, environment: 'production', requireCleanWorktree: false })
  } catch (error) {
    expectedError = error instanceof Error ? error.message : String(error)
  }
  const readJson = (path) => {
    try {
      return JSON.parse(readFileSync(resolve(root, path), 'utf8'))
    } catch {
      return null
    }
  }
  return {
    local,
    expectedRelease,
    expectedError,
    mobilePolicy: readJson('apps/mobile/config/release-client-policy.json'),
    inventory: readJson('config/harness/migration-inventory.json'),
  }
}

function parseArgs(args) {
  const options = { format: 'md' }
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--require-match') options.requireMatch = true
    else if (['--remote', '--paths', '--format', '--output'].includes(key)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
      options[key.slice(2)] = value
    } else throw new Error(`unknown argument: ${key}`)
  }
  if (!['md', 'json'].includes(options.format)) throw new Error('--format must be md or json')
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const collected = collectLocalInputs(ROOT, options.paths ? { paths: options.paths.split(',') } : {})
  const remote = options.remote ? JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.remote), 'utf8')) : null
  const matrix = buildProvenanceMatrix({ ...collected, remote })
  const text = options.format === 'json' ? `${JSON.stringify(matrix, null, 2)}\n` : renderProvenanceMarkdown(matrix)
  if (options.output) writeFileSync(resolveReleaseArtifactPath(ROOT, options.output), text)
  else process.stdout.write(text)
  if (options.requireMatch && matrix.parity.state !== 'VERIFIED_MATCH') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
