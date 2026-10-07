#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { buildPlan55IndependentHoldoutJudgeContract, buildPlan55IndependentHoldoutJudgeResult } from './lib/plan55-independent-holdout-agent.mjs'
import { createPlan55IndependentHoldoutProof } from './lib/plan55-independent-holdout-adjudication.mjs'
import { PLAN55_SOURCE_ASSETS, PLAN55_RUNTIME_SOURCE_PATHS } from './lib/kael-playbook-production-attestation.mjs'
import { buildPlan55BlindHoldoutPackage } from './lib/plan55-independent-holdout-package.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u
const CODEX_MODEL_ID = 'gpt-6.1-sol'

try {
  const args = parseArguments(process.argv.slice(2))
  const sourceSha = String(process.env.PLAN55_SOURCE_SHA ?? '').toLowerCase()
  assertExactSource(sourceSha)
  const sources = readHoldoutSources()
  const guardBlobSha = git(['hash-object', '--', PLAN55_RUNTIME_SOURCE_PATHS[0]])
  const reviewPackage = buildPlan55BlindHoldoutPackage({
    reviewedHeadSha: sourceSha,
    holdoutCasesByService: sources.cases,
    holdoutHashes: sources.holdoutHashes,
    corpusHashes: sources.corpusHashes,
    playbookHashes: sources.playbookHashes,
    actorGuardFileBlobSha: guardBlobSha,
  })
  const codexContract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'codex')
  const perplexityContract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  assertSame(readJson(args.reviewPackagePath), reviewPackage, 'blind_package_identity_mismatch')
  assertSame(readJson(args.codexContractPath), codexContract, 'codex_contract_identity_mismatch')
  assertSame(readJson(args.perplexityContractPath), perplexityContract, 'perplexity_contract_identity_mismatch')

  const codexOutput = readJson(args.codexOutputPath)
  const codexResult = buildPlan55IndependentHoldoutJudgeResult({
    contract: codexContract,
    output: codexOutput,
    provider: 'codex',
    modelId: CODEX_MODEL_ID,
    invocationId: `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-codex`,
    execution: { mode: 'fresh_context', fork_context: false, thread_id: null },
    usage: { cost_usd: null, input_tokens: null, output_tokens: null },
  })
  const perplexityResult = readJson(args.perplexityResultPath)
  const proof = createPlan55IndependentHoldoutProof({
    reviewPackage,
    holdoutCasesByService: sources.cases,
    expectedHoldoutHashes: sources.holdoutHashes,
    expectedHoldoutLabelsSha256: sources.labelsSha256,
    codex: codexResult,
    perplexity: perplexityResult,
  })
  writeFileSync(args.outputPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify({
    schema: proof.schema,
    status: proof.status,
    source_sha: proof.source_sha,
    package_sha256: proof.package_sha256,
    proof_sha256: proof.proof_sha256,
    service_count: proof.coverage.service_count,
    case_count: proof.coverage.total_case_count,
    output: 'artifacts/release/plan55-independent-holdout-proof.json',
  })}\n`)
} catch (error) {
  const code = String(error?.message ?? '').match(/^[a-z0-9_:-]{1,160}$/iu)?.[0] ??
    'plan55_independent_holdout_verify_failed'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('arguments_invalid')
    const key = {
      '--review-package': 'reviewPackagePath',
      '--codex-contract': 'codexContractPath',
      '--codex-output': 'codexOutputPath',
      '--perplexity-contract': 'perplexityContractPath',
      '--perplexity-result': 'perplexityResultPath',
      '--output': 'outputPath',
    }[flag]
    if (!key || args[key]) throw new Error('arguments_invalid')
    args[key] = resolve(REPO_ROOT, value)
    index += 1
  }
  if (Object.keys(args).length !== 6) throw new Error('arguments_invalid')
  return args
}

function assertExactSource(sourceSha) {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REPOSITORY !== 'manhtu0407/HomeServices-' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      !GIT_SHA_PATTERN.test(sourceSha) || sourceSha !== String(process.env.GITHUB_SHA ?? '').toLowerCase() ||
      sourceSha !== git(['rev-parse', 'HEAD']) || !/^\d+$/u.test(process.env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9]\d*$/u.test(process.env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('exact_main_source_context_invalid')
  }
}

function readHoldoutSources() {
  const cases = {}
  const holdoutHashes = {}
  const corpusHashes = {}
  const playbookHashes = {}
  for (const [service, assets] of Object.entries(PLAN55_SOURCE_ASSETS)) {
    const holdoutBytes = readAsset(assets.holdout)
    const corpusBytes = readAsset(assets.corpus)
    const playbookBytes = readAsset(assets.playbook)
    try {
      cases[service] = JSON.parse(holdoutBytes.toString('utf8'))
    } catch {
      throw new Error('holdout_source_asset_invalid')
    }
    holdoutHashes[service] = digest(holdoutBytes)
    corpusHashes[service] = digest(corpusBytes)
    playbookHashes[service] = digest(playbookBytes)
  }
  return {
    cases,
    holdoutHashes,
    corpusHashes,
    playbookHashes,
    labelsSha256: labelDigest(cases),
  }
}

function labelDigest(cases) {
  const projection = Object.fromEntries(Object.keys(PLAN55_SOURCE_ASSETS).map((service) => [service,
    cases[service].map(({ id, expected }) => ({ id, labels: expected })).sort((a, b) => a.id.localeCompare(b.id))]))
  return digest(canonicalJson(projection))
}

function readAsset(path) {
  try {
    return readFileSync(resolve(REPO_ROOT, path))
  } catch {
    throw new Error('source_asset_unavailable')
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error('holdout_artifact_unreadable')
  }
}

function assertSame(actual, expected, code) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(code)
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 1_048_576,
    shell: false,
    windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  })
  if (result.error || result.status !== 0) throw new Error('git_identity_check_failed')
  return String(result.stdout).trim().toLowerCase()
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}
