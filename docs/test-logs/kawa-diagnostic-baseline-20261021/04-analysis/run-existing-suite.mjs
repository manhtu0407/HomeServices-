import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const [snapshot, label, ...extra] = process.argv.slice(2)
const worktree = snapshot === 'before' ? 'C:/ns-diag/before' : 'C:/ns-diag/after'
mkdirSync(join(root, '06-existing-suites'), { recursive: true })
const json = join(root, '06-existing-suites', `${snapshot}-${label}.vitest.json`).split('\\').join('/')
const command = [
  'corepack pnpm --filter @nestscout/api exec vitest run',
  '--exclude "**/kael-edge-runtime/diag/**"',
  `--reporter=json --outputFile="${json}"`,
  ...extra,
].join(' ')
const started = new Date().toISOString()
const result = spawnSync(command, { cwd: worktree, shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
writeFileSync(join(root, 'logs', `${snapshot}-existing-${label}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
appendFileSync(join(root, 'logs', 'commands.jsonl'), `${JSON.stringify({ utc: started, label: `existing-${label}`, snapshot, cwd: worktree, command, exit: result.status, out: json })}\n`)
console.log(JSON.stringify({ snapshot, label, exit: result.status }))
