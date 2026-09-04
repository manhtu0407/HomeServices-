#!/usr/bin/env node
// Authority citations are the load-bearing half of `governance/critical.md` section 0: the order is
// only enforceable if a citation actually points at what it claims. Nothing checked them, so a number
// that sounded right was indistinguishable from one that was right — and a wrong citation is worse
// than none, because it borrows authority the cited text never granted.
//
// Two shapes are resolved. A doc citation (`RULES.md #8`, `critical.md §3`, `STRUCTURES.md §4.5`) must
// name a heading that exists. A citation into the planning document has a second failure mode: its
// sections are archived as they close, so a section can be alive under `governance/plan-archive/`
// while absent from the live file. Being archived is legitimate; sending a reader to a file that no
// longer holds the section is not, so such a citation should name the archive file it lives in.
//
// `governance/plan-archive/**` is a historical record and is not scanned — it documents what was true
// when written — but it is still read, because it is where archived Plan sections resolve to.
//
// Run via `pnpm lint:authority`. Exit: 0 clean, 1 at least one citation does not resolve.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVE_DIR = 'governance/plan-archive'
const SKIP_DIRS = new Set(['node_modules', '.git', '.temp', '.scratch', 'worktrees', '.codebase-memory', 'dist', 'build'])
const SCAN_EXT = new Set(['.md', '.ts', '.tsx', '.mjs', '.sql'])

// A citation is corrected where it instructs current work. It is NOT corrected where the file records
// what was true at the moment it was written — rewriting those would falsify the record, and merged
// migrations may never be edited at all. These roots are read for resolution and skipped for scanning,
// on the same ground as the plan archive itself.
const HISTORICAL = [
  'governance/plan-archive',
  'docs/memory',
  'docs/test-logs',
  'docs/audit',
  'docs/archive',
  'docs/progress-log.md',
  '.claude/MEMORY.md',
  'supabase/migrations',
]
const isHistorical = (rel) => HISTORICAL.some((root) => rel === root || rel.startsWith(`${root}/`))

// Each owner declares how its own sections are headed. RULES numbers rules, the rest number sections.
const OWNERS = {
  'RULES.md': { file: 'governance/RULES.md', heading: /^##\s+Rule\s+#(\d+)/gm, mark: '#' },
  'critical.md': { file: 'governance/critical.md', heading: /^##\s+(\d+)\./gm, mark: '§' },
  'STRUCTURES.md': { file: 'governance/STRUCTURES.md', heading: /^#{2,3}\s+§?(\d+(?:\.\d+)?)/gm, mark: '§' },
}
const PLAN_FILE = 'governance/Plan.md'
// Plan sections nest — `## 37.` carries `### 37.4` and `### 37.0.1`. Matching only the top level
// reports every sub-section citation as missing, which is a bug in the resolver, not in the citation.
const PLAN_HEADING = /^#{2,4}\s+(\d+(?:\.\d+)*)\.?/gm

const DOC_CITATION = /\b(RULES|critical|STRUCTURES)\.md\s+[#§](\d+(?:\.\d+)?)/g
const PLAN_CITATION = /\bPlan(?:\.md)?\s+§(\d+(?:\.\d+)?)/g

function sections(file, pattern) {
  const found = new Set()
  let text
  try {
    text = readFileSync(resolve(ROOT, file), 'utf8')
  } catch {
    return null
  }
  for (const [, number] of text.matchAll(pattern)) found.add(number)
  return found
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    const rel = relative(ROOT, full).split(sep).join('/')
    if (entry.isDirectory()) {
      if (isHistorical(rel)) continue
      walk(full, files)
      continue
    }
    if (SCAN_EXT.has(extname(entry.name)) && !isHistorical(rel)) files.push(full)
  }
  return files
}

/** Archived plan sections keep their numbers, so the archive is a second resolution tier. */
function archiveSections() {
  const found = new Map()
  let entries
  try {
    entries = readdirSync(resolve(ROOT, ARCHIVE_DIR), { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.md') continue
    const rel = `${ARCHIVE_DIR}/${entry.name}`
    for (const [, number] of readFileSync(resolve(ROOT, rel), 'utf8').matchAll(PLAN_HEADING)) {
      if (!found.has(number)) found.set(number, rel)
    }
  }
  return found
}

const problems = []
// A citation to an archived section is under-specified, not broken. It is surfaced so it can be
// improved, and it does not fail the build — only a section that exists nowhere does.
const warnings = []
const owners = {}
for (const [name, spec] of Object.entries(OWNERS)) {
  const found = sections(spec.file, spec.heading)
  if (!found || !found.size) {
    problems.push(`${spec.file}: no section headings found — the resolver cannot verify citations against it`)
    continue
  }
  owners[name] = { ...spec, sections: found }
}
const planSections = sections(PLAN_FILE, PLAN_HEADING) ?? new Set()
const archived = archiveSections()

let scanned = 0
let citations = 0
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  const text = readFileSync(file, 'utf8')
  scanned += 1
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [, owner, number] of line.matchAll(DOC_CITATION)) {
      // The capture omits the extension the OWNERS keys carry; looking up the bare name silently
      // skips every doc citation and leaves the gate green over an unchecked repository.
      const spec = owners[`${owner}.md`]
      if (!spec) continue
      citations += 1
      if (!spec.sections.has(number)) {
        problems.push(`${rel}:${index + 1} cites ${owner}.md ${spec.mark}${number}, which has no such section`)
      }
    }
    for (const [, number] of line.matchAll(PLAN_CITATION)) {
      citations += 1
      if (planSections.has(number)) continue
      const home = archived.get(number)
      if (home) {
        warnings.push(
          `${rel}:${index + 1} cites Plan §${number}, which now lives in ${home} — ` +
            'naming that file keeps the reader off a section Plan.md no longer holds',
        )
      } else {
        problems.push(`${rel}:${index + 1} cites Plan §${number}, which exists in neither ${PLAN_FILE} nor the archive`)
      }
    }
  })
}

for (const warning of warnings) console.warn(`  warn ${warning}`)
if (problems.length) {
  console.error('authority citation violations:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(
  `authority citations ok: ${citations} citations across ${scanned} files resolve — ` +
    `every cited section exists (${warnings.length} archived Plan citation(s) could name their archive file)`,
)
