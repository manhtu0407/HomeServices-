import { inspectPlan55ProductionReleasePreflight } from './lib/plan55-production-release-preflight.mjs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  const args = process.argv.slice(2)
  let expectedRelease
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--release') {
      throw new Error('plan55_release_preflight_arguments_invalid')
    }
    expectedRelease = JSON.parse(readFileSync(resolve(args[1]), 'utf8'))
  }
  const proof = await inspectPlan55ProductionReleasePreflight({ expectedRelease })
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`)
} catch (error) {
  const code = error instanceof Error ? error.message : 'plan55_release_preflight_failed'
  process.stderr.write(`${/^[a-z0-9_:-]{1,180}$/i.test(code) ? code : 'plan55_release_preflight_failed'}\n`)
  process.exitCode = 1
}
