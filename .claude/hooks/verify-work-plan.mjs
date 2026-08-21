#!/usr/bin/env node
// Stop hook — work-plan observer (kael-work-router).
//
// When the agent tries to end a turn, this reconciles the declared slice plan in
// `.scratch/work-plan.json` against what the working tree actually changed, prints
// the result, and appends one record to `.scratch/work-log.jsonl`.
//
// It NEVER blocks. Reporting comes before enforcement on purpose: the router's
// thresholds (how many files a reach class may touch, how far a read-window may
// stretch) are guesses until there is real data behind them, and a Stop hook that
// blocks on a wrong threshold is the fastest way to get itself switched off for good.
// The log is what turns those guesses into calibrated numbers; a later revision can
// exit 2 once the numbers exist.
//
// The binding half of the rule lives where it can be read rather than measured: the
// skill body, the `## Close` template the contract ratchet proves is present, and the
// No False Completion gate in governance/critical.md section 3.
//
// Safety rails (must never brick a session):
//   - Always exits 0, including on its own failure.
//   - Silent when there is no plan on disk: a trivial slice owes none.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    const timer = setTimeout(() => resolve(data), 2000)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

const raw = await readStdin()
let input = {}
try {
  input = raw ? JSON.parse(raw) : {}
} catch {
  input = {}
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

if (!existsSync(join(projectDir, '.scratch', 'work-plan.json'))) process.exit(0)

const ratchet = join(projectDir, 'scripts', 'check-work-plan.mjs')
let out = ''
try {
  out = execFileSync(process.execPath, [ratchet, '--warn', '--log'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  out = `${error.stdout || ''}${error.stderr || ''}`
}

const report = out.trim()
if (report) {
  console.error(
    `${report}\n\n` +
      `Work-plan reconciliation (kael-work-router, observing only — not blocking). ` +
      `Deviations from a slice read-window are allowed and must be declared with a reason ` +
      `in the skill's Close block. Recheck: pnpm lint:workplan`,
  )
}

process.exit(0)
