#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
  PLAN55_PRODUCTION_SOURCE_BASE,
} from './lib/plan55-independent-holdout-review.mjs'
import {
  PLAN55_SOURCE_ASSETS,
  PLAN55_RUNTIME_SOURCE_PATHS,
} from './lib/kael-playbook-production-attestation.mjs'
import {
  assertPlan55BlindPackageContext,
  buildPlan55BlindHoldoutPackage,
} from './lib/plan55-independent-holdout-package.mjs'
import { buildPlan55IndependentHoldoutJudgeContract } from './lib/plan55-independent-holdout-agent.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const OUTPUT_PATH = resolve(REPO_ROOT, 'artifacts/plan55-blind-holdout/review-package.json')
const OUTPUT_DIR = dirname(OUTPUT_PATH)
const SHA_PATTERN = /^[a-f0-9]{40}$/iu
const JUDGE_RUNTIME_FILES = Object.freeze([
  ['apps/api/scripts/lib/plan55-independent-holdout-agent.mjs', 'runner/lib/plan55-independent-holdout-agent.mjs'],
  ['apps/api/scripts/lib/plan55-independent-holdout-package.mjs', 'runner/lib/plan55-independent-holdout-package.mjs'],
  ['apps/api/scripts/lib/plan55-independent-holdout-review.mjs', 'runner/lib/plan55-independent-holdout-review.mjs'],
  ['apps/api/scripts/lib/kael-playbook-eval-core.mjs', 'runner/lib/kael-playbook-eval-core.mjs'],
  ['apps/api/scripts/lib/kael-playbook-production-attestation.mjs', 'runner/lib/kael-playbook-production-attestation.mjs'],
  ['apps/api/scripts/plan55-independent-holdout-perplexity.mjs', 'runner/plan55-independent-holdout-perplexity.mjs'],
])

