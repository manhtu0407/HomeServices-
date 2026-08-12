import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * React Doctor regression gate.
 *
 * The runner pins `--blocking none`, so react-doctor exits 0 even with findings. Reading its
 * exit code proves nothing — this script reads the per-rule counts out of the diagnostics
 * directory instead and fails on its own terms.
 *
 * Reasons for every accepted finding: docs/audit/react-doctor-accepted-findings-20260812.md
 */

const VERSION = '0.5.8'

// Rules driven to zero. A non-zero count is a real regression, not a budget overrun.
const MUST_BE_ZERO = [
  'rn-no-legacy-shadow-styles',
  'rn-style-prefer-boxshadow',
  'js-hoist-intl',
  // `exhaustive-deps` is held at zero to catch the useRef-wrapper trap: wrapping `useRef` in a
  // helper hides the ref from the analyzer and turns `someRef.current.get` into a demanded
  // dependency, trading real staleness detection for a lower allocation count.
  'exhaustive-deps',
]

// Ceiling for everything else. Lower it when findings are closed; never raise it to make a
// red run green.
//
// Counts only the `react-doctor/*` rules. The `deslop/*` family (unused export / dependency)
// is not reproducible run to run — back-to-back scans of an unchanged tree reported
// unused-export as 7 and as 22 — so budgeting it would make this gate flaky rather than strict.
// It is reported below as information only.
const TOTAL_BUDGET = Number(process.env.REACT_DOCTOR_TOTAL_BUDGET ?? 146)

const result = spawnSync(
  'npx',
  ['--yes', `react-doctor@${VERSION}`, '.', '--yes', '--verbose', '--blocking', 'none', '--no-score'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
)

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
if (!output.trim()) {
  console.error('react-doctor produced no output')
  process.exit(1)
}

const stripped = output.replace(/\[[0-9;]*m/g, '')
const dirMatch = /Full diagnostics written to (.+)/.exec(stripped)
if (!dirMatch) {
  console.error('could not locate the react-doctor diagnostics directory in its output')
  process.exit(1)
}

const diagnosticsDir = dirMatch[1].trim()
const counts = new Map()
const unstable = new Map()
for (const file of readdirSync(diagnosticsDir)) {
  if (!file.endsWith('.txt')) continue
  const body = readFileSync(join(diagnosticsDir, file), 'utf8')
  const rule = /^Rule:\s*(.+)$/m.exec(body)
  const count = /^Count:\s*(\d+)$/m.exec(body)
  if (!rule || !count) continue
  const qualified = rule[1].trim()
  const bare = qualified.replace(/^[^/]+\//, '')
  if (qualified.startsWith('deslop/')) {
    unstable.set(bare, Number(count[1]))
  } else {
    counts.set(bare, Number(count[1]))
  }
}

const total = [...counts.values()].reduce((sum, value) => sum + value, 0)
const violations = []

for (const rule of MUST_BE_ZERO) {
  const found = counts.get(rule) ?? 0
  if (found > 0) violations.push(`${rule}: expected 0, found ${found}`)
}

if (total > TOTAL_BUDGET) {
  violations.push(`total issues: budget ${TOTAL_BUDGET}, found ${total}`)
}

console.log(`react-doctor@${VERSION}: ${total} issues across ${counts.size} rules (budget ${TOTAL_BUDGET})`)
for (const rule of MUST_BE_ZERO) {
  console.log(`  ${rule}: ${counts.get(rule) ?? 0}`)
}
if (unstable.size > 0) {
  const summary = [...unstable].map(([rule, count]) => `${rule}=${count}`).join(' ')
  console.log(`  not budgeted (not reproducible run to run): ${summary}`)
}

if (violations.length > 0) {
  console.error('\nreact-doctor gate failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('\nreact-doctor gate passed.')
