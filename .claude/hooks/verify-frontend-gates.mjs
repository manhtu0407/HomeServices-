#!/usr/bin/env node
// Stop hook — deterministic frontend gate for the Expo mobile app.
//
// When the agent tries to end a turn AND mobile code (.ts/.tsx/.js/.jsx under
// apps/mobile) has uncommitted changes, this re-runs the REAL gates
// (type-check + test). On a red gate it blocks the stop (exit 2) and tells the
// agent exactly what to fix — so "done" cannot be claimed while the frontend is
// broken. This turns the soft "No False Completion" rule (critical.md §3) into a
// rule the harness enforces, not one the model can choose to skip.
//
// Safety rails (must never brick a session):
//   - Honors `stop_hook_active`: if we already blocked once this chain, allow the
//     stop (no infinite loop).
//   - Fails OPEN on infrastructure problems (no git / no pnpm / deps not
//     installed): it blocks ONLY on a genuine gate failure, never on its own
//     inability to run.
//   - Acts only when mobile code actually changed; docs/chat/backend turns pass
//     through untouched.
//
// Verified by direct node execution (stop_hook_active / no-change / green /
// red / pnpm-missing scenarios). Live firing inside the Claude Code runtime
// depends on `node` + `pnpm` being on the hook's PATH there.

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    // Don't hang if the host sends nothing.
    const t = setTimeout(() => resolve(data), 2000)
    if (typeof t.unref === 'function') t.unref()
  })
}

function allowStop(note) {
  if (note) console.error(`[verify-frontend-gates] ${note}`)
  process.exit(0)
}

const raw = await readStdin()
let input = {}
try {
  input = raw ? JSON.parse(raw) : {}
} catch {
  // Malformed payload is an infra problem, not a gate failure → allow.
  allowStop('unreadable hook payload; not blocking')
}

// 1) Loop guard: never block a stop that our own block already triggered.
if (input.stop_hook_active) allowStop()

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

// 2) Did mobile code actually change? (staged or unstaged)
let status = ''
try {
  status = execSync('git status --porcelain -- apps/mobile', {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  allowStop('git unavailable; not blocking')
}
const mobileCodeChanged = status
  .split('\n')
  .some((line) => /apps\/mobile\/.*\.(ts|tsx|js|jsx)$/.test(line.trim()))
if (!mobileCodeChanged) process.exit(0)

// 3) Can we run the gate at all? If not, fail OPEN.
if (!existsSync(join(projectDir, 'apps', 'mobile', 'node_modules', '.bin', 'jest'))) {
  allowStop('mobile deps not installed; cannot verify, not blocking')
}
try {
  execSync('pnpm --version', { cwd: projectDir, stdio: 'ignore' })
} catch {
  allowStop('pnpm unavailable; cannot verify, not blocking')
}

// 4) Run the real gates. A non-zero exit here is a genuine red gate.
const gates = [
  ['type-check', 'pnpm --filter @home-services/mobile type-check'],
  ['test', 'pnpm --filter @home-services/mobile test'],
]
const failed = []
for (const [name, cmd] of gates) {
  try {
    execSync(cmd, { cwd: projectDir, stdio: ['ignore', 'ignore', 'ignore'] })
  } catch {
    failed.push(name)
  }
}

if (failed.length === 0) process.exit(0)

console.error(
  `Frontend gate RED for apps/mobile: ${failed.join(' + ')} failed. ` +
    `Do not claim done. Reproduce with: ` +
    failed
      .map((f) => `pnpm --filter @home-services/mobile ${f}`)
      .join(' && '),
)
process.exit(2)
