import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

// Single entrypoint for every workspace script. The runners were PowerShell-only, which made the
// whole gate surface — lint, type-check, tests, skills, harness, design — unrunnable on Linux,
// macOS, and CI, so any agent not on Windows silently had no way to verify its own work.
// Windows keeps the byte-identical PowerShell invocation it always used; everything else gets the
// bash mirror.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// A runner is named either bare (`run-node` -> `scripts/run-node`) or as a repo-relative path
// (`docker/scripts/up`), so runners that live outside `scripts/` still dispatch through here and
// fail with their own name instead of a bare "powershell: not found".
function runnerBase(runner) {
  return runner.includes('/') ? runner : `scripts/${runner}`
}

export function prepareRunnerEnv(env = process.env, platform = process.platform, directoryExists = existsSync) {
  if (platform !== 'win32') return env

  const candidates = [
    env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin'),
    env.ProgramFiles && win32.join(env.ProgramFiles, 'Docker', 'Docker', 'resources', 'bin'),
    env.ProgramW6432 && win32.join(env.ProgramW6432, 'Docker', 'Docker', 'resources', 'bin'),
  ].filter((candidate) => candidate && directoryExists(candidate))
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.toLowerCase(), candidate])).values()]
  if (uniqueCandidates.length === 0) return env

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
  const currentPath = env[pathKey] ?? ''
  const pathDelimiter = platform === 'win32' ? ';' : delimiter
  const entries = currentPath ? currentPath.split(pathDelimiter) : []
  const seen = new Set(entries.map((entry) => entry.toLowerCase()))
  const additions = uniqueCandidates.filter((candidate) => !seen.has(candidate.toLowerCase()))
  if (additions.length === 0) return env

  return { ...env, [pathKey]: [...entries, ...additions].join(pathDelimiter) }
}

export function resolveInvocation(runner, forwarded, platform, repoRoot = root) {
  if (platform === 'win32') {
    const script = resolve(repoRoot, `${runnerBase(runner)}.ps1`)
    return {
      command: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...forwarded],
      script,
      kind: 'PowerShell',
    }
  }
  const script = resolve(repoRoot, `${runnerBase(runner)}.sh`)
  return { command: 'bash', args: [script, ...forwarded], script, kind: 'POSIX' }
}

function main() {
  const [runner, ...forwarded] = process.argv.slice(2)
  if (!runner) {
    console.error('usage: node scripts/run.mjs <runner> [args...]')
    return 2
  }

  const invocation = resolveInvocation(runner, forwarded, process.platform)
  if (!existsSync(invocation.script)) {
    console.error(`${runner} has no ${invocation.kind} runner at ${invocation.script}`)
    return 2
  }

  const result = spawnSync(invocation.command, invocation.args, {
    stdio: 'inherit',
    cwd: root,
    env: prepareRunnerEnv(),
  })
  if (result.error) {
    console.error(`${runner} could not start: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
