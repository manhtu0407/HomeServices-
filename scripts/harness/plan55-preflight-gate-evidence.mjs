import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPlan55PreflightGateProof,
  PLAN55_PREFLIGHT_GATE_CHECKS,
} from './plan55-gate-receipts.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'

const SOURCE_WORKFLOW_PATH = '.github/workflows/ci.yml'
const REQUIRED_REPOSITORY = 'manhtu0407/HomeServices-'
const OUTCOME_ENVIRONMENT = Object.freeze({
  verify_source: 'PLAN55_VERIFY_SOURCE_OUTCOME',
  docker_ram_floor: 'PLAN55_DOCKER_RAM_FLOOR_OUTCOME',
  workspace_quality: 'PLAN55_WORKSPACE_QUALITY_OUTCOME',
  production_ui_normality: 'PLAN55_PRODUCTION_UI_NORMALITY_OUTCOME',
  secret_scan: 'PLAN55_SECRET_SCAN_OUTCOME',
  sql_verification: 'PLAN55_SQL_VERIFICATION_OUTCOME',
  independent_holdout_preflight: 'PLAN55_INDEPENDENT_HOLDOUT_PREFLIGHT_OUTCOME',
})

export { PLAN55_PREFLIGHT_GATE_CHECKS }

export function buildPlan55PreflightGateEvidenceFiles({
  policy,
  sourceSha,
  githubSha,
  githubRef,
  eventName,
  repository,
  runId,
  runAttempt,
  outcomes,
}) {
  const fail = () => { throw new Error('Plan 55 preflight gate evidence inputs are invalid') }
  const requiredOutcomes = Object.keys(OUTCOME_ENVIRONMENT)
  if (!policy || policy.policyId !== 'plan55-production-only' || policy.environment !== 'production' ||
      policy.repository !== REQUIRED_REPOSITORY || !policy.projectRef ||
      !/^[a-f0-9]{40}$/u.test(sourceSha ?? '') || githubSha !== sourceSha ||
      githubRef !== 'refs/heads/main' || eventName !== 'workflow_dispatch' ||
      repository !== REQUIRED_REPOSITORY || !/^[1-9]\d{0,15}$/u.test(runId ?? '') ||
      !Number.isSafeInteger(Number(runId)) || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      !outcomes || typeof outcomes !== 'object' || Array.isArray(outcomes) ||
      JSON.stringify(Object.keys(outcomes).sort()) !== JSON.stringify([...requiredOutcomes].sort()) ||
      requiredOutcomes.some((key) => outcomes[key] !== 'success')) fail()

  const files = new Map()
  for (const [gate, checkIds] of Object.entries(PLAN55_PREFLIGHT_GATE_CHECKS)) {
    const workflowPath = policy.trustedEvidenceWorkflowPathsByGate?.[gate]
    if (workflowPath !== SOURCE_WORKFLOW_PATH ||
        !policy.trustedEvidenceWorkflowPaths?.includes(workflowPath)) fail()
    const proof = {
      schemaVersion: 'plan55-preflight-gate-proof.v1',
      gate,
      status: 'PASS',
      environment: policy.environment,
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      sourceSha,
      workflowPath,
      runId,
      runAttempt,
      checks: checkIds.map((id) => ({ id, outcome: outcomes[id] })),
    }
    assertPlan55PreflightGateProof(proof, {
      gate, policy, sourceSha, runId, runAttempt, workflowPath,
    })
    files.set(`plan55-gate-evidence/${gate}.json`, Buffer.from(`${JSON.stringify(proof)}\n`))
  }
  return files
}

export function writePlan55PreflightGateEvidence(outputInput, input) {
  const repositoryRoot = realpathSync(process.cwd())
  const outputRoot = resolve(outputInput)
  const expectedRoot = resolve(repositoryRoot, 'artifacts/release/plan55-gate-evidence')
  if (outputRoot !== expectedRoot) {
    throw new Error('Plan 55 preflight gate evidence output path is invalid')
  }
  mkdirSync(outputRoot, { recursive: true })
  if (realpathSync(outputRoot) !== outputRoot) {
    throw new Error('Plan 55 preflight gate evidence output path is invalid')
  }
  const files = buildPlan55PreflightGateEvidenceFiles(input)
  for (const [relativePath, bytes] of files) {
    const expectedPrefix = 'plan55-gate-evidence/'
    if (!relativePath.startsWith(expectedPrefix) || relativePath.split('/').includes('..')) {
      throw new Error('Plan 55 preflight gate evidence file path is invalid')
    }
    const filePath = resolve(outputRoot, relativePath.slice(expectedPrefix.length))
    if (!filePath.startsWith(`${outputRoot}/`) && !filePath.startsWith(`${outputRoot}\\`)) {
      throw new Error('Plan 55 preflight gate evidence file path is invalid')
    }
    writeFileSync(filePath, bytes, { flag: 'wx' })
  }
  return files.size
}

function readWorkflowInputs(environment) {
  return {
    policy: loadPlan55ProductionOnlyPolicy(process.cwd()),
    sourceSha: environment.PLAN55_SOURCE_SHA,
    githubSha: environment.GITHUB_SHA,
    githubRef: environment.GITHUB_REF,
    eventName: environment.GITHUB_EVENT_NAME,
    repository: environment.GITHUB_REPOSITORY,
    runId: environment.GITHUB_RUN_ID,
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
    outcomes: Object.fromEntries(Object.entries(OUTCOME_ENVIRONMENT).map(([id, key]) => [id, environment[key]])),
  }
}

function runCli() {
  if (process.argv.length !== 4 || process.argv[2] !== '--output') {
    throw new Error('Usage: plan55-preflight-gate-evidence.mjs --output artifacts/release/plan55-gate-evidence')
  }
  const written = writePlan55PreflightGateEvidence(process.argv[3], readWorkflowInputs(process.env))
  process.stdout.write(`${JSON.stringify({ gateCount: written, status: 'PASS' })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
