// Splits the Supabase-generated database types into per-domain files, and joins them back.
//
// The generated artifact is one nested object literal, so it cannot be cut into files that
// each stand alone. Everything here rests on four invariants; break one and the safety this
// script replaces is gone:
//
//   1. ROUND-TRIP. join(split(x)) equals x byte for byte. Every gate that used to read the
//      single file now reads join(), so it keeps exactly the strength it had before.
//   2. HASH. config/harness/migration-inventory.json records a sha256 over the joined bytes.
//      scripts/harness/promotion.mjs compares that hash across releases, so a hash change
//      invalidates every recorded release. A changed hash means this script is wrong.
//   3. FAIL LOUD. A table matching no bucket rule aborts the run. There is deliberately no
//      catch-all bucket: a new table sliding silently into a junk file is the drift this
//      script exists to prevent.
//   4. VERBATIM. Slices keep their original indentation and are copied, never reformatted.
//      That is why the round-trip is true by construction instead of by careful re-indenting.
//
// The `.database.types.ts` suffix on every emitted file is load-bearing, not cosmetic.
// scripts/lint-structure.mjs and apps/api/src/__tests__/foundation/pii-log-lint.test.ts both
// exclude that suffix by regex, which is how generated output stays out of the 800-line cap
// and the PII scan. Renaming these files silently enrolls them in both gates.
//
// Usage:
//   node scripts/split-database-types.mjs --verify <file>        in-memory round-trip proof
//   node scripts/split-database-types.mjs --write <file>         split <file> into the tree
//   node scripts/split-database-types.mjs --join                 print the joined artifact
//   node scripts/split-database-types.mjs --count                count public tables / views / functions / enums
//   node scripts/split-database-types.mjs --check-against <file> compare the tree to <file>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = 'packages/shared/src/types/database'
const TABLES_DIR = `${OUT_DIR}/tables`

// Ordered: the first matching prefix wins, so `jobs` must be tested with `job_` and not after
// a broader rule that would swallow it.
const BUCKET_RULES = [
  ['kael', (name) => name.startsWith('kael_')],
  ['harness', (name) => name.startsWith('harness_') || name.startsWith('stage1_')],
  ['matching', (name) => name.startsWith('matching_') || name.startsWith('confirmation_') ||
    name.startsWith('synthetic_matching_') || name === 'workflow_outbox'],
  ['worker', (name) => name.startsWith('worker_')],
  ['customer', (name) => name.startsWith('customer_')],
  ['learning', (name) => name.startsWith('learning_')],
  ['jobs', (name) => name.startsWith('job_') || name === 'jobs' ||
    name.startsWith('completion_payment_') || name.startsWith('workflow_recovery_')],
  ['admin', (name) => name.startsWith('admin_')],
  ['service', (name) => name.startsWith('service_') || name.startsWith('price_baseline_')],
]

// Tables with no domain prefix. An explicit list rather than a fallback, so a new unprefixed
// table forces a decision instead of landing here unnoticed (invariant 3).
const CORE_TABLES = new Set([
  'ai_provider_routing',
  'api_logs',
  'chat_messages',
  'device_push_tokens',
  'disputes',
  'evidence_snapshots',
  'legal_awareness_patterns',
  'notifications',
  'platform_bank_balance_snapshots',
  'price_baselines',
  'profiles',
  'reviews',
  'scope_change_request_commands',
  'scope_change_request_effects',
  'scope_change_requests',
  'source_trust_registry',
])

const BUCKETS = [...BUCKET_RULES.map(([name]) => name), 'core'].sort()

