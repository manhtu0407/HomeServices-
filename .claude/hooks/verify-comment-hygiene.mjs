#!/usr/bin/env node
// Stop hook — deterministic comment-hygiene gate (kael-core-hygiene).
//
// When the agent tries to end a turn and scanned product or tooling code has
// uncommitted changes, this re-runs the ratchet linter
// on the current change only (`check-comment-discipline.mjs --working`). On a NEW
// violation it blocks the stop (exit 2) so "done" cannot be claimed while the
// agent left AI residue — dates, phase/status/plan/audit banners, "added by
// Claude/Codex", request narration, first-person change narration, bare TODOs.
// This turns kael-core-hygiene from a soft rule the model may skip into one the
// harness enforces. Canonical procedure: governance/protocols/code-hygiene.md.
//
// Safety rails (must never brick a session):
//   - Re-runs even when `stop_hook_active` is true: a prior blocked stop must not
//     become a bypass for still-dirty comments.
//   - Fails OPEN on infrastructure problems (no git, linter cannot run): it blocks
//     ONLY on a genuine violation (linter exit 1), never on its own failure.
//   - Acts only when code under the scanned roots changed; docs/chat/config turns
//     pass through untouched.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { changedPathsFromPorcelainV1Z } from '../../scripts/lib/git-status.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    const t = setTimeout(() => resolve(data), 2000)
    if (typeof t.unref === 'function') t.unref()
  })
}

const CODE_PATH_PATTERN = /^(apps|packages|supabase\/functions|scripts|\.claude\/hooks)\/.*\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

function allowStop(note) {
  if (note) console.error(`[verify-comment-hygiene] ${note}`)
  process.exit(0)
}

const raw = await readStdin()
let input = {}
try {
  input = raw ? JSON.parse(raw) : {}
} catch {
  allowStop('unreadable hook payload; not blocking')
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

// 1) Did code under the scanned roots change? (staged or unstaged)
let status = ''
try {
  status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--', 'apps', 'packages', 'supabase/functions', 'scripts', '.claude/hooks'],
    {
      cwd: projectDir,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
} catch {
  allowStop('git unavailable; not blocking')
}
const codeChanged = changedPathsFromPorcelainV1Z(status)
  .some((path) => CODE_PATH_PATTERN.test(path))
if (!codeChanged) process.exit(0)

// 2) Run the ratchet linter on the current change only.
const linter = join(projectDir, 'scripts', 'check-comment-discipline.mjs')
let code = 0
let out = ''
try {
  out = execFileSync(process.execPath, [linter, '--working'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (e) {
  code = typeof e.status === 'number' ? e.status : -1
  out = `${e.stdout || ''}${e.stderr || ''}`
}

// exit 0 clean · 1 violations · 2 (or other) infra failure → fail open.
if (code === 0) process.exit(0)
if (code !== 1) allowStop(`linter could not run (exit ${code}); not blocking`)

console.error(
  `${out.trim()}\n\n` +
    `Comment-hygiene RED for this change (kael-core-hygiene). Do not claim done. ` +
    `Move dates/phase/status/plan/audit banners, AI attribution, and first-person ` +
    `narration out of the source (git commit message + docs/). ` +
    `Recheck: pnpm lint:comments --working`,
)
process.exit(2)
