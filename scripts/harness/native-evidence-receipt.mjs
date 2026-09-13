#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const APP_IDS = Object.freeze({
  android: 'com.phanmanhtu.nestscout',
  ios: 'com.phanmanhtu.homeservices',
})

export function buildNativeEvidenceReceipt(input) {
  validateInput(input)
  const receipt = {
    schemaVersion: 'nestscout-native-emulator-evidence.v1',
    status: 'recorded_after_maestro',
    targetEnvironment: input.targetEnvironment,
    platform: input.platform,
    proofClass: input.platform === 'ios' ? 'simulator' : 'emulator',
    appId: input.appId,
    buildId: input.buildId,
    gitSha: input.gitSha,
    releaseId: input.releaseId,
    sourceBundleSha256: input.sourceBundleSha256,
    workflow: {
      id: input.workflowId,
      url: input.workflowUrl,
    },
    personas: ['customer', 'worker'],
    testedStates: [
      'customer_password_login',
      'customer_provider_options_visible',
      'customer_home',
      'customer_runtime_identity',
      'worker_password_login',
      'worker_provider_options_absent',
      'worker_home_or_readiness',
    ],
    limitations: [
      'simulator_or_emulator_only',
      'physical_push_background_killed_app_and_deep_link_not_proven',
    ],
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
  return Object.freeze(receipt)
}

export function verifyNativeEvidenceReceipt(receipt) {
  try {
    validateInput({
      targetEnvironment: receipt?.targetEnvironment,
      platform: receipt?.platform,
      appId: receipt?.appId,
      buildId: receipt?.buildId,
      gitSha: receipt?.gitSha,
      releaseId: receipt?.releaseId,
      sourceBundleSha256: receipt?.sourceBundleSha256,
      workflowId: receipt?.workflow?.id,
      workflowUrl: receipt?.workflow?.url,
    })
  } catch {
    return false
  }
  if (receipt.schemaVersion !== 'nestscout-native-emulator-evidence.v1' ||
      receipt.status !== 'recorded_after_maestro' ||
      receipt.proofClass !== (receipt.platform === 'ios' ? 'simulator' : 'emulator') ||
      receipt.personas?.join(',') !== 'customer,worker' || receipt.testedStates?.length !== 7 ||
      receipt.limitations?.join(',') !==
        'simulator_or_emulator_only,physical_push_background_killed_app_and_deep_link_not_proven') return false
  return receipt.receiptSha256 === sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
}

function validateInput(input) {
  if (!['staging', 'production'].includes(input?.targetEnvironment)) throw new Error('native evidence target must be staging or production')
  if (!['ios', 'android'].includes(input?.platform)) throw new Error('native evidence platform is invalid')
  if (input?.appId !== APP_IDS[input.platform]) throw new Error('native evidence application ID is invalid')
  if (!BUILD_ID.test(input?.buildId ?? '')) throw new Error('native evidence EAS build ID is invalid')
  if (!GIT_SHA.test(input?.gitSha ?? '')) throw new Error('native evidence Git SHA is invalid')
  if (!RELEASE_ID.test(input?.releaseId ?? '') || !input.releaseId.startsWith(`harness-${input.gitSha.slice(0, 12)}-`)) {
    throw new Error('native evidence release ID is not bound to Git SHA')
  }
  if (!SHA256.test(input?.sourceBundleSha256 ?? '')) throw new Error('native evidence source bundle hash is invalid')
  if (!/^[A-Za-z0-9_-]{1,100}$/u.test(input?.workflowId ?? '')) throw new Error('native evidence workflow ID is invalid')
  const workflowUrl = safeUrl(input?.workflowUrl)
  if (workflowUrl.protocol !== 'https:' || workflowUrl.hostname !== 'expo.dev') throw new Error('native evidence workflow URL is invalid')
}

function safeUrl(value) {
  try {
    return new URL(String(value ?? ''))
  } catch {
    throw new Error('native evidence workflow URL is invalid')
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(args) {
  const fields = new Map([
    ['--target', 'targetEnvironment'],
    ['--platform', 'platform'],
    ['--app-id', 'appId'],
    ['--build-id', 'buildId'],
    ['--git-sha', 'gitSha'],
    ['--release-id', 'releaseId'],
    ['--source-bundle-sha256', 'sourceBundleSha256'],
    ['--workflow-id', 'workflowId'],
    ['--workflow-url', 'workflowUrl'],
    ['--output', 'output'],
  ])
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const field = fields.get(args[index])
    if (!field) throw new Error(`unknown native evidence argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    result[field] = value
  }
  for (const field of [...fields.values()]) if (!result[field]) throw new Error(`native evidence argument is missing: ${field}`)
  return result
}

function outputPath(value) {
  const testsRoot = process.env.MAESTRO_TESTS_DIR ? resolve(process.env.MAESTRO_TESTS_DIR) : null
  const output = resolve(value)
  if (testsRoot) {
    const local = relative(testsRoot, output)
    if (!local || local.startsWith('..')) throw new Error('native evidence output must stay inside MAESTRO_TESTS_DIR')
  } else {
    const local = relative(ROOT, output)
    if (!local || local.startsWith('..')) throw new Error('native evidence output must stay inside repository root')
  }
  return output
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const receipt = buildNativeEvidenceReceipt(options)
  const output = outputPath(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`native evidence receipt written: ${output}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
