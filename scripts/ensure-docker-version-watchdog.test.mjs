// Execute the POSIX runner against a shell function, never a Docker daemon or updater.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bash = process.platform === 'win32'
  ? resolve(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
  : 'bash'

test('successful version probes retire watchdog children without retaining output pipes', () => {
  const fixture = `docker() {
  case "$*" in
    '--version') printf 'Docker version 29.7.2\\n' ;;
    'compose version') printf 'Docker Compose version v2.40.0\\n' ;;
    'desktop update --help') printf 'Usage: docker desktop update\\n' ;;
    'desktop update --quiet') sleep 0.05 ;;
    'compose pull --help') printf '%s\\n' '--policy' ;;
    'compose run --help') printf '%s\\n' '--pull' ;;
    *) return 99 ;;
  esac
}
`
  const script = readFileSync(resolve(root, 'docker/scripts/ensure-version.sh'), 'utf8').replace(/\r\n/gu, '\n')
  const result = spawnSync(bash, ['-s'], {
    cwd: root,
    input: fixture + script,
    encoding: 'utf8',
    // The script keeps its own 15-second watchdog; this only bounds Bash startup and cleanup on Windows.
    timeout: 30_000,
    windowsHide: true,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /strategy=latest-stable result=updated-or-current update_attempts=1/u)
  assert.equal(result.stderr, '')
})
