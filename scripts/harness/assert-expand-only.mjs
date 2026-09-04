import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertReleaseTarget,
  auditExpandOnlyMigration,
  pendingMigrationEntries,
} from './release-safety.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function buildExpandOnlyReceipt(input) {
  const target = assertReleaseTarget(input)
  const pending = pendingMigrationEntries(input.inventory, input.hostedMigrations)
  const migrationObjectPreconditions = normalizeMigrationObjectPreconditions(
    input.migrationObjectPreconditions,
  )
  const problems = []
  const migrations = pending.map((entry) => {
    const path = resolveInsideRoot(input.root ?? ROOT, entry.file)
    const sql = readFileSync(path, 'utf8')
    const migrationProblems = auditExpandOnlyMigration(sql, { migrationObjectPreconditions })
    problems.push(...migrationProblems.map((problem) => `${entry.file}: ${problem}`))
    return {
      file: entry.file,
      sha256: createHash('sha256').update(sql).digest('hex'),
      version: entry.version,
    }
  })
  if (problems.length) throw new Error(`expand-only migration gate failed:\n${problems.join('\n')}`)
  return {
    schemaVersion: '1.2.0',
    environment: target.environment,
    projectRef: target.projectRef,
    hostedWatermark: input.hostedMigrations.at(-1)?.version ?? null,
    pendingWatermark: migrations.at(-1)?.version ?? null,
    pendingMigrations: migrations,
    migrationObjectPreconditions,
    auditSha256: createHash('sha256').update(JSON.stringify({
      migrations,
      migrationObjectPreconditions,
    })).digest('hex'),
  }
}

function normalizeMigrationObjectPreconditions(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('migration object preconditions are invalid')
  const normalized = value.map((item) => {
    const row = {
      object_kind: String(item?.object_kind ?? ''),
      schema_name: String(item?.schema_name ?? ''),
      relation_name: String(item?.relation_name ?? ''),
      object_name: String(item?.object_name ?? ''),
      exists: item?.exists,
      definition: item?.definition == null ? null : String(item.definition),
    }
    if (!new Set(['constraint', 'trigger']).has(row.object_kind) ||
        !/^[a-z_][a-z0-9_]*$/u.test(row.schema_name) ||
        !/^[a-z_][a-z0-9_]*$/u.test(row.relation_name) ||
        !/^[a-z_][a-z0-9_]*$/u.test(row.object_name) ||
        typeof row.exists !== 'boolean' ||
        (row.object_kind === 'trigger' && row.definition !== null) ||
        (row.object_kind === 'constraint' && row.exists && !/^CHECK\s*\(/u.test(row.definition ?? '')) ||
        (!row.exists && row.definition !== null)) {
      throw new Error('migration object preconditions are invalid')
    }
    return row
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  if (new Set(normalized.map((item) => `${item.object_kind}:${item.schema_name}.${item.relation_name}:${item.object_name}`)).size !== normalized.length) {
    throw new Error('migration object preconditions contain duplicates')
  }
  return normalized
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (['--environment', '--project-ref', '--project-url', '--inventory', '--hosted', '--output'].includes(key)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
      options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
    } else throw new Error(`unknown argument: ${key}`)
  }
  return options
}

function resolveInsideRoot(root, inputPath) {
  const path = resolve(root, inputPath)
  const local = relative(root, path)
  if (!local || local.startsWith('..')) throw new Error(`path escapes repository root: ${inputPath}`)
  return path
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const required of ['environment', 'projectRef', 'projectUrl', 'hosted', 'output']) {
    if (!options[required]) throw new Error(`--${required.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required`)
  }
  const inventory = JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.inventory ?? 'config/harness/migration-inventory.json'), 'utf8'))
  const hosted = JSON.parse(readFileSync(resolveInsideRoot(ROOT, options.hosted), 'utf8'))
  const receipt = buildExpandOnlyReceipt({
    environment: options.environment,
    hostedMigrations: hosted.migrations,
    migrationObjectPreconditions: hosted.migrationObjectPreconditions,
    inventory,
    projectRef: options.projectRef,
    projectUrl: options.projectUrl,
    root: ROOT,
  })
  const output = resolveInsideRoot(ROOT, options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`expand-only gate ok: ${receipt.pendingMigrations.length} pending migration(s)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
