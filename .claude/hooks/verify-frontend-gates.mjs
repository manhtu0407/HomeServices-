#!/usr/bin/env node
// Stop hook — deterministic frontend gate for the Expo mobile app.
//
// When the agent tries to end a turn AND mobile code (.ts/.tsx/.js/.jsx under
// apps/mobile) has uncommitted changes, this re-runs the REAL gates
// (type-check + test). On a red gate it blocks the stop (exit 2) and tells the
// agent exactly what to fix — so "done" cannot be claimed while the frontend is
// broken. This turns the soft "No False Completion" rule (governance/critical.md §3) into a
// rule the harness enforces, not one the model can choose to skip.
//
// Safety rails (must never brick a session):
//   - Re-runs even when `stop_hook_active` is true. That payload means a prior
//     stop was blocked; it must not become a bypass for still-red gates.
//   - Fails OPEN on infrastructure problems (no git / no pnpm / deps not
//     installed): it blocks ONLY on a genuine gate failure, never on its own
//     inability to run.
//   - Acts only when mobile code or gate-relevant mobile config changed;
//     docs/chat/backend turns pass through untouched.
//
// Verified through scripts/run-node.ps1 so the bundled Codex Node runtime is on
// PATH before this hook invokes pnpm/package binaries.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { changedPathsFromPorcelainV1Z } from '../../scripts/lib/git-status.mjs'

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

const MOBILE_GATE_PATH_PATTERN =
  /^apps\/mobile\/(?:.*\.(?:ts|tsx|mts|cts|js|jsx|json|mjs|cjs)|package\.json|tsconfig(?:\.[^/]*)?\.json|jest\.config\.[cm]?js|jest\.setup\.ts|babel\.config\.[cm]?js|metro\.config\.[cm]?js|eslint\.config\.[cm]?js|app\.config\.(?:ts|js)|app\.json|eas\.json)$/

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

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()

// 1) Did mobile code or gate-relevant config actually change? (staged or unstaged)
let status = ''
try {
  status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--', 'apps/mobile'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  allowStop('git unavailable; not blocking')
}
const mobileCodeChanged = changedPathsFromPorcelainV1Z(status)
  .some((path) => MOBILE_GATE_PATH_PATTERN.test(path))
if (!mobileCodeChanged) process.exit(0)

// 2) Can we run the gate at all? If not, fail OPEN.
const mobileBinDir = join(projectDir, 'apps', 'mobile', 'node_modules', '.bin')
if (!['jest', 'tsc'].every((binary) => existsSync(join(mobileBinDir, binary)))) {
  allowStop('mobile deps not installed; cannot verify, not blocking')
}
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const powerShellArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']
try {
  const pnpmProbe = [
    '$command = Get-Command pnpm.cmd, pnpm -ErrorAction SilentlyContinue | Select-Object -First 1',
    'if (-not $command) { exit 1 }',
    '& $command.Source --version',
    'exit $LASTEXITCODE',
  ].join('; ')
  execFileSync(powershell, [...powerShellArgs, '-Command', pnpmProbe], {
    cwd: projectDir,
    stdio: 'ignore',
  })
} catch {
  allowStop('pnpm unavailable; cannot verify, not blocking')
}

// 3) Run the real gates. A non-zero exit here is a genuine red gate.
const gateRunner = join(projectDir, 'scripts', 'run-package-script.ps1')
if (!existsSync(gateRunner)) allowStop('package gate runner is missing; not blocking')
const gates = [
  ['type-check', 'type-check'],
  ['test', 'test'],
]
const failed = []
for (const [name, packageScript] of gates) {
  try {
    execFileSync(powershell, [...powerShellArgs, '-File', gateRunner, '@nestscout/mobile', packageScript], {
      cwd: projectDir,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  } catch {
    failed.push(name)
  }
}

if (failed.length === 0) process.exit(0)

console.error(
  `Frontend gate RED for apps/mobile: ${failed.join(' + ')} failed. ` +
    `Do not claim done. Reproduce with: ` +
    failed
      .map((f) => `pnpm ${f === 'type-check' ? 'type-check:mobile' : 'test:mobile'}`)
      .join(' && '),
)
process.exit(2)
