import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const TEST_ROOT = resolve(ROOT, 'supabase/tests')
const OUTPUT_ROOT = resolve(ROOT, '.scratch/staging-sql-verification')

export function prepareLinkedVerificationSql(testSql, seedSql) {
  if (/^\\/mu.test(testSql) || /\bdblink_(?:connect|send_query|disconnect)\b/u.test(testSql)) {
    return { eligible: false, reason: 'requires the local psql/dblink concurrency lane' }
  }
  if (!/^\s*begin\s*;/imu.test(testSql) || !/^\s*rollback\s*;/imu.test(testSql)) {
    return { eligible: false, reason: 'is not rollback-only' }
  }
  return {
    eligible: true,
    sql: testSql.replace(/^\s*begin\s*;/imu, (begin) => `${begin}\n\n${seedSql.trim()}\n`),
  }
}

function assertStagingLink() {
  const linkedRef = readFileSync(resolve(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
  if (linkedRef !== STAGING_REF) throw new Error('linked SQL verification is restricted to the registered Staging project')
}

function parseArgs(args) {
  const options = { include: null, stopOnFirstFailure: false }
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--stop-on-first-failure') {
      options.stopOnFirstFailure = true
      continue
    }
    if (key !== '--include') throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value) throw new Error('--include requires a comma-separated file list')
    options.include = new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))
  }
  return options
}

function resolveInsideRoot(value) {
  const path = resolve(ROOT, value)
  const local = relative(ROOT, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${value}`)
  return path
}

function run(options) {
  assertStagingLink()
  const seedSql = readFileSync(resolve(ROOT, 'supabase/seed.sql'), 'utf8')
  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const names = readdirSync(TEST_ROOT)
    .filter((name) => name.endsWith('.sql') && (!options.include || options.include.has(name)))
    .sort()
  if (options.include && names.length !== options.include.size) {
    const found = new Set(names)
    const missing = [...options.include].filter((name) => !found.has(name))
    throw new Error(`linked SQL verification file not found: ${missing.join(', ')}`)
  }

  const passed = []
  const failed = []
  const skipped = []
  for (const name of names) {
    const source = readFileSync(resolve(TEST_ROOT, name), 'utf8')
    const prepared = prepareLinkedVerificationSql(source, seedSql)
    if (!prepared.eligible) {
      skipped.push({ name, reason: prepared.reason })
      continue
    }
    const generated = resolveInsideRoot(`.scratch/staging-sql-verification/${name}`)
    writeFileSync(generated, prepared.sql)
    const result = spawnSync(process.execPath, [
      'scripts/run.mjs', 'run-supabase', 'db', 'query', '--linked',
      '--file', generated, '--output', 'json',
    ], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
    if (!result.error && result.status === 0) {
      passed.push(name)
      console.log(`PASS  ${name}`)
      continue
    }
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
    failed.push({ name, output })
    console.error(`FAIL  ${name}\n${output}`)
    if (options.stopOnFirstFailure) break
  }

  for (const entry of skipped) console.log(`SKIP  ${entry.name} (${entry.reason})`)
  console.log(`linked SQL verification: ${passed.length} passed / ${failed.length} failed / ${skipped.length} skipped / ${names.length} total`)
  if (failed.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run(parseArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
