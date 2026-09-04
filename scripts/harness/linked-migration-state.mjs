import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TARGETS = Object.freeze({
  staging: 'xyylanuyflrjzbjzhqfl',
  production: 'iwevizmsedyqozxlawwl',
})

export function parseLinkedMigrationList(value) {
  const migrations = []
  for (const line of value.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:\d{14})?\s*\|\s*(\d{14})\s*\|/u)
    if (match) migrations.push({ version: match[1] })
  }
  if (migrations.length === 0) throw new Error('linked migration list contained no remote versions')
  const versions = migrations.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length || versions.join('\n') !== [...versions].sort().join('\n')) {
    throw new Error('linked remote migration history is duplicate or out of order')
  }
  return migrations
}

function collect(options) {
  const expectedRef = TARGETS[options.environment]
  const linkedRef = readFileSync(resolve(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
  if (!expectedRef || linkedRef !== expectedRef) throw new Error('linked project does not match requested migration target')
  const result = spawnSync(process.execPath, [
    'scripts/run.mjs', 'run-supabase', 'migration', 'list', '--linked',
  ], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('linked migration list command failed')
  const migrations = parseLinkedMigrationList(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  return { environment: options.environment, projectRef: linkedRef, migrations }
}

function resolveInsideRoot(value) {
  const path = resolve(ROOT, value)
  const local = relative(ROOT, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${value}`)
  return path
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const environmentIndex = process.argv.indexOf('--environment')
    const outputIndex = process.argv.indexOf('--output')
    const environment = process.argv[environmentIndex + 1]
    const output = resolveInsideRoot(process.argv[outputIndex + 1])
    const state = collect({ environment })
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`)
    console.log(`linked migration state recorded: ${state.migrations.length} remote migrations`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
