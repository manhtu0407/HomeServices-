// Runner ratchet for the workspace script surface. Every `pnpm <script>` used to expand to a bare
// PowerShell invocation, so on Linux, macOS, and CI the entire gate surface — lint, type-check,
// tests, skills, harness, design — failed with "powershell: not found" and any agent off Windows
// had no way to verify its own work. scripts/run.mjs now dispatches by platform; this proves the
// dispatch stays wired, that Windows keeps the byte-identical invocation it always had, and that
// no script quietly reverts to calling a shell that only one platform has.
// Run via `pnpm runners:check`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveInvocation } from './run.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DISPATCH = /node scripts\/run\.mjs ([A-Za-z0-9._/-]+)/
// A runner with no POSIX mirror is a deliberate Windows-only dependency, not an oversight. The
// Docker stack is no longer one of them: its gate is a reachable image registry and a daemon
// (governance/protocols/test-pillars.md section "money and privilege invariants"), neither of which
// is a property of the shell, and CI already drives the Supabase CLI from bash.
const WINDOWS_ONLY = new Set(['run-mobile-web-production-preview', 'run-mobile-web-staging-preview'])

const problems = []
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts ?? {}
const runners = new Set()

const rootTurboConfig = readFileSync(resolve(root, 'turbo.json'), 'utf8').replaceAll('\r\n', '\n')
const canonicalTurboConfig = readFileSync(resolve(root, 'config/turbo/turbo.json'), 'utf8').replaceAll('\r\n', '\n')
if (rootTurboConfig !== canonicalTurboConfig) {
  problems.push('root turbo.json must remain line-ending-equivalent to config/turbo/turbo.json for CLI discovery')
}

for (const [name, command] of Object.entries(scripts)) {
  if (/powershell/i.test(command)) {
    problems.push(`package.json script \`${name}\` invokes PowerShell directly — route it through \`node scripts/run.mjs\``)
  }
  const match = DISPATCH.exec(command)
  if (match) runners.add(match[1])
}

if (!runners.size) problems.push('no package.json script dispatches through scripts/run.mjs')

for (const runner of [...runners].sort()) {
  const base = runner.includes('/') ? runner : `scripts/${runner}`
  if (!existsSync(resolve(root, `${base}.ps1`))) {
    problems.push(`runner \`${runner}\` has no PowerShell script at ${base}.ps1 — this regresses Windows`)
  }
  if (!existsSync(resolve(root, `${base}.sh`)) && !WINDOWS_ONLY.has(runner)) {
    problems.push(`runner \`${runner}\` has no POSIX script at ${base}.sh — it is unrunnable off Windows`)
  }
}

// The Windows branch cannot be executed from CI, so its argv is asserted instead. Any drift here
// changes what Tu's machine actually runs.
//
// resolveInvocation builds the script path with node:path resolve(), which is host-flavoured:
// the same simulated 'win32' call yields /repo/scripts/... on Linux and C:\repo\scripts\... on
// Windows. Comparing the whole string made this check pass only on the CI runner and fail on
// every Windows checkout — a parity gate that had no parity. The script path is therefore
// compared by suffix, and everything drift would actually change — the runner, the flags and
// their order, the extension, and the forwarded arguments — is still compared exactly.
const asPosix = (value) => value.split('\\').join('/')

const windows = resolveInvocation('run-node', ['scripts/x.mjs'], 'win32', '/repo')
const windowsArgs = windows.args.map(asPosix)
if (
  windows.command !== 'powershell'
  || JSON.stringify(windowsArgs.slice(0, 4)) !== JSON.stringify(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'])
  || !windowsArgs[4]?.endsWith('/repo/scripts/run-node.ps1')
  || JSON.stringify(windowsArgs.slice(5)) !== JSON.stringify(['scripts/x.mjs'])
) {
  problems.push(`win32 dispatch drifted from the historical invocation: ${windows.command} ${JSON.stringify(windowsArgs)}`)
}

const posix = resolveInvocation('run-node', ['scripts/x.mjs'], 'linux', '/repo')
const posixArgs = posix.args.map(asPosix)
if (
  posix.command !== 'bash'
  || !posixArgs[0]?.endsWith('/repo/scripts/run-node.sh')
  || JSON.stringify(posixArgs.slice(1)) !== JSON.stringify(['scripts/x.mjs'])
) {
  problems.push(`posix dispatch is wrong: ${posix.command} ${JSON.stringify(posixArgs)}`)
}

if (problems.length) {
  console.error('runner parity violations:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
const mirrored = [...runners].filter((runner) => !WINDOWS_ONLY.has(runner)).length
console.log(`runner parity ok: ${runners.size} runners dispatched, ${mirrored} cross-platform, ${runners.size - mirrored} Windows-only by declaration`)