// Structural anchors. Line numbers shift on every regeneration, so nothing here may depend
// on them.
const DATABASE_OPEN = 'export type Database = {'
const GRAPHQL_OPEN = '  graphql_public: {'
const PUBLIC_OPEN = '  public: {'
const CONSTANTS_OPEN = 'export const Constants = {'
const SECTION_OPEN = (name) => `    ${name}: {`
const SECTION_CLOSE = '    }'
const MEMBER_ANCHOR = /^ {6}([a-z0-9_]+): \{$/u
const SLICE_BEGIN = /^\/\* @slice:begin ([a-z0-9:_-]+) \*\/$/u
const SLICE_END = /^\/\* @slice:end ([a-z0-9:_-]+) \*\/$/u

const PASCAL = (name) => name.charAt(0).toUpperCase() + name.slice(1)

// The CLI emits tables in catalog order, not alphabetical order: `job_payment_orders` lands
// before `job_media_assets` because it was created first. Nothing about that order can be
// recomputed from the names, so it is recorded here and replayed on join.
const ORDER_FILE = `${OUT_DIR}/table-order.json`

function bucketOf(table) {
  for (const [bucket, matches] of BUCKET_RULES) if (matches(table)) return bucket
  if (CORE_TABLES.has(table)) return 'core'
  return null
}

const normalize = (text) => text.replace(/\r\n/gu, '\n')

function indexOfLine(lines, value, from = 0) {
  const at = lines.indexOf(value, from)
  if (at === -1) throw new Error(`anchor not found: ${JSON.stringify(value)}`)
  return at
}

// Returns the half-open range of the section body, excluding its `Name: {` and closing brace.
function sectionBody(lines, name, from) {
  const open = indexOfLine(lines, SECTION_OPEN(name), from)
  const close = indexOfLine(lines, SECTION_CLOSE, open + 1)
  return { start: open + 1, end: close, next: close }
}

// Splits a section body into one block per top-level member, keyed by name. Used by both
// split and join so the two can never disagree about where a table starts.
function memberBlocks(body) {
  const blocks = []
  for (const [offset, line] of body.entries()) {
    const match = line.match(MEMBER_ANCHOR)
    if (match) blocks.push({ name: match[1], start: offset })
  }
  return blocks.map((block, index) => ({
    name: block.name,
    lines: body.slice(block.start, index + 1 < blocks.length ? blocks[index + 1].start : body.length),
  }))
}

export function split(text) {
  const lines = normalize(text).split('\n')
  const dbOpen = indexOfLine(lines, DATABASE_OPEN)
  const graphqlOpen = indexOfLine(lines, GRAPHQL_OPEN, dbOpen)
  const publicOpen = indexOfLine(lines, PUBLIC_OPEN, graphqlOpen)
  const constantsOpen = indexOfLine(lines, CONSTANTS_OPEN, publicOpen)

  const tables = sectionBody(lines, 'Tables', publicOpen)
  const views = sectionBody(lines, 'Views', tables.next)
  const functions = sectionBody(lines, 'Functions', views.next)
  const enums = sectionBody(lines, 'Enums', functions.next)
  const composite = sectionBody(lines, 'CompositeTypes', enums.next)

  // `  }` closes public and `}` closes Database; the epilogue is everything after, up to the
  // Constants value, and carries the blank lines that surround the helper generics.
  const epilogueStart = composite.next + 3
  const slices = {
    json: lines.slice(0, dbOpen),
    databasePreamble: lines.slice(dbOpen + 1, graphqlOpen),
    graphql: lines.slice(graphqlOpen + 1, publicOpen - 1),
    views: lines.slice(views.start, views.end),
    functions: lines.slice(functions.start, functions.end),
    enums: lines.slice(enums.start, enums.end),
    composite: lines.slice(composite.start, composite.end),
    helpers: lines.slice(epilogueStart, constantsOpen),
    constants: lines.slice(constantsOpen),
  }

  const unmapped = []
  const tableOrder = []
  const tableSlices = Object.fromEntries(BUCKETS.map((bucket) => [bucket, []]))
  for (const block of memberBlocks(lines.slice(tables.start, tables.end))) {
    const bucket = bucketOf(block.name)
    if (bucket === null) unmapped.push(block.name)
    else {
      tableSlices[bucket].push(...block.lines)
      tableOrder.push(block.name)
    }
  }
  if (unmapped.length) {
    throw new Error(
      `no bucket rule matches: ${unmapped.join(', ')}\n` +
        'Add a prefix rule or an explicit CORE_TABLES entry — there is no catch-all bucket.',
    )
  }
  const empty = BUCKETS.filter((bucket) => tableSlices[bucket].length === 0)
  if (empty.length) throw new Error(`bucket produced no tables: ${empty.join(', ')}`)

  return { slices, tableSlices, tableOrder }
}

// Replays the recorded catalog order over the bucketed blocks. Mismatches either way mean the
// order file and the bucket files disagree, which would silently reorder the artifact.
function orderedTableLines(tableSlices, tableOrder) {
  const blocks = new Map()
  for (const bucket of BUCKETS) {
    for (const block of memberBlocks(tableSlices[bucket])) blocks.set(block.name, block.lines)
  }
  const missing = tableOrder.filter((name) => !blocks.has(name))
  const extra = [...blocks.keys()].filter((name) => !tableOrder.includes(name))
  if (missing.length) throw new Error(`ordered but absent from the bucket files: ${missing.join(', ')}`)
  if (extra.length) throw new Error(`present in the bucket files but unordered: ${extra.join(', ')}`)
  return tableOrder.flatMap((name) => blocks.get(name))
}

// Emits only the imports a slice actually references. Table bodies name both `Json` and
// `Database["public"]["Enums"][...]`, but views and functions do not always, and an unused
// import would fail lint on a file nobody is allowed to hand-edit.
function sliceImports(body, prefix) {
  const text = body.join('\n')
  const imports = []
  if (/\bJson\b/u.test(text)) imports.push(`import type { Json } from '${prefix}base.database.types'`)
  if (/\bDatabase\[/u.test(text)) {
    imports.push(`import type { Database } from '${prefix}schema.database.types'`)
  }
  return imports.length ? ['', ...imports, ''] : ['']
}

function sliceFile(id, prefix, open, body, close) {
  return [
    '// @generated by scripts/split-database-types.mjs — do not edit by hand',
    ...sliceImports(body, prefix),
    open,
    `/* @slice:begin ${id} */`,
    ...body,
    `/* @slice:end ${id} */`,
    close,
    '',
  ].join('\n')
}

function readSlice(path, id) {
  const lines = normalize(readFileSync(path, 'utf8')).split('\n')
  const begin = lines.findIndex((line) => line.match(SLICE_BEGIN)?.[1] === id)
  const end = lines.findIndex((line) => line.match(SLICE_END)?.[1] === id)
  if (begin === -1 || end === -1 || end < begin) throw new Error(`slice ${id} not found in ${path}`)
  return lines.slice(begin + 1, end)
}

export function join(root = ROOT) {
  const dir = resolve(root, OUT_DIR)
  const read = (file, id) => readSlice(resolve(dir, file), id)

  const tableSlices = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, read(`tables/${bucket}.database.types.ts`, `tables:${bucket}`)]),
  )
  const tableOrder = JSON.parse(readFileSync(resolve(root, ORDER_FILE), 'utf8'))

  return [
    ...read('base.database.types.ts', 'json'),
    DATABASE_OPEN,
    ...read('base.database.types.ts', 'database-preamble'),
    GRAPHQL_OPEN,
    ...read('base.database.types.ts', 'graphql'),
    '  }',
    PUBLIC_OPEN,
    SECTION_OPEN('Tables'),
    ...orderedTableLines(tableSlices, tableOrder),
    SECTION_CLOSE,
    SECTION_OPEN('Views'),
    ...read('views.database.types.ts', 'views'),
    SECTION_CLOSE,
    SECTION_OPEN('Functions'),
    ...read('functions.database.types.ts', 'functions'),
    SECTION_CLOSE,
    SECTION_OPEN('Enums'),
    ...read('enums.database.types.ts', 'enums'),
    SECTION_CLOSE,
    SECTION_OPEN('CompositeTypes'),
    ...read('base.database.types.ts', 'composite'),
    SECTION_CLOSE,
    '  }',
    '}',
    ...read('helpers.database.types.ts', 'helpers'),
    ...read('enums.database.types.ts', 'constants'),
  ].join('\n')
}

