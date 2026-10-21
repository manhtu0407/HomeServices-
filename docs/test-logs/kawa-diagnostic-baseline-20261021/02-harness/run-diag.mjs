import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const evidenceRoot = resolve(here, '..')
const [snapshot, matrixPath, outPath, testFile, only = '', repeats = '2', label = 'run'] = process.argv.slice(2)
if (!snapshot || !matrixPath || !outPath || !testFile) {
  console.error('usage: node run-diag.mjs <before|after> <matrix.json> <out.json> <testFile> [only-ids] [repeats] [label]')
  process.exit(2)
}

const worktree = snapshot === 'before' ? 'C:/ns-diag/before' : 'C:/ns-diag/after'
const diagDir = join(worktree, 'apps/api/src/__tests__/kael-edge-runtime/diag')
mkdirSync(diagDir, { recursive: true })
for (const stale of ['kawa-bringup-pillar.test.ts']) rmSync(join(diagDir, stale), { force: true })

const files = ['diag-support.ts', 'kawa-diag-matrix-pillar.test.ts', 'kawa-diag-journey-pillar.test.ts', 'kawa-diag-h5-pillar.test.ts', 'kawa-diag-h5-probes-pillar.test.ts']
const copied = {}
for (const file of files) {
  const source = join(here, file)
  if (!existsSync(source)) continue
  copyFileSync(source, join(diagDir, file))
  copied[file] = createHash('sha256').update(readFileSync(source)).digest('hex')
}

const matrixBytes = readFileSync(matrixPath)
const matrixSha = createHash('sha256').update(matrixBytes).digest('hex')
const logDir = join(evidenceRoot, 'logs')
mkdirSync(logDir, { recursive: true })
const logFile = join(logDir, `${snapshot}-${label}.log.txt`)
const command = `corepack pnpm --filter @nestscout/api exec vitest run src/__tests__/kael-edge-runtime/diag/${testFile}`
const started = new Date().toISOString()
const result = spawnSync(command, {
  cwd: worktree,
  shell: true,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: {
    ...process.env,
    KAWA_DIAG_MATRIX: matrixPath.replace(/\\/g, '/'),
    KAWA_DIAG_MATRIX_SHA: matrixSha,
    KAWA_DIAG_SNAPSHOT: snapshot,
    KAWA_DIAG_OUT: outPath.replace(/\\/g, '/'),
    KAWA_DIAG_ONLY: only,
    KAWA_DIAG_REPEATS: repeats,
    KAWA_DIAG_H5_ROWS: process.env.KAWA_DIAG_H5_ROWS ?? '',
    KAWA_DIAG_H5_ROWS_SHA: process.env.KAWA_DIAG_H5_ROWS_SHA ?? '',
  },
})
writeFileSync(logFile, `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
const record = {
  utc: started,
  label,
  snapshot,
  cwd: worktree,
  command,
  exit: result.status,
  matrix_sha256: matrixSha,
  harness_file_sha256: copied,
  log: logFile.replace(/\\/g, '/'),
  out: outPath,
}
appendFileSync(join(logDir, 'commands.jsonl'), `${JSON.stringify(record)}\n`)
console.log(JSON.stringify({ exit: result.status, log: record.log, out: outPath }))
process.exit(result.status === 0 ? 0 : 1)
