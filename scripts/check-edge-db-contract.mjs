// Edge-to-database contract check. Deployed Edge code must not call a Postgres
// function the target database does not have; when it does, the endpoint 500s in
// production while every local gate stays green.
//
// Extraction runs in two passes because call sites come in two shapes:
//   client.rpc("name", args)   -> literal, resolved with certainty
//   client.rpc(rpcName, args)  -> identifier, resolved only when `const rpcName =`
//                                 sits in the same file (ternary chains included)
// A name arriving through a function parameter or an object property cannot be
// resolved this way. Those sites are counted and printed as residue: a partial
// scan reported as a full one would be silent degradation (governance/RULES.md #8).
//
// The database half is supplied, not fetched, so this runs with no credentials and
// no network. `--emit-sql` prints the query; feed its result back via `--functions`.

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
  const sourceFiles = files.map((file) => ts.createSourceFile(
    file,
    readFileSync(file, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ))
  const called = new Map()
  const unresolved = []
  const resolveRpcNames = createRpcExpressionResolver(sourceFiles)

  for (const sourceFile of sourceFiles) {
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'rpc') {
        const argument = node.arguments[0]
        const names = argument ? resolveRpcNames(argument) : null
        const site = `${rel(sourceFile.fileName)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`
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
  return `select c.name as name
from (select unnest(array[${list}]::text[]) as name) c
where exists (
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

// The residue is printed on every path, including the clean one. A scan that hides
// what it could not read teaches the reader it covered everything.
const residue = [...new Map(unresolved.map((item) => [item.site, item])).values()]
const summary = () => {
  const literal = [...called.values()].filter((entry) => entry.how === 'literal').length
  console.log(`rpc names found: ${names.length} (${literal} literal, ${names.length - literal} resolved from a local const)`)
  console.log(`unscannable call sites: ${residue.length}`)
  for (const item of residue) console.log(`  - ${item.site} calls .rpc(${item.expression}, …)`)
}

if (!options.functions) {
  summary()
  console.log('')
  console.log('no --functions given, so nothing was compared against a database.')
  console.log(`run \`node ${rel(resolve(root, 'scripts/check-edge-db-contract.mjs'))} --emit-sql\` and feed the result back with --functions.`)
  process.exit(residue.length ? 1 : 0)
}

const raw = JSON.parse(readFileSync(resolve(root, options.functions), 'utf-8'))
const rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.result ?? [])
const present = new Set(
  rows.map((row) => (typeof row === 'string' ? row : row.proname ?? row.name ?? row.routine_name)).filter(Boolean),
)
const missing = names.filter((name) => !present.has(name))
if (options.json) {
  console.log(JSON.stringify({ called: names, missing, unresolved: residue }, null, 2))
  process.exit(missing.length || residue.length ? 1 : 0)
}

summary()
console.log('')
if (!missing.length) {
  console.log(`all ${names.length} scannable rpc names exist in the target database`)
  process.exit(residue.length ? 1 : 0)
}
console.error(`edge code calls ${missing.length} function(s) the target database does not have:`)
for (const name of missing) {
  console.error(`  - ${name}`)
  for (const site of called.get(name).sites) console.error(`      ${site}`)
}
process.exitCode = 1
