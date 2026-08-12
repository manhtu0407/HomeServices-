import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const ROOT = resolve(__dirname, '../../../../../')
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations')

// Migrations use every accepted spelling: bare `create table jobs`, `if not exists`, and an
// optional schema qualifier. Matching only the fully-qualified form silently skips a third of
// the schema, so both the qualifier and the `if not exists` clause stay optional here.
const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi
const DROP_TABLE = /drop\s+table\s+(?:if\s+exists\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi

const readText = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')

const migrationSql = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readText(resolve(MIGRATIONS_DIR, name)))
    .join('\n')

// An unqualified `create table x` lands in `public` under the migration search_path, so it
// counts; anything explicitly in another schema (private.*) never reaches Database['public'].
const publicTableNames = (sql: string, pattern: RegExp) => {
  const names = new Set<string>()
  for (const [, schema, table] of sql.matchAll(pattern)) {
    if (schema === undefined || schema.toLowerCase() === 'public') names.add(table)
  }
  return names
}

const migrationPublicTables = () => {
  const sql = migrationSql()
  const live = publicTableNames(sql, CREATE_TABLE)
  for (const dropped of publicTableNames(sql, DROP_TABLE)) live.delete(dropped)
  return live
}

const generatedPublicTables = () => {
  const names = new Set<string>()
  let section: string | null = null
  for (const line of readGeneratedDatabaseTypes().split('\n')) {
    const header = line.match(/^ {4}([A-Za-z]+): \{/)
    if (header) section = header[1]
    else if (section === 'Tables') {
      const key = line.match(/^ {6}([a-zA-Z0-9_]+): \{/)
      if (key) names.add(key[1])
    }
  }
  return names
}

const sortedDiff = (left: Set<string>, right: Set<string>) =>
  [...left].filter((name) => !right.has(name)).sort()

describe('generated database types stay aligned with migrations', () => {
  it('reports every public table that migrations create but the generated types omit', () => {
    expect(sortedDiff(migrationPublicTables(), generatedPublicTables())).toEqual([])
  })

  it('reports every generated public table that no live migration creates', () => {
    expect(sortedDiff(generatedPublicTables(), migrationPublicTables())).toEqual([])
  })

  it('parses a table set large enough to prove the scan reached the whole migration folder', () => {
    expect(migrationPublicTables().size).toBeGreaterThanOrEqual(90)
    expect(generatedPublicTables().size).toBe(migrationPublicTables().size)
  })
})
