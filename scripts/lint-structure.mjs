// Structure ratchet (Core Skill 6 / skills.md). Two checks on source .ts/.tsx:
//   1. file-size cap — no NEW file over MAX_LINES, and no grandfathered god-file may grow.
//   2. duplicate exported type/interface — one concept = one home; no NEW cross-file re-declaration.
// Today's god-files and contract dups are grandfathered in scripts/structure-baseline.json
// (regenerate with `node scripts/lint-structure.mjs --init`); the reorg removes entries as it
// splits files / collapses contracts. Run via `pnpm lint:structure`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_LINES = 800
const ROOTS = ['apps/api/src', 'apps/mobile', 'packages/shared/src', 'supabase/functions']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.expo', '.turbo', 'coverage', '__tests__'])
const BASELINE = resolve(root, 'scripts/structure-baseline.json')
const rel = (f) => relative(root, f).split('\\').join('/')

function isSource(name) {
  if (!/\.(ts|tsx)$/.test(name)) return false
  if (/\.(test|spec)\.(ts|tsx)$/.test(name)) return false
  if (/\.d\.ts$/.test(name)) return false
  if (/database\.types\.ts$/.test(name)) return false
  return true
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), acc)
    } else if (isSource(entry.name)) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

const files = []
for (const r of ROOTS) {
  const abs = resolve(root, r)
  if (existsSync(abs)) walk(abs, files)
}

const sizes = {}
const typeDecls = new Map()
const typeRe = /^\s*export\s+(?:type|interface)\s+([A-Za-z0-9_]+)\b/
for (const f of files) {
  const text = readFileSync(f, 'utf-8')
  sizes[rel(f)] = text.split(/\r?\n/).length
  for (const line of text.split(/\r?\n/)) {
    const m = typeRe.exec(line)
    if (!m) continue
    if (!typeDecls.has(m[1])) typeDecls.set(m[1], new Set())
    typeDecls.get(m[1]).add(rel(f))
  }
}
const dupTypes = {}
for (const [name, set] of typeDecls) if (set.size > 1) dupTypes[name] = [...set].sort()

if (process.argv.includes('--init')) {
  const baseline = {
    maxLines: MAX_LINES,
    grandfatheredOversize: Object.fromEntries(
      Object.entries(sizes).filter(([, n]) => n > MAX_LINES).sort(([a], [b]) => a.localeCompare(b)),
    ),
    grandfatheredDupTypes: dupTypes,
  }
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
  console.log(
    `baseline written: ${rel(BASELINE)} (${Object.keys(baseline.grandfatheredOversize).length} oversize, ${Object.keys(baseline.grandfatheredDupTypes).length} dup-type groups)`,
  )
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('missing scripts/structure-baseline.json — run `node scripts/lint-structure.mjs --init`')
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'))
const problems = []

for (const [f, n] of Object.entries(sizes)) {
  if (n <= MAX_LINES) continue
  const grandfathered = baseline.grandfatheredOversize[f]
  if (grandfathered === undefined) {
    problems.push(`oversize (${n} > ${MAX_LINES} lines): ${f} — split by domain (Core Skill 6)`)
  } else if (n > grandfathered) {
    problems.push(`god-file grew (${n} > baseline ${grandfathered}): ${f} — do not grow a god-file; split it`)
  }
}
for (const [name, locs] of Object.entries(dupTypes)) {
  const known = baseline.grandfatheredDupTypes[name]
  if (!known) {
    problems.push(`duplicate exported type "${name}" in ${locs.join(', ')} — one concept = one home (import, do not re-declare)`)
  } else if (locs.length > known.length) {
    problems.push(`exported type "${name}" spread further (${locs.length} > ${known.length} files) — collapse to one home`)
  }
}

// Runtime boundary (C3): RN/Edge code must not import apps/api (Edge is the canonical Kael brain).
for (const f of files) {
  const r = rel(f)
  if (!r.startsWith('apps/mobile/') && !r.startsWith('supabase/functions/')) continue
  const text = readFileSync(f, 'utf-8')
  for (const m of text.matchAll(/(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (spec.includes('apps/api') || /@home-services\/api(\/|$)/.test(spec)) {
      problems.push(`runtime boundary: ${r} imports apps/api ("${spec}") — RN/Edge must not depend on apps/api (Edge is the canonical Kael brain, C3)`)
      break
    }
  }
}

if (problems.length) {
  console.error('structure ratchet failed (Core Skill 6 / skills.md):')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('Fix by splitting/importing; only grandfather intentionally via `node scripts/lint-structure.mjs --init`.')
  process.exit(1)
}
console.log(
  `structure ok: ${files.length} source files; ${Object.keys(baseline.grandfatheredOversize).length} grandfathered oversize, ${Object.keys(baseline.grandfatheredDupTypes).length} grandfathered dup-type groups`,
)
