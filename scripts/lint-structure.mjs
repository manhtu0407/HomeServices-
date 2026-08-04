// Structure ratchet (Core Skill 6 / governance/skills.md). Checks on source .ts/.tsx:
//   1. file-size cap — no NEW file over MAX_LINES, and no grandfathered god-file may grow.
//   2. duplicate exported type/interface — one concept = one home; no NEW cross-file
//      re-declaration, and no silent move of an existing one to a different file.
//   3. runtime boundary — RN/Edge must not import apps/api.
//   4. layer model — one-way dependencies inside the mobile-api Edge function.
//   5. frozen paths — the non-canonical apps/api Kael/learning reference must not grow.
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
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf-8'))
const API_PACKAGE_NAME = readJson('apps/api/package.json').name

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
  // frozenPaths is a deliberate freeze marker, not a snapshot of today, so it survives a
  // regeneration untouched — otherwise --init would silently lift the freeze.
  const previous = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf-8')) : {}
  const baseline = {
    maxLines: MAX_LINES,
    grandfatheredOversize: Object.fromEntries(
      Object.entries(sizes).filter(([, n]) => n > MAX_LINES).sort(([a], [b]) => a.localeCompare(b)),
    ),
    grandfatheredDupTypes: dupTypes,
    ...(previous.frozenPaths ? { frozenPaths: previous.frozenPaths } : {}),
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
    continue
  }
  if (locs.length > known.length) {
    problems.push(`exported type "${name}" spread further (${locs.length} > ${known.length} files) — collapse to one home`)
    continue
  }
  // An equal count is not an unchanged home: a type that moves from one file to another keeps
  // the count, so a size-only check passes while the recorded paths silently rot. Compare the
  // sets. Sorted on both sides so a re-ordered baseline is not reported as a move.
  const now = [...locs].sort().join(' | ')
  const before = [...known].sort().join(' | ')
  if (now !== before) {
    problems.push(
      `exported type "${name}" changed home — baseline records [${before}] but it now lives in [${now}] — update scripts/structure-baseline.json by hand (never \`--init\`, which re-grandfathers today's oversize set)`,
    )
  }
}

// Runtime boundary (C3): RN/Edge code must not import apps/api (Edge is the canonical Kael brain).
for (const f of files) {
  const r = rel(f)
  if (!r.startsWith('apps/mobile/') && !r.startsWith('supabase/functions/')) continue
  const text = readFileSync(f, 'utf-8')
  for (const m of text.matchAll(/(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (
      spec.includes('apps/api') ||
      spec === API_PACKAGE_NAME ||
      spec.startsWith(`${API_PACKAGE_NAME}/`)
    ) {
      problems.push(`runtime boundary: ${r} imports apps/api ("${spec}") — RN/Edge must not depend on apps/api (Edge is the canonical Kael brain, C3)`)
      break
    }
  }
}

// Layer model inside the mobile-api Edge function. Dependencies run one way only:
// http/ -> domains/ -> kael/ -> platform/. A layer may reach the ones below it, never
// above; http/ additionally may not reach kael/ directly, because an endpoint that talks
// to the brain without a use-case in between is how workflow rules get bypassed.
// Specifiers are resolved before classifying, so "../kael/x.ts" is judged by where it
// lands, not by how it is spelled.
const LAYER_ROOT = 'supabase/functions/mobile-api/_shared/'
const LAYERS = ['http', 'domains', 'kael', 'platform']
const layerOf = (path) =>
  path.startsWith(LAYER_ROOT) ? LAYERS.indexOf(path.slice(LAYER_ROOT.length).split('/')[0]) : -1

for (const f of files) {
  const from = layerOf(rel(f))
  if (from < 0) continue
  const text = readFileSync(f, 'utf-8')
  for (const m of text.matchAll(/(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue
    const to = layerOf(rel(resolve(dirname(f), spec)))
    if (to < 0 || to === from) continue
    if (to < from) {
      problems.push(
        `layer rule: ${rel(f)} imports ${LAYERS[to]}/ ("${spec}") — dependencies run one way (${LAYERS.join(' -> ')}); move the shared part down, do not import upward`,
      )
    } else if (from === 0 && to === 2) {
      problems.push(
        `layer rule: ${rel(f)} imports kael/ ("${spec}") — http/ must reach the AI layer through domains/, not directly`,
      )
    }
  }
}

// apps/api/src/lib/{kael,learning} is the non-canonical parallel brain kept for
// Next.js reference/parity (code-ownership-map.md C3). It is allowed to shrink or stay,
// never to grow — a new file or a longer file there means the second brain is being
// extended instead of the Edge one.
const FROZEN_ROOTS = ['apps/api/src/lib/kael/', 'apps/api/src/lib/learning/']
const frozenLines = baseline.frozenPaths?.lines ?? {}
const frozenCounts = baseline.frozenPaths?.fileCounts ?? {}
for (const root of FROZEN_ROOTS) {
  const current = Object.keys(sizes).filter((f) => f.startsWith(root))
  const knownCount = frozenCounts[root]
  if (knownCount !== undefined && current.length > knownCount) {
    problems.push(
      `frozen path grew (${current.length} > ${knownCount} files): ${root} — this is reference/parity only; build it in supabase/functions/mobile-api/_shared/kael instead`,
    )
  }
  for (const f of current) {
    const known = frozenLines[f]
    if (known === undefined) {
      problems.push(
        `frozen path gained a file: ${f} — this is reference/parity only; build it in supabase/functions/mobile-api/_shared/kael instead`,
      )
    } else if (sizes[f] > known) {
      problems.push(
        `frozen file grew (${sizes[f]} > frozen ${known} lines): ${f} — do not extend the non-canonical brain`,
      )
    }
  }
}

if (problems.length) {
  console.error('structure ratchet failed (Core Skill 6 / governance/skills.md):')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('Fix by splitting/importing; only grandfather intentionally via `node scripts/lint-structure.mjs --init`.')
  process.exit(1)
}
console.log(
  `structure ok: ${files.length} source files; ${Object.keys(baseline.grandfatheredOversize).length} grandfathered oversize, ${Object.keys(baseline.grandfatheredDupTypes).length} grandfathered dup-type groups`,
)
