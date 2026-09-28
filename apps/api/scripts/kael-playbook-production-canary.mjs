#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PLAN55_SERVICE_ORDER,
  buildPlan55CanaryPlan,
} from './lib/plan55-production-canary-core.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')

function main(argv) {
  const args = parseArguments(argv)
  if (args.help) return printHelp()
  if (args.plan) return printPlan(args.service ? [args.service] : PLAN55_SERVICE_ORDER)
  if (args.preflight) return runReadOnlyPreflight()
  throw new Error('plan55_canary_requires_plan_or_read_only_preflight')
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') args.help = true
    else if (token === '--plan') args.plan = true
    else if (token === '--preflight') args.preflight = true
    else if (token === '--service') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('plan55_canary_service_missing')
      args.service = value
      index += 1
    } else {
      throw new Error('plan55_canary_unknown_argument')
    }
  }
  if (args.plan && args.preflight) throw new Error('plan55_canary_choose_one_mode')
  return args
}

function printPlan(services) {
  const plan = buildPlan55CanaryPlan(services)
  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-canary-plan/v1',
    project_ref: 'iwevizmsedyqozxlawwl',
    execution: 'not_started',
    services: plan.map(({ service, slices }) => ({
      service,
      slices: slices.map(({ id, arm, dataset, repetition, offset, limit, corpusPath, playbookPath }) => ({
        id,
        arm,
        dataset,
        repetition,
        offset,
        limit,
        corpus_path: corpusPath,
        playbook_path: playbookPath,
      })),
    })),
  }, null, 2)}\n`)
}

function runReadOnlyPreflight() {
  const attestor = resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-production-attest.mjs')
  const result = spawnSync(process.execPath, [attestor], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) throw new Error('plan55_canary_attestation_process_failed')
  if (result.status !== 0) {
    const safeReason = (result.stderr ?? '').trim().split(/\r?\n/u).at(-1)
    throw new Error(/^[a-z0-9_:-]{1,160}$/i.test(safeReason ?? '')
      ? `plan55_canary_preflight_blocked:${safeReason}`
      : 'plan55_canary_preflight_blocked:source_attestation_failed')
  }
  const attestation = JSON.parse(result.stdout)
  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-canary-preflight/v1',
    status: 'SOURCE_ATTESTATION_PASS_REMAINING_GATES_UNVERIFIED',
    project_ref: attestation.deployment.project_ref,
    release_id: attestation.deployment.release_id,
    source_sha: attestation.deployment.git_sha,
    service_count: Object.keys(attestation.services).length,
    runtime_file_count: attestation.runtime_files.length,
    evaluator_file_count: attestation.evaluator.files.length,
    mutations: 0,
  }, null, 2)}\n`)
}

function printHelp() {
  process.stdout.write([
    'Plan 55 Production-only canary evaluator',
    '',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --plan [--service <service>]',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --preflight',
    '',
    'The plan mode is local-only. Preflight performs one read-only Production source attestation.',
    'No account, flag, database, service, release, or Docker mutation is performed by either mode.',
    '',
  ].join('\n'))
}

try {
  const result = main(process.argv.slice(2))
  if (result && typeof result.then === 'function') await result
} catch (error) {
  const code = error instanceof Error ? error.message : 'plan55_canary_failed'
  process.stderr.write(`${/^[a-z0-9_:-]{1,200}$/i.test(code) ? code : 'plan55_canary_failed'}\n`)
  process.exitCode = 1
}
