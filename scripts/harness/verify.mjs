import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const NODE = process.execPath
const ARTIFACT_ROOT = resolve(ROOT, '.scratch/harness-verification')

// The `node --test` pass over the harness fixture suites is switched off; the semantic
// ratchets below still run, and they are what gate the manifest, capability, access,
// migration, reliability, and promotion records.
const commands = [
  ['scripts/harness/check-manifest.mjs'],
  ['scripts/harness/capability-registry.mjs'],
  ['scripts/harness/check-privileged-clients.mjs'],
  ['scripts/harness/access-matrix.mjs'],
  ['scripts/harness/migration-inventory.mjs'],
  ['scripts/harness/price-evidence-artifacts.mjs'],
  ['scripts/harness/reliability-registry.mjs'],
  ['scripts/harness/promotion.mjs', '--check'],
]

mkdirSync(ARTIFACT_ROOT, { recursive: true })
const releasePath = resolve(ARTIFACT_ROOT, 'release-manifest.json')
const evaluationPath = resolve(ARTIFACT_ROOT, 'evaluation-report.json')
commands.push(
  ['scripts/harness/release-bundle.mjs', '--environment', 'preview', '--output', releasePath],
  ['scripts/harness/release-bundle.mjs', '--verify', releasePath],
  ['scripts/harness/evaluate-release.mjs', '--evidence', 'deterministic', '--evaluator', 'kael-deterministic-v1', '--samples', '1', '--release', releasePath, '--output', evaluationPath],
  ['scripts/harness/evaluate-release.mjs', '--verify', evaluationPath],
)

let failed = false
for (const args of commands) {
  const result = spawnSync(NODE, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    failed = true
    break
  }
}
rmSync(ARTIFACT_ROOT, { recursive: true, force: true })
if (failed) process.exit(1)
console.log('Harness assurance verification passed')
