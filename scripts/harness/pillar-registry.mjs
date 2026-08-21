// Validate the pillar test manifests and keep the governance index in step with them.
//
// A pillar earns its name by being diagnosable: its failure has to say which invariant broke,
// which rule that invariant comes from, and what to read next. None of that survives unless
// something checks it, so this script is the ratchet. It also holds the three copies of
// pillar-manifest.ts byte-identical, the same way check-skills-sync.mjs holds the skill mirrors.
//
//   node scripts/harness/pillar-registry.mjs            check (CI)
//   node scripts/harness/pillar-registry.mjs --write    regenerate the governance index
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const write = process.argv.includes('--write')

const SEARCH_ROOTS = ['apps', 'packages', 'supabase/tests']
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.expo', '.turbo', 'ios', 'android'])
const REQUIRED_FIELDS = ['id', 'invariant', 'authority', 'target', 'layer', 'siblings', 'mutation']
const LAYERS = new Set(['unit', 'integration', 'static-type', 'security-negative', 'ui-visual', 'sql'])

const MANIFEST_COPIES = [
  'apps/api/src/__tests__/pillar-manifest.ts',
  'packages/shared/src/__tests__/pillar-manifest.ts',
  'apps/mobile/__tests__/pillar-manifest.ts',
]

const INDEX_DOC = 'governance/protocols/test-pillars.md'
const INDEX_BEGIN = '<!-- @pillar-index:begin -->'
const INDEX_END = '<!-- @pillar-index:end -->'

const problems = []

function walk(dir, acc) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

const files = SEARCH_ROOTS.flatMap((dir) => walk(resolve(root, dir), []))
const rel = (file) => relative(root, file).split('\\').join('/')

function quotedList(block) {
  return [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1])
}

function parseTsManifest(source, file) {
  const start = source.indexOf('export const PILLAR = {')
  if (start === -1) return null
  const end = source.indexOf('} as const satisfies PillarManifest', start)
  if (end === -1) {
    problems.push(`${rel(file)}: PILLAR is not closed with \`} as const satisfies PillarManifest\``)
    return null
  }
  const block = source.slice(start, end)
  const scalar = (field) => {
    const match = block.match(new RegExp(`\\b${field}:\\s*\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`))
    return match ? match[1] : ''
  }
  const list = (field) => {
    const match = block.match(new RegExp(`\\b${field}:\\s*\\[([\\s\\S]*?)\\]`))
    return match ? quotedList(match[1]) : []
  }
  return {
    id: scalar('id'),
    invariant: scalar('invariant'),
    authority: list('authority'),
    target: scalar('target'),
    layer: scalar('layer'),
    siblings: list('siblings'),
    mutation: scalar('mutation'),
    file: rel(file),
  }
}

function parseSqlManifest(source, file) {
  if (!source.includes('@pillar id:')) return null
  const fields = {}
  let current = null
  for (const line of source.split(/\r?\n/)) {
    const opener = line.match(/^--\s*@pillar\s+(\w+):\s*(.*)$/)
    if (opener) {
      current = opener[1]
      fields[current] = opener[2].trim()
      continue
    }
    const continuation = line.match(/^--\s{2,}(\S.*)$/)
    if (continuation && current) {
      fields[current] = `${fields[current]} ${continuation[1].trim()}`.trim()
      continue
    }
    if (!line.startsWith('--')) current = null
  }
  const split = (value) => (value ? value.split('|').map((part) => part.trim()).filter(Boolean) : [])
  const splitCommas = (value) => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [])
  return {
    id: fields.id ?? '',
    invariant: fields.invariant ?? '',
    authority: split(fields.authority),
    target: fields.target ?? '',
    layer: fields.layer ?? '',
    siblings: splitCommas(fields.siblings),
    mutation: fields.mutation ?? '',
    file: rel(file),
  }
}

const pillars = []
for (const file of files) {
  const name = rel(file)
  const isTsPillar = /-pillar\.test\.tsx?$/.test(name) || /-pillar-test\.tsx?$/.test(name)
  const isSqlCandidate = name.endsWith('.sql')
  if (!isTsPillar && !isSqlCandidate) continue

  const source = readFileSync(file, 'utf8')
  const manifest = isTsPillar ? parseTsManifest(source, file) : parseSqlManifest(source, file)
  if (!manifest) {
    if (isTsPillar) problems.push(`${name}: a *-pillar test must export a PILLAR manifest`)
    continue
  }
  pillars.push(manifest)
}