// Counts top-level members per section of the public schema. Depth-based rather than
// shape-based: three RPCs are emitted as multi-line unions (`name:` then `| {...}`) and three
// more on a single line, so any regex keyed on `name: {` miscounts. Counting also has to stay
// inside the public block — graphql_public carries its own Tables/Views/Functions.
export function count(root = ROOT) {
  const lines = join(root).split('\n')
  const publicAt = lines.indexOf(PUBLIC_OPEN)
  const sectionAt = (name) => lines.indexOf(SECTION_OPEN(name), publicAt)
  const sections = [
    ['Tables', 'Views'],
    ['Views', 'Functions'],
    ['Functions', 'Enums'],
    ['Enums', 'CompositeTypes'],
  ]
  return Object.fromEntries(
    sections.map(([name, next]) => {
      let depth = 0
      let members = 0
      for (const line of lines.slice(sectionAt(name) + 1, sectionAt(next))) {
        if (depth === 0 && /^ {6}[A-Za-z_][A-Za-z0-9_]*\??:/u.test(line)) members += 1
        for (const character of line) {
          if (character === '{' || character === '[') depth += 1
          else if (character === '}' || character === ']') depth -= 1
        }
      }
      return [name, members]
    }),
  )
}

// In-memory proof that the cut is lossless, usable before any file has been moved.
export function verify(text) {
  const { slices, tableSlices, tableOrder } = split(text)

  const rejoined = [
    ...slices.json,
    DATABASE_OPEN,
    ...slices.databasePreamble,
    GRAPHQL_OPEN,
    ...slices.graphql,
    '  }',
    PUBLIC_OPEN,
    SECTION_OPEN('Tables'),
    ...orderedTableLines(tableSlices, tableOrder),
    SECTION_CLOSE,
    SECTION_OPEN('Views'),
    ...slices.views,
    SECTION_CLOSE,
    SECTION_OPEN('Functions'),
    ...slices.functions,
    SECTION_CLOSE,
    SECTION_OPEN('Enums'),
    ...slices.enums,
    SECTION_CLOSE,
    SECTION_OPEN('CompositeTypes'),
    ...slices.composite,
    SECTION_CLOSE,
    '  }',
    '}',
    ...slices.helpers,
    ...slices.constants,
  ].join('\n')

  return { ok: rejoined === normalize(text), rejoined }
}

