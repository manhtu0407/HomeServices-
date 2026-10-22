// Runs one vitest file inside a scratch snapshot worktree and writes its log into the audit folder only.
// usage: node run-vitest.mjs <before|after> <test path relative to the worktree> <label> [KEY=VALUE ...]
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SNAPSHOT_DIRS, auditRoot } from './lib.mjs'

const [snapshot, testPath, label, ...pairs] = process.argv.slice(2)
if (!snapshot || !testPath || !label) {
  console.error('usage: node run-vitest.mjs <before|after> <test path> <label> [KEY=VALUE ...]')
  process.exit(2)
}
const cwd = SNAPSHOT_DIRS[snapshot]
const env = { ...process.env }
for (const pair of pairs) {
  const at = pair.indexOf('=')
  env[pair.slice(0, at)] = pair.slice(at + 1)
}
const command = `corepack pnpm --filter @nestscout/api exec vitest run ${testPath}`
const started = new Date().toISOString()
const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env })
const logDir = join(auditRoot, 'logs')
mkdirSync(logDir, { recursive: true })
writeFileSync(join(logDir, `${snapshot}-${label}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
appendFileSync(join(logDir, 'commands.jsonl'), `${JSON.stringify({
  utc: started, snapshot, label, cwd: '<snapshot-worktree>', command, exit: result.status,
  env_keys: pairs.map((pair) => pair.split('=')[0]),
})}\n`)
console.log(JSON.stringify({ snapshot, label, exit: result.status }))
process.exit(result.status === 0 ? 0 : 1)
