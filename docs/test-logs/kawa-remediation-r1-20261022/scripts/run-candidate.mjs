// Runs one vitest file in the remediation worktree with the frozen diagnostic harness injected for the run only.
// The injected files are hash-checked against the frozen record, then removed, so the candidate diff never carries them.
// usage: node run-candidate.mjs <label> <test path relative to apps/api> [KEY=VALUE ...]
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const evidenceRoot = resolve(here, '..')
export const WORKTREE = process.env.KAWA_R1_WORKTREE ?? 'C:/ns-fix/r1'
export const BASELINE = process.env.KAWA_BASELINE_DIR ?? ''
export const AUDIT = process.env.KAWA_AUDIT_DIR ?? ''
if (!BASELINE) throw new Error('set KAWA_BASELINE_DIR to docs/test-logs/kawa-diagnostic-baseline-20261021 of the diagnostic branch (and KAWA_AUDIT_DIR to docs/test-logs/kawa-diagnostic-audit-20261022 for the handler drivers)')

export const FROZEN_SHA = {
  'scenario-matrix.json': 'dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7',
  'diag-support.ts': 'ed5770514c61effafa360af670fa3c633feaf3a56287540dfdf1512a104c9f72',
  'kawa-diag-matrix-pillar.test.ts': 'f9f61e2b3aa079d58501407bede0f42bf05cc472700d033438f0009fe8a26a75',
  'kawa-diag-journey-pillar.test.ts': '2e9de0780ff9fb68b56e5fa8630b3eb38db9c00273fc7463ec58778c871fb087',
  'supplementary-matrix.json': 'a657eb4f61be4fe8ce7a16e0312de63acc916d868229551fab76c741cbf5d20c',
}

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

export function injectHarness({ withAudit }) {
  const diagDir = join(WORKTREE, 'apps/api/src/__tests__/kael-edge-runtime/diag')
  const auditDir = join(WORKTREE, 'apps/api/src/__tests__/kael-edge-runtime/audit')
  const injected = []
  const harnessFiles = ['diag-support.ts', 'kawa-diag-matrix-pillar.test.ts', 'kawa-diag-journey-pillar.test.ts']
  mkdirSync(diagDir, { recursive: true })
  for (const file of harnessFiles) {
    const source = join(BASELINE, '02-harness', file)
    const actual = sha256(source)
    if (actual !== FROZEN_SHA[file]) throw new Error(`frozen harness hash mismatch for ${file}: ${actual}`)
    copyFileSync(source, join(diagDir, file))
    injected.push({ target: join(diagDir, file), sha256: actual })
  }
  if (withAudit) {
    mkdirSync(auditDir, { recursive: true })
    const sourceDir = join(AUDIT, 'scripts/worktree')
    const ownDir = join(evidenceRoot, 'scripts/worktree')
    for (const dir of [sourceDir, ownDir]) {
      if (!existsSync(dir)) continue
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.test.ts'))) {
        copyFileSync(join(dir, file), join(auditDir, file))
        injected.push({ target: join(auditDir, file), sha256: sha256(join(dir, file)) })
      }
    }
  }
  return { injected, diagDir, auditDir }
}

export function removeHarness(state) {
  for (const entry of state.injected) rmSync(entry.target, { force: true })
  for (const dir of [state.diagDir, state.auditDir]) {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true })
  }
}

export function run({ label, testPath, env = {}, withAudit = false, matrix = 'scenario-matrix.json' }) {
  const matrixPath = matrix === 'scenario-matrix.json' ? join(BASELINE, '01-freeze/scenario-matrix.json') : join(BASELINE, '02-harness', matrix)
  const matrixSha = sha256(matrixPath)
  if (matrixSha !== FROZEN_SHA[matrix]) throw new Error(`frozen matrix hash mismatch for ${matrix}: ${matrixSha}`)
  const state = injectHarness({ withAudit })
  const logDir = join(evidenceRoot, 'logs')
  mkdirSync(logDir, { recursive: true })
  const command = `corepack pnpm --filter @nestscout/api exec vitest run ${testPath}`
  const started = new Date().toISOString()
  try {
    const result = spawnSync(command, {
      cwd: WORKTREE,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: {
        ...process.env,
        KAWA_DIAG_MATRIX: matrixPath,
        KAWA_DIAG_MATRIX_SHA: matrixSha,
        KAWA_DIAG_SNAPSHOT: label,
        KAWA_DIAG_REPEATS: process.env.KAWA_DIAG_REPEATS ?? '2',
        KAWA_DIAG_ONLY: '',
        ...env,
      },
    })
    writeFileSync(join(logDir, `${label}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
    appendFileSync(join(logDir, 'commands.jsonl'), `${JSON.stringify({
      utc: started,
      label,
      cwd: '<remediation-worktree>',
      head: spawnSync('git rev-parse HEAD', { cwd: WORKTREE, shell: true, encoding: 'utf8' }).stdout.trim(),
      command,
      exit: result.status,
      matrix_sha256: matrixSha,
      env_keys: Object.keys(env),
      injected_sha256: Object.fromEntries(state.injected.map((entry) => [entry.target.split('/').pop(), entry.sha256])),
    })}\n`)
    return result.status
  } finally {
    removeHarness(state)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [label, testPath, ...pairs] = process.argv.slice(2)
  if (!label || !testPath) {
    console.error('usage: node run-candidate.mjs <label> <test path relative to apps/api> [KEY=VALUE ...] [--audit]')
    process.exit(2)
  }
  const env = {}
  let withAudit = false
  for (const pair of pairs) {
    if (pair === '--audit') { withAudit = true; continue }
    const at = pair.indexOf('=')
    env[pair.slice(0, at)] = pair.slice(at + 1)
  }
  const exit = run({ label, testPath, env, withAudit })
  console.log(JSON.stringify({ label, exit }))
  process.exit(exit === 0 ? 0 : 1)
}