export function write(text, root = ROOT) {
  const { slices, tableSlices, tableOrder } = split(text)
  const tablesDir = resolve(root, TABLES_DIR)
  mkdirSync(tablesDir, { recursive: true })

  const emit = (path, contents) => writeFileSync(resolve(root, path), contents, 'utf8')

  // One line per table, so adding a table shows up as a single added line in review.
  emit(ORDER_FILE, `${JSON.stringify(tableOrder, null, 2)}\n`)

  emit(
    `${OUT_DIR}/base.database.types.ts`,
    [
      '// @generated by scripts/split-database-types.mjs — do not edit by hand',
      '',
      `/* @slice:begin json */`,
      ...slices.json,
      `/* @slice:end json */`,
      '',
      'export type DatabasePreamble = {',
      `/* @slice:begin database-preamble */`,
      ...slices.databasePreamble,
      `/* @slice:end database-preamble */`,
      '}',
      '',
      'export type GraphqlPublicSchema = {',
      `/* @slice:begin graphql */`,
      ...slices.graphql,
      `/* @slice:end graphql */`,
      '}',
      '',
      'export type PublicCompositeTypes = {',
      `/* @slice:begin composite */`,
      ...slices.composite,
      `/* @slice:end composite */`,
      '}',
      '',
    ].join('\n'),
  )

  emit(
    `${OUT_DIR}/views.database.types.ts`,
    sliceFile(
      'views',
      './',
      'export type DatabaseViews = {',
      slices.views,
      '}',
    ),
  )

  emit(
    `${OUT_DIR}/functions.database.types.ts`,
    sliceFile(
      'functions',
      './',
      'export type DatabaseFunctions = {',
      slices.functions,
      '}',
    ),
  )

  emit(
    `${OUT_DIR}/enums.database.types.ts`,
    [
      '// @generated by scripts/split-database-types.mjs — do not edit by hand',
      '',
      'export type DatabaseEnums = {',
      `/* @slice:begin enums */`,
      ...slices.enums,
      `/* @slice:end enums */`,
      '}',
      '',
      `/* @slice:begin constants */`,
      ...slices.constants,
      `/* @slice:end constants */`,
      '',
    ].join('\n'),
  )

  emit(
    `${OUT_DIR}/helpers.database.types.ts`,
    [
      '// @generated by scripts/split-database-types.mjs — do not edit by hand',
      '',
      "import type { Database } from './schema.database.types'",
      '',
      `/* @slice:begin helpers */`,
      ...slices.helpers,
      `/* @slice:end helpers */`,
      '',
    ].join('\n'),
  )

  for (const bucket of BUCKETS) {
    emit(
      `${TABLES_DIR}/${bucket}.database.types.ts`,
      sliceFile(
        `tables:${bucket}`,
        '../',
        `export type ${PASCAL(bucket)}Tables = {`,
        tableSlices[bucket],
        '}',
      ),
    )
  }

  // Hand-written, not sliced: this is the seam that reassembles the shape the CLI emitted.
  // The `&` chain is equivalent to one literal for keyof and indexed access, which
  // apps/api tier1-type-completeness proves against the migrations on every run.
  emit(
    `${OUT_DIR}/schema.database.types.ts`,
    [
      '// Reassembles the generated schema. Written by hand; the parts it references are',
      '// generated by scripts/split-database-types.mjs.',
      '',
      "import type { DatabasePreamble, GraphqlPublicSchema, PublicCompositeTypes } from './base.database.types'",
      "import type { DatabaseEnums } from './enums.database.types'",
      "import type { DatabaseFunctions } from './functions.database.types'",
      ...BUCKETS.map(
        (bucket) => `import type { ${PASCAL(bucket)}Tables } from './tables/${bucket}.database.types'`,
      ),
      "import type { DatabaseViews } from './views.database.types'",
      '',
      'export type Database = DatabasePreamble & {',
      '  graphql_public: GraphqlPublicSchema',
      '  public: {',
      `    Tables: ${BUCKETS.map((bucket) => `${PASCAL(bucket)}Tables`).join(' &\n      ')}`,
      '    Views: DatabaseViews',
      '    Functions: DatabaseFunctions',
      '    Enums: DatabaseEnums',
      '    CompositeTypes: PublicCompositeTypes',
      '  }',
      '}',
      '',
    ].join('\n'),
  )

  emit(
    `${OUT_DIR}/index.ts`,
    [
      "export type { Json } from './base.database.types'",
      "export { Constants } from './enums.database.types'",
      "export type {",
      '  CompositeTypes,',
      '  Enums,',
      '  Tables,',
      '  TablesInsert,',
      '  TablesUpdate,',
      "} from './helpers.database.types'",
      "export type { Database } from './schema.database.types'",
      '',
    ].join('\n'),
  )
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, argument] = process.argv.slice(2)
  const source = () => {
    if (!argument) fail(`${flag} needs a file path`)
    return readFileSync(resolve(argument), 'utf8')
  }

  if (flag === '--verify') {
    const { ok } = verify(source())
    if (!ok) fail('round-trip mismatch: split then join did not reproduce the input')
    console.log('round-trip ok: split then join reproduces the input byte for byte')
  } else if (flag === '--write') {
    const text = source()
    const { ok } = verify(text)
    if (!ok) fail('refusing to write: round-trip mismatch on the input')
    write(text)
    console.log(`wrote ${OUT_DIR} (${BUCKETS.length} table buckets)`)
  } else if (flag === '--join') {
    process.stdout.write(join())
  } else if (flag === '--count') {
    for (const [section, members] of Object.entries(count())) console.log(`${section} ${members}`)
  } else if (flag === '--check-against') {
    const expected = normalize(source())
    const actual = join()
    if (actual === expected) console.log('generated types match the committed split tree')
    else {
      const left = actual.split('\n')
      const right = expected.split('\n')
      const at = left.findIndex((line, index) => line !== right[index])
      fail(
        `DRIFT: the split tree does not reproduce ${argument}\n` +
          `  first difference at line ${at + 1}\n` +
          `  committed : ${JSON.stringify(left[at])}\n` +
          `  generated : ${JSON.stringify(right[at])}\n` +
          '  run: node scripts/split-database-types.mjs --write <generated file>',
      )
    }
  } else {
    fail('usage: --verify <file> | --write <file> | --join | --count | --check-against <file>')
  }
}

export { BUCKETS, OUT_DIR, bucketOf }
