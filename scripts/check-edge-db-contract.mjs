// Edge-to-database contract check. Deployed Edge code must not call a Postgres
// function the target database does not have; when it does, the endpoint 500s in
// production while every local gate stays green.
//
// The TypeScript AST scanner resolves literals, conditional branches, immutable
// local constants, and parameters whose complete call sites are statically known.
// It deliberately retains any expression with a dynamic or unobserved path as
// residue. The database half is supplied, not fetched, so this runs without
// credentials or network; `--emit-sql` prints the exact read-only query.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createRpcExpressionResolver } from './lib/edge-db-rpc-expression.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EDGE_ROOT = 'supabase/functions'
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__'])
const SOURCE_EXT = new Set(['.ts', '.mts'])
const RPC_NAME = /^[a-z][a-z0-9_]*$/
const rel = (file) => relative(root, file).split('\\').join('/')

function isSource(name) {
  if (!SOURCE_EXT.has(extname(name))) return false
  return !name.includes('.test.') && !name.endsWith('.d.ts')
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, acc)
    } else if (isSource(entry.name)) acc.push(full)
  }
  return acc
}

function scan(files) {
  const called = new Map()
  const unresolved = []
  const sourceFiles = files.map((file) => ts.createSourceFile(
    file,
    readFileSync(file, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ))
  const resolveRpcNames = createRpcExpressionResolver(sourceFiles)

  for (const sourceFile of sourceFiles) {
    const source = sourceFile.text
    if (sourceFile.parseDiagnostics.length) {
      for (const match of source.matchAll(/\.rpc(?:\?\.)?\s*\(/g)) {
        const site = `${rel(sourceFile.fileName)}:${source.slice(0, match.index).split('\n').length}`
        const expression = source.slice(match.index + match[0].length).split(/[\n,]/)[0].trim() || '…'
        unresolved.push({ site, expression: expression.slice(0, 256) })
      }
      continue
    }

    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'rpc') {
        const site = `${rel(sourceFile.fileName)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`
        const argument = node.arguments[0]
        const names = argument ? resolveRpcNames(argument) : null
        if (names?.length && names.every((name) => RPC_NAME.test(name))) {
          const how = ts.isStringLiteralLike(argument) ? 'literal' : 'resolved'
          for (const name of names) record(called, name, site, how)
        } else {
          unresolved.push({
            site,
            expression: argument?.getText(sourceFile).slice(0, 256) || '…',
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return { called, unresolved }
}

function record(called, name, site, how) {
  if (!RPC_NAME.test(name)) return
  const entry = called.get(name) ?? { sites: [], how }
  entry.sites.push(site)
  if (how === 'literal') entry.how = 'literal'
  called.set(name, entry)
}

function buildSql(names) {
  const list = names.map((name) => `'${name}'`).join(',')
  return `select c.name as missing_in_database
from (select unnest(array[${list}]::text[]) as name) c
where not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = c.name
)
order by 1;`
}

function parseArgs(values) {
  const options = { emitSql: false }
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index]
    if (flag === '--emit-sql') options.emitSql = true
    else if (flag === '--functions') options.functions = values[++index]
    else if (flag === '--json') options.json = true
    else throw new Error(`unknown argument: ${flag}`)
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const edgeDir = resolve(root, EDGE_ROOT)
if (!existsSync(edgeDir)) {
  console.error(`missing ${EDGE_ROOT}`)
  process.exit(1)
}

const { called, unresolved } = scan(walk(edgeDir, []))
const names = [...called.keys()].sort()

if (options.emitSql) {
  console.log(buildSql(names))
  process.exit(0)
}

// Residue is printed on every path so a partial scan cannot imply full coverage.
const residue = [...new Map(unresolved.map((item) => [item.site, item])).values()]
const summary = () => {
  const literal = [...called.values()].filter((entry) => entry.how === 'literal').length
  console.log(`rpc names found: ${names.length} (${literal} literal, ${names.length - literal} statically resolved)`)
  console.log(`unscannable call sites: ${residue.length}`)
  for (const item of residue) console.log(`  - ${item.site} calls .rpc(${item.expression}, …)`)
}

if (!options.functions) {
  summary()
  console.log('')
  console.log('no --functions given, so nothing was compared against a database.')
  console.log(`run \`node ${rel(resolve(root, 'scripts/check-edge-db-contract.mjs'))} --emit-sql\` and feed the result back with --functions.`)
  process.exit(0)
}

const raw = JSON.parse(readFileSync(resolve(root, options.functions), 'utf-8'))
const rows = Array.isArray(raw)
  ? raw
  : raw && typeof raw === 'object' && Array.isArray(raw.rows)
    ? raw.rows
    : raw && typeof raw === 'object' && Array.isArray(raw.result)
      ? raw.result
      : null
if (!rows) {
  console.error(`--functions file must contain an array of missing RPC rows: ${options.functions}`)
  process.exit(2)
}

const missing = []
for (const row of rows) {
  const name = typeof row === 'string' ? row : row?.missing_in_database
  if (typeof name !== 'string' || !RPC_NAME.test(name) || !called.has(name)) {
    console.error(`--functions file contains an invalid or unexpected missing RPC row: ${options.functions}`)
    process.exit(2)
  }
  missing.push(name)
}
const missingNames = [...new Set(missing)].sort()
if (options.json) {
  console.log(JSON.stringify({ called: names, missing: missingNames, unresolved: residue }, null, 2))
  process.exit(missingNames.length ? 1 : 0)
}

summary()
console.log('')
if (!missingNames.length) {
  console.log(`all ${names.length} scannable rpc names exist in the target database`)
  process.exit(0)
}
console.error(`edge code calls ${missingNames.length} function(s) the target database does not have:`)
for (const name of missingNames) {
  console.error(`  - ${name}`)
  for (const site of called.get(name).sites) console.error(`      ${site}`)
}
process.exitCode = 1