function main(argv) {
  const args = parseArguments(argv)
  const context = args.sourceSha
    ? validateProductionSourceContext(args.sourceSha)
    : validatePullRequestContext(args)
  const holdoutCasesByService = {}
  const holdoutHashes = {}
  const corpusHashes = {}
  const playbookHashes = {}

  for (const [service, assets] of Object.entries(PLAN55_SOURCE_ASSETS)) {
    const holdoutBytes = readSourceAsset(assets.holdout)
    const corpusBytes = readSourceAsset(assets.corpus)
    const playbookBytes = readSourceAsset(assets.playbook)
    try {
      holdoutCasesByService[service] = JSON.parse(holdoutBytes.toString('utf8'))
    } catch {
      throw new Error('holdout_asset_invalid')
    }
    holdoutHashes[service] = sha256(holdoutBytes)
    corpusHashes[service] = sha256(corpusBytes)
    playbookHashes[service] = sha256(playbookBytes)
  }

  const actorGuardFileBlobSha = git(['hash-object', '--', PLAN55_RUNTIME_SOURCE_PATHS[0]])
  const reviewPackage = buildPlan55BlindHoldoutPackage({
    reviewedHeadSha: context.reviewedHeadSha,
    holdoutCasesByService,
    holdoutHashes,
    corpusHashes,
    playbookHashes,
    actorGuardFileBlobSha,
  })
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(reviewPackage, null, 2)}\n`, { flag: 'wx' })
  const codexContract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'codex')
  const perplexityContract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  writeJson('codex-contract.json', codexContract)
  writeJson('codex-output-schema.json', codexContract.output_schema)
  writeFileSync(resolve(OUTPUT_DIR, 'codex-prompt.md'), `${codexContract.prompt}\n`, { flag: 'wx' })
  writeJson('perplexity-contract.json', perplexityContract)
  writeJson('perplexity-request.json', perplexityContract.request)
  for (const [source, destination] of JUDGE_RUNTIME_FILES) {
    const destinationPath = resolve(OUTPUT_DIR, destination)
    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(resolve(REPO_ROOT, source), destinationPath, constants.COPYFILE_EXCL)
    chmodSync(destinationPath, 0o400)
  }

  process.stdout.write(`${JSON.stringify({
    schema: reviewPackage.schema,
    status: 'blind_package_created',
    pull_request_number: context.pullRequestNumber ?? null,
    reviewed_head_sha: reviewPackage.reviewed_head_sha,
    service_count: reviewPackage.coverage.service_count,
    case_count: reviewPackage.coverage.total_case_count,
    holdout_root_sha256: reviewPackage.holdout_root_sha256,
    package_sha256: reviewPackage.package_sha256,
    artifact_bundle: 'artifacts/plan55-blind-holdout',
  })}\n`)
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('arguments_invalid')
    if (flag === '--reviewed-head-sha' && !args.reviewedHeadSha) args.reviewedHeadSha = value.toLowerCase()
    else if (flag === '--source-sha' && !args.sourceSha) args.sourceSha = value.toLowerCase()
    else if (flag === '--pull-request' && !args.pullRequestNumber) args.pullRequestNumber = Number(value)
    else throw new Error('arguments_invalid')
    index += 1
  }
  const prMode = args.reviewedHeadSha && Number.isSafeInteger(args.pullRequestNumber) && args.pullRequestNumber >= 1
  const productionMode = SHA_PATTERN.test(args.sourceSha ?? '')
  if (Boolean(prMode) === Boolean(productionMode) ||
      (args.reviewedHeadSha && !prMode) || (args.sourceSha && !productionMode)) {
    throw new Error('arguments_invalid')
  }
  return args
}

function validateProductionSourceContext(sourceSha) {
  const checkoutHeadSha = git(['rev-parse', 'HEAD'])
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REPOSITORY !== 'manhtu0407/HomeServices-' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      sourceSha !== String(process.env.GITHUB_SHA ?? '').toLowerCase() ||
      sourceSha !== checkoutHeadSha ||
      git(['status', '--porcelain=v1', '--untracked-files=all']) !== '' ||
      !SHA_PATTERN.test(String(PLAN55_PRODUCTION_SOURCE_BASE.sha ?? '')) ||
      gitStatus(['merge-base', '--is-ancestor', PLAN55_PRODUCTION_SOURCE_BASE.sha, sourceSha]) !== 0) {
    throw new Error('production_source_context_invalid')
  }
  return Object.freeze({ reviewedHeadSha: sourceSha, pullRequestNumber: null })
}

function writeJson(relativePath, value) {
  writeFileSync(resolve(OUTPUT_DIR, relativePath), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o400 })
}

function validatePullRequestContext({ reviewedHeadSha, pullRequestNumber }) {
  const eventName = process.env.GITHUB_EVENT_NAME
  let event = null
  if (eventName === 'pull_request') {
    try {
      if (!process.env.GITHUB_EVENT_PATH) throw new Error('pull_request_event_invalid')
      event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    } catch {
      throw new Error('pull_request_event_invalid')
    }
  }
  const checkoutHeadSha = git(['rev-parse', 'HEAD'])
  const workingTreeClean = git(['status', '--porcelain=v1', '--untracked-files=all']) === ''
  const productionBaseAncestor = SHA_PATTERN.test(String(PLAN55_PRODUCTION_SOURCE_BASE.sha ?? '')) &&
    gitStatus(['merge-base', '--is-ancestor', PLAN55_PRODUCTION_SOURCE_BASE.sha, reviewedHeadSha]) === 0
  return assertPlan55BlindPackageContext({
    githubActions: process.env.GITHUB_ACTIONS,
    eventName,
    repository: process.env.GITHUB_REPOSITORY,
    githubRef: process.env.GITHUB_REF,
    githubBaseRef: process.env.GITHUB_BASE_REF,
    event,
    reviewedHeadSha,
    pullRequestNumber,
    checkoutHeadSha,
    workingTreeClean,
    productionBaseAncestor,
    dispatchReviewedHeadSha: process.env.PLAN55_REVIEWED_HEAD_SHA,
    dispatchPullRequestNumber: process.env.PLAN55_PULL_REQUEST_NUMBER,
  })
}

function readSourceAsset(path) {
  try {
    return readFileSync(resolve(REPO_ROOT, path))
  } catch {
    throw new Error('source_asset_missing')
  }
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    shell: false,
    windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  })
  if (result.error || result.status !== 0) throw new Error('git_identity_check_failed')
  return String(result.stdout).trim().toLowerCase()
}

function gitStatus(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    shell: false,
    windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  })
  return result.error ? -1 : result.status
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

try {
  main(process.argv.slice(2))
} catch (error) {
  const safeCode = String(error?.message ?? '').match(/^[a-z0-9_]+$/u)?.[0] ?? 'unknown'
  process.stderr.write(`plan55_blind_holdout_package_failed:${safeCode}\n`)
  process.exitCode = 1
}
