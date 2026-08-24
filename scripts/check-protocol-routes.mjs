// Reachability ratchet for the protocol stack. A file in governance/protocols/ is only
// loadable if governance/critical.md section 1 selects it for some task class.
//
// The defect this catches is a protocol that ships with no route in. It has happened three
// times: backend-structure.md (#227) reached neither router; test-pillars.md sat in the
// Protocol Source Files table while no row above ever chose it, against that section's own
// closing rule; frontend-test.md was in the same state and was found by hand while planning
// this gate. Each was invisible because listing a file and selecting it look identical when
// read, and nothing compared the two tables against the directory.
//
// It also checks the reverse. A `kael-*` name in the routing table that resolves to no file,
// no skill, and no inline section is a protocol an agent is told to load and cannot — the
// namespace trap that `check-work-plan.mjs --coverage` already guards on the skill side.
//
//   node scripts/check-protocol-routes.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CRITICAL_PATH = 'governance/critical.md'
const PROTOCOL_DIR = 'governance/protocols'
const SKILL_ROOT = '.claude/skills'
const CLAUDE_PATH = 'CLAUDE.md'

const SECTION_START = '## 1. Quick Protocol Index'
const SECTION_END = '## 2. Task Classification Matrix'
const SOURCE_TABLE = '### Protocol Source Files'

// Protocols that are never "selected" because they are already loaded by the time selection
// happens. Each needs a reason, and the stale check below fails if one becomes routed —
// otherwise this map is where a real coverage hole would go to hide.
export const EXEMPT = {
  'code-hygiene.md': 'Tier 1 — applies to every line written, so no task class selects it',
  'work-router.md': 'always-on — it runs before the selection it would be selected by',
  'dormant.md': 'deliberately dormant — see the file header',
}

// critical.md keeps these two inline rather than in protocols/, so they are proven by their
// section heading instead of by a file.
const INLINE = ['kael-preflight', 'kael-review']

function slice(text, start, end) {
  const from = text.indexOf(start)
  if (from === -1) return null
  const to = end ? text.indexOf(end, from) : -1
  return text.slice(from, to === -1 ? text.length : to)
}

/** Protocol names written as `kael-something` inside one block of markdown. */
function namesIn(markdown) {
  return new Set([...markdown.matchAll(/`(kael-[a-z0-9-]+)`/g)].map((match) => match[1]))
}

/**
 * Both directions between critical.md section 1 and the protocols directory.
 *
 * Pure so the fixture suite can drive it without a repository; the CLI below supplies the
 * real files.
 */
