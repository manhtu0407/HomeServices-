import { inspectPlan55ProductionReleasePreflight } from './lib/plan55-production-release-preflight.mjs'

try {
  const proof = await inspectPlan55ProductionReleasePreflight()
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`)
} catch (error) {
  const code = error instanceof Error ? error.message : 'plan55_release_preflight_failed'
  process.stderr.write(`${/^[a-z0-9_:-]{1,180}$/i.test(code) ? code : 'plan55_release_preflight_failed'}\n`)
  process.exitCode = 1
}
