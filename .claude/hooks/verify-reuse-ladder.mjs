#!/usr/bin/env node
// Stop hook — reuse-ladder observer (karpathy-guidelines: Reuse-Before-Build Ladder).
//
// When the agent tries to end a turn, this counts newly exported functions/consts/classes
// in the uncommitted change and prints a reminder if any exist. It NEVER blocks: whether a
// real reuse search happened is not something a git diff can prove, so turning this into a
// hard gate would just be a wrong-threshold hook waiting to get switched off — the same
// reasoning verify-work-plan.mjs already applies to its own router thresholds.
//
// The binding half of the rule lives where it can be read rather than measured:
// karpathy-guidelines/SKILL.md's "Reuse check" prompt field, governance/skills.md's
// Reuse-Before-Build Ladder, and the No False Completion gate in governance/critical.md
// section 3. This hook only observes and logs, for future calibration.
//
// Safety rails (must never brick a session):
//   - Always exits 0, including on its own failure.
//   - Silent when nothing new was exported this turn.

import { execFileSync } from 'node:child_process'
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

const checker = join(projectDir, 'scripts', 'check-reuse-ladder.mjs')
let out = ''
try {
  out = execFileSync(process.execPath, [checker, '--working', '--log'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  out = `${error.stdout || ''}${error.stderr || ''}`
}

const report = out.trim()
if (report) console.error(report)

process.exit(0)