export function routes({ critical, protocolFiles, skills, claudeMd }) {
  const problems = []
  const section = slice(critical, SECTION_START, SECTION_END)
  if (!section) {
    problems.push(`${CRITICAL_PATH}: no \`${SECTION_START}\` section — reachability cannot be proven`)
    return { problems, protocols: 0, routed: 0, exempt: 0 }
  }
  const sourceAt = section.indexOf(SOURCE_TABLE)
  if (sourceAt === -1) {
    problems.push(`${CRITICAL_PATH} section 1: no \`${SOURCE_TABLE}\` table — protocol files have no declared home`)
    return { problems, protocols: 0, routed: 0, exempt: 0 }
  }
  const routing = section.slice(0, sourceAt)
  const source = section.slice(sourceAt)
  const skillSet = new Set(skills)

  // Forward: every protocol file is either selected by a routing row or explicitly exempt.
  let routed = 0
  for (const file of protocolFiles) {
    const row = source.split('\n').find((line) => line.includes(file)) ?? ''
    const selected = routing.includes(file) || [...namesIn(row)].some((name) => routing.includes(`\`${name}\``))

    if (selected) {
      routed += 1
      if (EXEMPT[file]) {
        problems.push(
          `${file}: exempt as "${EXEMPT[file]}" but a routing row now selects it — ` +
          'drop the exemption so the exempt set stays the short list it claims to be',
        )
      }
      continue
    }
    if (EXEMPT[file]) continue
    problems.push(
      `${file}: no row in ${CRITICAL_PATH} section 1 selects it — listed is not routed, and ` +
      'section 1 says to load a protocol only when it is selected',
    )
  }

  // Every non-exempt protocol file also needs a home in the source table, or an agent that
  // knows the protocol name cannot find the file behind it.
  for (const file of protocolFiles) {
    if (EXEMPT[file]) continue
    if (!source.includes(file)) problems.push(`${file}: missing from the ${SOURCE_TABLE} table`)
  }

  // And the other half of that: a source-table row may not point at a file which is not there.
  // Without this the table can name a deleted protocol and every name on its row still reads
  // as resolvable, because the reverse check below is satisfied by the row alone.
  for (const match of source.matchAll(/`protocols\/([a-z0-9-]+\.md)`/g)) {
    if (!protocolFiles.includes(match[1])) {
      problems.push(`${SOURCE_TABLE} points at protocols/${match[1]}, which does not exist in ${PROTOCOL_DIR}`)
    }
  }

  // Exemptions that name a file which no longer exists.
  for (const [file, reason] of Object.entries(EXEMPT)) {
    if (!protocolFiles.includes(file)) problems.push(`EXEMPT names ${file} ("${reason}") but no such protocol file exists`)
  }

  // Reverse: every protocol name the routing table tells an agent to run must resolve.
  const orphans = []
  for (const name of namesIn(routing)) {
    if (INLINE.includes(name)) {
      if (!critical.includes(`Kael Protocol: \`${name}\``)) {
        problems.push(`${name}: claimed inline in ${CRITICAL_PATH} but it has no protocol section there`)
      }
      continue
    }
    if (source.includes(`\`${name}\``) || skillSet.has(name)) continue
    orphans.push(name)
    problems.push(
      `${name}: named in the routing table but resolves to no source file, no inline section, ` +
      `and no skill under ${SKILL_ROOT}`,
    )
  }

  // CLAUDE.md points at protocol files directly in its Tier 2 table; a dead path there sends
  // an agent to a file that is not on disk.
  for (const match of claudeMd.matchAll(/`(governance\/protocols\/[a-z0-9-]+\.md)`/g)) {
    const file = match[1].slice(`${PROTOCOL_DIR}/`.length)
    if (!protocolFiles.includes(file)) problems.push(`${CLAUDE_PATH} points at ${match[1]}, which does not exist`)
  }

  return { problems, protocols: protocolFiles.length, routed, exempt: Object.keys(EXEMPT).length, orphans }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const criticalFile = resolve(ROOT, CRITICAL_PATH)
  const protocolDir = resolve(ROOT, PROTOCOL_DIR)
  if (!existsSync(criticalFile)) {
    console.error(`check-protocol-routes: ${CRITICAL_PATH} is missing — the routing tables live there`)
    process.exit(1)
  }
  if (!existsSync(protocolDir)) {
    console.error(`check-protocol-routes: ${PROTOCOL_DIR} is missing`)
    process.exit(1)
  }

  const skillRoot = resolve(ROOT, SKILL_ROOT)
  const result = routes({
    critical: readFileSync(criticalFile, 'utf8'),
    protocolFiles: readdirSync(protocolDir).filter((file) => file.endsWith('.md')).sort(),
    skills: existsSync(skillRoot) ? readdirSync(skillRoot) : [],
    claudeMd: existsSync(resolve(ROOT, CLAUDE_PATH)) ? readFileSync(resolve(ROOT, CLAUDE_PATH), 'utf8') : '',
  })

  if (result.problems.length) {
    console.error('protocol routing problems:')
    for (const problem of result.problems) console.error(`  - ${problem}`)
    console.error(`\n${result.problems.length} unreachable or unresolvable protocol(s). Canonical index: ${CRITICAL_PATH} section 1`)
    process.exit(1)
  }

  console.log(
    `protocol routes ok: ${result.routed}/${result.protocols} protocols selected by a routing row ` +
    `(${result.exempt} exempt), every routed name resolves`,
  )
}
