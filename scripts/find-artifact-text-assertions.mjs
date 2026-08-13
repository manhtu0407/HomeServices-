#!/usr/bin/env node
// Ratchet against tests that read an artifact as text and assert a substring is
// present. Matching a string inside a .sql migration proves the file contains the
// string; it does not prove the migration ran, that a later migration did not drop
// the object, or that Postgres rejects a bad row. The same holds for a committed
// .md: the doc saying a boundary exists is not the boundary.
//
// Reading text stays correct for claims that are ABOUT text, so those are allowed:
// application source (.ts/.tsx/.mjs — the shipped artifact), config the runtime
// actually loads, generated database types, and negative scans for committed
// secrets. Negative matchers (`.not.toContain`) are always allowed: a
// contamination scan is a claim about text by construction.
//
// Detection is taint-based, not name-based. Four successive hand-written sweeps
// each missed a different way of naming the same thing — file-level instead of
// case-level classification, `function readMigrations()` instead of `const x =`,
// paths built from constants, and bindings derived from a tainted variable
// (`const body = migration.match(...)`). Each rule below exists because one of
// those got through.
//
// Modes:
//   node scripts/find-artifact-text-assertions.mjs          exit 1 on any banned hit
//   node scripts/find-artifact-text-assertions.mjs --warn    report but exit 0
//
// Zero runtime deps.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['apps/api/src', 'packages/shared/src', 'apps/mobile']
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.expo',
  'coverage', '.turbo', 'ios', 'android',
])
const IS_TEST = /(\.test\.tsx?|-test\.tsx?)$/
const rel = (file) => relative(root, file).split('\\').join('/')

function walk(dir, acc) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), acc)
    } else if (IS_TEST.test(entry.name)) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