for (const pillar of pillars) {
  for (const field of REQUIRED_FIELDS) {
    const value = pillar[field]
    const empty = Array.isArray(value) ? value.length === 0 : !value
    if (empty) problems.push(`${pillar.file}: manifest field \`${field}\` is missing or empty`)
  }
  if (pillar.layer && !LAYERS.has(pillar.layer)) {
    problems.push(`${pillar.file}: unknown layer \`${pillar.layer}\` (expected one of ${[...LAYERS].join(', ')})`)
  }
}

const ids = new Map()
for (const pillar of pillars) {
  if (!pillar.id) continue
  if (ids.has(pillar.id)) problems.push(`duplicate pillar id \`${pillar.id}\` in ${ids.get(pillar.id)} and ${pillar.file}`)
  else ids.set(pillar.id, pillar.file)
}

// A sibling link is the part an agent follows after a failure, so a dangling one is worse
// than no link at all.
for (const pillar of pillars) {
  for (const sibling of pillar.siblings) {
    if (!ids.has(sibling)) {
      problems.push(`${pillar.file}: sibling \`${sibling}\` does not resolve to a known pillar id`)
    }
    if (sibling === pillar.id) problems.push(`${pillar.file}: pillar \`${pillar.id}\` lists itself as a sibling`)
  }
}

const copies = MANIFEST_COPIES.map((path) => {
  try {
    return { path, body: readFileSync(resolve(root, path)) }
  } catch {
    problems.push(`missing manifest copy: ${path}`)
    return null
  }
}).filter(Boolean)

if (copies.length === MANIFEST_COPIES.length) {
  const [first, ...rest] = copies
  for (const copy of rest) {
    if (!first.body.equals(copy.body)) {
      problems.push(`pillar-manifest.ts drift: ${copy.path} differs from ${first.path}`)
    }
  }
}

pillars.sort((a, b) => a.id.localeCompare(b.id))

function renderIndex() {
  const rows = pillars.map((pillar) =>
    `| \`${pillar.id}\` | ${pillar.layer} | ${pillar.invariant} | \`${pillar.file}\` | ${pillar.mutation} |`,
  )
  return [
    INDEX_BEGIN,
    '',
    `Generated by \`node scripts/harness/pillar-registry.mjs --write\`. ${pillars.length} pillars.`,
    '',
    '| id | layer | invariant | file | recorded mutation |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    INDEX_END,
  ].join('\n')
}

const docPath = resolve(root, INDEX_DOC)
let doc = ''
try {
  // renderIndex() joins with \n, so comparing it against a CRLF checkout reports
  // stale on every run and --write rewrites bytes git then normalises straight
  // back. Windows could never reach a clean check. Normalising on read compares
  // the index, not the checkout's line endings.
  doc = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n')
} catch {
  problems.push(`missing ${INDEX_DOC}; the pillar index has nowhere to live`)
}

if (doc) {
  const begin = doc.indexOf(INDEX_BEGIN)
  const end = doc.indexOf(INDEX_END)
  if (begin === -1 || end === -1) {
    problems.push(`${INDEX_DOC}: expected the ${INDEX_BEGIN} / ${INDEX_END} markers`)
  } else {
    const current = doc.slice(begin, end + INDEX_END.length)
    const next = renderIndex()
    if (current !== next) {
      if (write) {
        writeFileSync(docPath, doc.slice(0, begin) + next + doc.slice(end + INDEX_END.length))
        console.log(`pillar index rewritten in ${INDEX_DOC}`)
      } else {
        problems.push(`${INDEX_DOC}: pillar index is stale (run \`node scripts/harness/pillar-registry.mjs --write\`)`)
      }
    }
  }
}

if (problems.length) {
  console.error('pillar registry problems:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`pillar registry ok: ${pillars.length} pillars, ${ids.size} unique ids, manifest copies identical`)
for (const pillar of pillars) console.log(`  ${pillar.id.padEnd(34)} ${pillar.layer.padEnd(18)} ${pillar.file}`)
