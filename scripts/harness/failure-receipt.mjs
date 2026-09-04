import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildReleaseFailureReceipt } from './release-safety.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (['--release', '--phase', '--reason-code', '--run-id', '--cohort-id', '--output',
      '--rollback-mobile-edge-version', '--rollback-mobile-hosted-digest',
      '--rollback-maintainer-edge-version', '--rollback-maintainer-hosted-digest'].includes(key)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
      options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
    } else throw new Error(`unknown argument: ${key}`)
  }
  return options
}

function insideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error('failure receipt path escapes repository root')
  return absolute
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const required of ['release', 'phase', 'reasonCode', 'runId', 'output']) {
    if (!options[required]) throw new Error(`failure receipt option is missing: ${required}`)
  }
  const release = JSON.parse(readFileSync(insideRoot(options.release), 'utf8'))
  const receipt = buildReleaseFailureReceipt({
    cohortId: options.cohortId,
    phase: options.phase,
    reasonCode: options.reasonCode,
    release,
    rollbackFunctions: options.rollbackMobileEdgeVersion ? {
      'mobile-api': {
        edgeVersion: Number(options.rollbackMobileEdgeVersion),
        hostedDigest: options.rollbackMobileHostedDigest,
      },
      'kael-matching-maintainer': {
        edgeVersion: Number(options.rollbackMaintainerEdgeVersion),
        hostedDigest: options.rollbackMaintainerHostedDigest,
      },
    } : null,
    runId: options.runId,
  })
  const output = insideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`failure receipt written: ${receipt.receiptSha256}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