// A path fragment is rarely a single literal; it is assembled from constants and
// helpers. Everything below resolves the expression back to something path-like
// before it is classified.
const STRING_LITERAL = /['"`]([^'"`\n]*)['"`]/g
const CONST_DECL = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/
const READ_CALL = /\breadFileSync\s*\(/g

function literalsOf(text) {
  return [...text.matchAll(STRING_LITERAL)].map((m) => m[1]).filter(Boolean)
}

function constantMap(lines) {
  const map = new Map()
  for (const line of lines) {
    const match = CONST_DECL.exec(line)
    if (!match) continue
    const [, name, rhs] = match
    if (rhs.includes('readFileSync')) continue
    const parts = literalsOf(rhs)
    if (parts.length) map.set(name, parts.join('/'))
  }
  return map
}

function substitute(expression, constants) {
  let current = expression
  for (let pass = 0; pass < 5; pass += 1) {
    let next = current
    for (const [name, value] of constants) {
      next = next.split(new RegExp(`\\b${name}\\b`)).join(value)
    }
    if (next === current) break
    current = next
  }
  return current.toLowerCase()
}

// A declaration ends where its brackets balance — but only if the next line does
// not continue the chain. A fixed look-ahead window bleeds into the following
// declaration and taints a source binding with the SQL read that comes after it;
// stopping at the first balanced line cuts `.filter().map()` in half and misses
// the read entirely.
function declarationChunk(lines, start) {
  const chunk = []
  let depth = 0
  let opened = false
  for (let i = start; i < Math.min(start + 40, lines.length); i += 1) {
    chunk.push(lines[i])
    for (const char of lines[i]) {
      if ('([{'.includes(char)) {
        depth += 1
        opened = true
      } else if (')]}'.includes(char)) {
        depth -= 1
      }
    }
    const next = (lines[i + 1] ?? '').trimStart()
    const continues = next.startsWith('.') || /[=+?:,]$/.test(lines[i].trimEnd())
    if (depth <= 0 && !continues && (opened || i > start)) break
  }
  return chunk.join('\n')
}

// `const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')` hides every later
// read behind a one-word call, so the helper has to be recognised as a reader.
function readerHelpers(lines) {
  const helpers = new Set()
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\s*(?:const|function)\s+([A-Za-z_$][\w$]*)\s*[=(]/.exec(lines[i])
    if (!match) continue
    if (lines.slice(i, i + 6).join('\n').includes('readFileSync')) helpers.add(match[1])
  }
  return helpers
}

function callArguments(chunk, names) {
  const found = []
  for (const name of names) {
    const pattern = new RegExp(`\\b${name}\\s*\\(([^;)]{0,200})`, 'g')
    for (const match of chunk.matchAll(pattern)) found.push(match[1])
  }
  READ_CALL.lastIndex = 0
  let match
  while ((match = READ_CALL.exec(chunk)) !== null) {
    found.push(chunk.slice(match.index, match.index + 300))
  }
  return found
}

// Reading out of the migrations directory is enough to classify: the file name
// is often picked at runtime by `readdirSync(...).find(...)`, so the resolved
// expression carries the directory but never the `.sql` suffix.
//
// Not every .md is prose. The Kael charter is loaded into the Edge system prompt
// and served by the public /kael/charter route, so its markdown is shipped
// content and asserting it is no different from asserting source. Only markdown
// that lives in the documentation trees is treated as a doc.
const DOC_TREES = ['docs/', 'governance/', 'readme.md', 'claude.md', 'agents.md', 'document.md']

function classify(path) {
  if (path.includes('supabase/tests')) return 'executed-sql'
  if (path.includes('seed.sql')) return 'seed'
  if (path.includes('migrations')) return 'migration'
  if (path.includes('.sql')) return 'sql'
  if (path.includes('.md') && DOC_TREES.some((tree) => path.includes(tree))) return 'doc'
  return 'allowed'
}

const BANNED = new Set(['migration', 'seed', 'sql', 'doc'])
const SEVERITY = { migration: 'banned', seed: 'banned', sql: 'banned', doc: 'banned', 'executed-sql': 'warn' }

const CASE_START = /^\s*(it|test)\s*(\.\s*\w+[^\n]*?)?\s*[(`]/
const POSITIVE_ASSERT =
  /expect\s*\(\s*([^\n]{0,200}?)\s*\)\s*((?:\.\s*not)?)\s*\.\s*(toContain|toMatch|toBe|toEqual|toStrictEqual|toBeGreaterThan|toBeTruthy)\s*\(\s*([^\n]{0,60})/g
const WHOLE_VALUE = new Set(['toBe', 'toEqual', 'toStrictEqual'])

// One flat map per file marks a binding tainted everywhere, so a `const script`
// inside one case inherits the verdict of an unrelated `const script` in another.
// Bindings are collected per scope instead: file-level declarations start at
// column zero, case-level ones are indented and live only inside their block.
function collectTaint(lines, indices, constants, helpers, inherited) {
  const tainted = new Map(inherited)
  for (const i of indices) {
    const match = CONST_DECL.exec(lines[i])
    if (!match) continue
    const chunk = declarationChunk(lines, i)
    const args = callArguments(chunk, helpers)
    if (!args.length) continue
    const kind = classify(args.map((arg) => substitute(arg, constants)).join(' '))
    if (kind !== 'allowed') tainted.set(match[1], kind)
  }

  // A tainted binding is usually sliced before it is asserted; the slice carries
  // the same text, so it carries the same verdict.
  for (let pass = 0; pass < 4; pass += 1) {
    let grew = false
    for (const i of indices) {
      const match = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\./.exec(lines[i])
      if (match && tainted.has(match[2]) && !tainted.has(match[1])) {
        tainted.set(match[1], tainted.get(match[2]))
        grew = true
      }
    }
    if (!grew) break
  }
  return tainted
}

// Running a case block to wherever the next one starts sweeps up the describe
// closers and any helper declared after the last case, and their assertions then
// get blamed on that case. The closer sits at the same indent as the opener.
function caseEnd(lines, start, limit) {
  const indent = /^\s*/.exec(lines[start])[0].length
  for (let i = start + 1; i < limit; i += 1) {
    const own = /^\s*/.exec(lines[i])[0].length
    if (own <= indent && /^\}\)/.test(lines[i].trim())) return i + 1
  }
  return limit
}

function analyse(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const constants = constantMap(lines)
  const helpers = readerHelpers(lines)
  const imported = new Set(
    lines
      .filter((line) => /^\s*import\s/.test(line))
      .flatMap((line) => line.match(/[A-Za-z_$][\w$]*/g) ?? []),
  )

  const starts = []
  for (let i = 0; i < lines.length; i += 1) if (CASE_START.test(lines[i])) starts.push(i)
  const firstCase = starts.length ? starts[0] : lines.length

  const hits = []
  for (let n = 0; n < starts.length; n += 1) {
    const start = starts[n]
    const end = caseEnd(lines, start, n + 1 < starts.length ? starts[n + 1] : lines.length)
    const block = lines.slice(start, end).join('\n')
    // Visible bindings are the ones declared outside every case — file level and
    // describe level alike — plus the ones this case declares itself. Anything a
    // sibling case declared stays with that sibling.
    const scope = []
    for (let i = 0; i < firstCase; i += 1) if (/^\s*const\s/.test(lines[i])) scope.push(i)
    for (let i = start; i < end; i += 1) if (/^\s*const\s/.test(lines[i])) scope.push(i)
    const tainted = collectTaint(lines, scope, constants, helpers, new Map())

    // A case that runs the tool under test and reads what it produced is
    // asserting output, not committed text.
    const assertsOwnOutput = /\b(spawnSync|execFileSync|execSync)\b/.test(block)
    const titleMatch = /[('`]([^'"`\n]{4,140})/.exec(lines[start])
    const title = titleMatch ? titleMatch[1].trim() : lines[start].trim().slice(0, 80)

    POSITIVE_ASSERT.lastIndex = 0
    let match
    while ((match = POSITIVE_ASSERT.exec(block)) !== null) {
      if (match[2].trim()) continue
      const base = /^([A-Za-z_$][\w$]*)/.exec(match[1])
      if (!base || !tainted.has(base[1])) continue
      // Equality against an imported value is a parity check between a document
      // and the constant the runtime ships — the same shape as generated types.
      // Comparing two values both derived from the same text proves nothing, so
      // the expected side has to come from an import, not from this file.
      const expected = /^([A-Za-z_$][\w$]*)/.exec(match[4])
      if (WHOLE_VALUE.has(match[3]) && expected && imported.has(expected[1])) continue
      const kind = tainted.get(base[1])
      if (kind === 'doc' && assertsOwnOutput) continue
      hits.push({ file: rel(file), line: start + 1, title, kind, severity: SEVERITY[kind] })
      break
    }
  }
  return hits
}

const files = []
for (const dir of ROOTS) walk(resolve(root, dir), files)
files.sort()

const hits = files.flatMap(analyse)
const banned = hits.filter((hit) => hit.severity === 'banned')
const warned = hits.filter((hit) => hit.severity === 'warn')

for (const group of [banned, warned]) {
  for (const hit of group) {
    const label = hit.severity === 'banned' ? 'BANNED' : 'warn  '
    console.log(`${label} [${hit.kind}] ${hit.file}:${hit.line}  ${hit.title}`)
  }
}

console.log(`\n${banned.length} banned, ${warned.length} warn, across ${files.length} test files.`)

if (banned.length && !process.argv.includes('--warn')) {
  console.error(
    '\nAssert this at a layer that can fail for the reason the title claims: a script in ' +
    'supabase/tests/ for database behaviour, or the shipped source for a code boundary.',
  )
  process.exit(1)
}
