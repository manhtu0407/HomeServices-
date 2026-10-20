#!/usr/bin/env node
// Stop hook for kael-solve-conflict-maximize. Canonical: governance/protocols/solve-conflict-maximize.md.
// Blocks a stop (exit 2) only when a checker reports a blocking finding on the uncommitted change.
// Infrastructure failures allow the stop, so a broken checker cannot block every session.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { changedPathsFromPorcelainV1Z } from '../../scripts/lib/git-status.mjs'

const CHECKERS = ['scripts/check-test-integrity.mjs', 'scripts/check-added-source-hygiene.mjs']

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

function allowStop(note) {
  if (note) console.error(`[verify-test-integrity] ${note}`)
  process.exit(0)
}

await readStdin()

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()

let status = ''
try {
  status = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  allowStop('git unavailable; not blocking')
}
if (changedPathsFromPorcelainV1Z(status).length === 0) process.exit(0)

const blockers = []
for (const checker of CHECKERS) {
  let output = ''
  let code = 0
  try {
    output = execFileSync(process.execPath, [join(projectDir, checker), '--working'], {
      cwd: projectDir,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    code = typeof error.status === 'number' ? error.status : -1
    output = `${error.stdout || ''}${error.stderr || ''}`
  }
  if (code === 1) blockers.push(output.trim())
  else if (code !== 0) console.error(`[verify-test-integrity] ${checker} could not run (exit ${code}); not blocking on it`)
}

if (blockers.length === 0) process.exit(0)

console.error(
  `${blockers.join('\n\n')}\n\n` +
    'Blocking findings for kael-solve-conflict-maximize. Do not claim done. ' +
    'Fix the code instead of the test or gate; list any protected-surface change under ' +
    '"Gate or protected-surface changes"; put comments and watermarks nowhere in production source. ' +
    'Recheck: pnpm lint:test-integrity --working and pnpm lint:added-hygiene --working',
)
process.exit(2)
