import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildBackendGateReceipt } from './backend-system-health-promotion.mjs'
import { resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (!['--release', '--gate', '--evidence', '--output'].includes(key) || !value || value.startsWith('--')) {
      throw new Error('BACKEND_GATE_RECEIPT_ARGUMENTS_INVALID')
    }
    parsed[key.slice(2)] = value
    index += 1
  }
  if (Object.keys(parsed).length !== 4 || !process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT) {
    throw new Error('BACKEND_GATE_RECEIPT_ARGUMENTS_INVALID')
  }
  return parsed
}

try {
  const args = parseArgs(process.argv.slice(2))
  const receipt = buildBackendGateReceipt({
    release: JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, args.release), 'utf8')),
    gate: args.gate,
    evidenceBytes: readFileSync(resolveReleaseArtifactPath(ROOT, args.evidence)),
    workflowRun: {
      workflowPath: '.github/workflows/release-backend-system-health.yml',
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    },
  })
  const output = resolveReleaseArtifactPath(ROOT, args.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`Backend ${args.gate} gate receipt written: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'BACKEND_GATE_RECEIPT_FAILED'}\n`)
  process.exitCode = 1
}
