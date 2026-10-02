#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const OUTPUT_PATH = resolve(REPO_ROOT, 'artifacts/plan55-blind-holdout/review-package.json')
const SHA_PATTERN = /^[a-f0-9]{40}$/iu

function main(argv) {
  const args = parseArguments(argv)
  const context = validatePullRequestContext(args)
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
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(reviewPackage, null, 2)}\n`, { flag: 'wx' })

  process.stdout.write(`${JSON.stringify({
    schema: reviewPackage.schema,
    status: 'blind_package_created',
    pull_request_number: context.pullRequestNumber,
    reviewed_head_sha: reviewPackage.reviewed_head_sha,
    service_count: reviewPackage.coverage.service_count,
    case_count: reviewPackage.coverage.total_case_count,
    holdout_root_sha256: reviewPackage.holdout_root_sha256,
    labels_sha256: reviewPackage.labels_sha256,
    package_sha256: reviewPackage.package_sha256,
    output: 'artifacts/plan55-blind-holdout/review-package.json',
  })}\n`)
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('arguments_invalid')
    if (flag === '--reviewed-head-sha' && !args.reviewedHeadSha) args.reviewedHeadSha = value.toLowerCase()
    else if (flag === '--pull-request' && !args.pullRequestNumber) args.pullRequestNumber = Number(value)
    else throw new Error('arguments_invalid')
    index += 1
  }
  if (!SHA_PATTERN.test(args.reviewedHeadSha ?? '') ||
      !Number.isSafeInteger(args.pullRequestNumber) || args.pullRequestNumber < 1) {
    throw new Error('arguments_invalid')
  }
  return args
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
