// A verification release ships with transaction-critical behavior that is only partly proven. This receipt
// makes that explicit: every bound assertion executed and passed, no entry lacks a reviewed binding, and each
// remaining gap is named and digested. It records an acknowledged risk; it never proves completed transactions.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateBehavioralEvidence } from './transaction-critical-coverage.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MANIFEST_PATH = resolve(ROOT, 'config/harness/transaction-critical-coverage.json')
const SHA256 = /^[0-9a-f]{64}$/u

export const TRANSACTION_BEHAVIOR_RECEIPT_SCHEMA = 'transaction-behavior-receipt.v1'
export const TRANSACTION_BEHAVIOR_MODE = 'bound-assertions-with-acknowledged-gaps'

export function buildTransactionBehaviorReceipt({ manifest, reports, now }) {
  const evidence = evaluateBehavioralEvidence(manifest, reports)
  if (evidence.executionProblems.length > 0) {
    throw new Error(`bound assertions did not all execute and pass: ${evidence.executionProblems.slice(0, 5).join('; ')}`)
  }
  const unverified = evidence.entries.filter((entry) => entry.status === 'UNVERIFIED')
  if (unverified.length > 0) {
    throw new Error(`${unverified.length} transaction entries have no reviewed behavioral binding`)
  }
  const partial = evidence.entries.filter((entry) => entry.status === 'PARTIAL')
  const acknowledgedGaps = partial
    .map((entry) => ({ id: entry.id, gaps: [...entry.gaps] }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const receipt = {
    schemaVersion: TRANSACTION_BEHAVIOR_RECEIPT_SCHEMA,
    mode: TRANSACTION_BEHAVIOR_MODE,
    generatedAt: new Date(now ?? Date.now()).toISOString(),
    manifestSha256: sha256(canonicalJson(manifest)),
    entryCount: evidence.entries.length,
    mappedCount: evidence.entries.length - partial.length,
    partialCount: partial.length,
    unverifiedCount: 0,
    boundAssertions: {
      passed: evidence.entries.reduce((sum, entry) => sum + entry.passedTests, 0),
      required: evidence.entries.reduce((sum, entry) => sum + entry.requiredTests, 0),
    },
    acknowledgedGaps,
    gapsSha256: sha256(canonicalJson(acknowledgedGaps)),
    receiptSha256: '',
  }
  receipt.receiptSha256 = sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
  const problems = verifyTransactionBehaviorReceipt(receipt)
  if (problems.length > 0) throw new Error(problems.join('; '))
  return Object.freeze(receipt)
}

export function verifyTransactionBehaviorReceipt(receipt) {
  const problems = []
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['transaction behavior receipt is invalid']
  if (receipt.schemaVersion !== TRANSACTION_BEHAVIOR_RECEIPT_SCHEMA || receipt.mode !== TRANSACTION_BEHAVIOR_MODE ||
      !Number.isFinite(Date.parse(receipt.generatedAt ?? '')) || !SHA256.test(receipt.manifestSha256 ?? '')) {
    problems.push('transaction behavior receipt identity is invalid')
  }
  const counts = [receipt.entryCount, receipt.mappedCount, receipt.partialCount, receipt.unverifiedCount]
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0) || receipt.entryCount < 1 ||
      receipt.unverifiedCount !== 0 || receipt.mappedCount + receipt.partialCount !== receipt.entryCount) {
    problems.push('transaction behavior receipt counts are inconsistent or leave an entry unverified')
  }
  const passed = receipt.boundAssertions?.passed
  const required = receipt.boundAssertions?.required
  if (!Number.isSafeInteger(required) || required < 1 || passed !== required) {
    problems.push('transaction behavior receipt requires every bound assertion to have passed')
  }
  const gaps = receipt.acknowledgedGaps
  if (!Array.isArray(gaps) || gaps.length !== receipt.partialCount ||
      gaps.some((gap) => typeof gap?.id !== 'string' || !gap.id || !Array.isArray(gap.gaps) || gap.gaps.length === 0 ||
        gap.gaps.some((text) => typeof text !== 'string' || !text.trim())) ||
      new Set((gaps ?? []).map((gap) => gap?.id)).size !== (gaps ?? []).length) {
    problems.push('transaction behavior receipt must name every acknowledged gap')
  } else if (receipt.gapsSha256 !== sha256(canonicalJson(gaps))) {
    problems.push('transaction behavior receipt gap digest mismatch')
  }
  if (!SHA256.test(receipt.gapsSha256 ?? '') || !SHA256.test(receipt.receiptSha256 ?? '') ||
      receipt.receiptSha256 !== sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))) {
    problems.push('transaction behavior receipt checksum mismatch')
  }
  return [...new Set(problems)]
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
  const options = { results: [] }
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (key === '--results' && value && !value.startsWith('--')) options.results.push(value)
    else if (key === '--output' && value && !value.startsWith('--')) options.output = value
    else throw new Error(`unknown or incomplete transaction behavior receipt argument: ${key}`)
    index += 1
  }
  if (options.results.length === 0 || !options.output) {
    throw new Error('transaction behavior receipt requires --results (one or more) and --output')
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const receipt = buildTransactionBehaviorReceipt({
    manifest: JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')),
    reports: options.results.map((path) => JSON.parse(readFileSync(resolve(path), 'utf8'))),
  })
  const output = resolve(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(
    `Transaction behavior receipt written: ${relative(ROOT, output).replaceAll('\\', '/')} ` +
    `(${receipt.boundAssertions.passed}/${receipt.boundAssertions.required} bound assertions passed; ` +
    `${receipt.partialCount} PARTIAL entries acknowledged)\n`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`transaction-behavior-receipt failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
