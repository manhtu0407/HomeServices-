#!/usr/bin/env node
// Work-plan reconciler for kael-work-router. Canonical procedure:
// governance/protocols/work-router.md.
//
// Two independent jobs behind one entry point:
//
//   (default)    Reconcile `.scratch/work-plan.json` against what the working tree
//                actually changed. The router asks the agent to declare a domain, a
//                reach, a read-window, and which candidate skills it dropped; without
//                a reconciler those declarations cost nothing to get wrong. An absent
//                plan file means a trivial slice that owes no plan, so it exits clean.
//
//   --coverage   Cross-check the lane tables in the protocol against the harness
//                manifest, both directions: no skill unreachable from any lane, and
//                no lane naming something the manifest does not have. This is what
//                stops the routing tables drifting as skills are added, and it is why
//                the lane tables delegate (design goes to the design runtime router)
//                instead of copying rows.
//
// Modes: --json machine output · --warn report but exit 0 · --log append a calibration
// record to .scratch/work-log.jsonl.
//
// Exit: 0 clean, 1 violations found (unless --warn), 2 git/infra failure. Zero runtime deps.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLAN_PATH = '.scratch/work-plan.json'
const LOG_PATH = '.scratch/work-log.jsonl'
const PROTOCOL_PATH = 'governance/protocols/work-router.md'
const MANIFEST_PATH = 'config/harness/manifest.json'

// The domain vocabulary is owned by governance/critical.md section 2. It is repeated
// here only as a validator; the protocol must never define a thirteenth class.
export const DOMAINS = new Set([
  'bugfix', 'feature', 'ui', 'enhancement', 'refactor', 'test',
  'infra', 'security', 'database', 'ai', 'docs', 'review',
])
export const REACH = new Set(['T', 'C', 'X', 'E'])
const REACH_ORDER = { T: 0, C: 1, X: 2 }

// Always-on skills are never selected, so a lane that never names them is correct
// rather than a coverage hole.
export const ALWAYS_ON = new Set([
  'kael-core-hygiene', 'karpathy-guidelines', 'kael-subagent-orchestration', 'kael-work-router',
])

// Path signals beat prose. A reach floor here is the objective half of classification:
// the agent picks the words, but the tree says how far the change actually cut.
const PATH_RULES = [
  { re: /^packages\/shared\//, domain: null, floor: 'X', why: 'shared contract' },
  { re: /^supabase\/functions\/_shared\//, domain: null, floor: 'X', why: 'cross-function contract' },
  { re: /^supabase\/migrations\//, domain: 'database', floor: 'C', why: 'migration' },
  { re: /\.sql$/, domain: 'database', floor: 'C', why: 'sql' },
  { re: /^supabase\/functions\/mobile-api\/_shared\/kael\//, domain: 'ai', floor: 'C', why: 'kael pipeline' },
  { re: /^apps\/mobile\/(app|components)\//, domain: 'ui', floor: 'T', why: 'mobile surface' },
  { re: /^(scripts|config)\//, domain: 'infra', floor: 'C', why: 'repo tooling' },
  { re: /^\.(claude|github)\//, domain: 'infra', floor: 'C', why: 'agent or ci config' },
  { re: /^(governance|docs)\//, domain: 'docs', floor: 'T', why: 'governance or docs' },
]

// ---------------------------------------------------------------------- coverage

// Skill ids are lower-case hyphenated. Restricting to that shape keeps ordinary prose
// and file paths out of the token set without needing a prose parser.
const ID_TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/
// `supabase` is the one skill id with no hyphen, so it needs naming rather than matching.
const BARE_IDS = new Set(['supabase'])

function sectionsOf(markdown) {
  const out = []
  let current = { heading: '', body: [] }
  for (const line of String(markdown).split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      out.push(current)
      current = { heading: line.replace(/^##\s+/, '').trim(), body: [] }
      continue
    }
    current.body.push(line)
  }
  out.push(current)
  return out
}

function tokensIn(body) {
  const found = new Set()
  for (const [, token] of body.join('\n').matchAll(/`([^`\n]+)`/g)) {
    const trimmed = token.trim()
    if (ID_TOKEN.test(trimmed) || BARE_IDS.has(trimmed)) found.add(trimmed)
  }
  return found
}

// Both directions matter. A skill no lane reaches is a skill that silently never fires;
// a lane naming something the manifest lacks is the protocol-versus-skill namespace trap
// that already caught twelve protocol names in governance/critical.md section 1.
export function coverage({ markdown, manifest }) {
  const sections = sectionsOf(markdown)
  const pick = (test) => sections.filter((section) => test(section.heading))
  const laneSections = pick((heading) => /^Lane\b/i.test(heading))
  const alwaysSections = pick((heading) => /always-on/i.test(heading))
  const trapSections = pick((heading) => /namespace/i.test(heading))

  const problems = []
  if (!laneSections.length) problems.push('no `## Lane …` section found — coverage cannot be proven')
  if (!trapSections.length) problems.push('no `## … namespace …` section found — the protocol-only names are undocumented')

  // Only lane sections route. The always-on section is a reader-facing list, so its names
  // are checked against the constant below rather than treated as routing decisions.
  const routed = new Set()
  for (const section of laneSections) {
    for (const token of tokensIn(section.body)) routed.add(token)
  }
  const declaredAlwaysOn = new Set()
  for (const section of alwaysSections) {
    for (const token of tokensIn(section.body)) declaredAlwaysOn.add(token)
  }
  const protocolOnly = new Set()
  for (const section of trapSections) {
    for (const token of tokensIn(section.body)) protocolOnly.add(token)
  }

  if (alwaysSections.length) {
    for (const id of ALWAYS_ON) {
      if (!declaredAlwaysOn.has(id)) problems.push(`${id}: always-on in code but the protocol does not list it as exempt`)
    }
    for (const token of declaredAlwaysOn) {
      if (!ALWAYS_ON.has(token)) problems.push(`${token}: listed as always-on by the protocol but not exempt in the ratchet`)
    }
  }

  const entries = Array.isArray(manifest) ? manifest : (manifest.entries ?? [])
  const skills = entries.filter((entry) => entry.kind === 'repository-skill')
  const ids = new Set(skills.map((entry) => entry.id))
  const designIds = new Set(skills.filter((entry) => entry.group === 'design').map((entry) => entry.id))

  // The `ui` lane owns every design skill by delegating to the design runtime router.
  // Coverage may only credit that delegation when the lane actually points at it.
  const laneText = laneSections.map((section) => section.body.join('\n')).join('\n')
  const delegatesDesign = /design\/runtime\.md/.test(laneText)
  if (!delegatesDesign) {
    problems.push('the lane tables never point at `governance/design/runtime.md` — design skills would be orphaned')
  }

  for (const id of ids) {
    if (ALWAYS_ON.has(id)) continue
    if (routed.has(id)) continue
    if (delegatesDesign && designIds.has(id)) continue
    problems.push(`${id}: in the manifest but no lane can reach it`)
  }
  for (const token of routed) {
    if (!ids.has(token)) problems.push(`${token}: named by a lane but absent from the harness manifest`)
  }
  for (const token of protocolOnly) {
    if (ids.has(token)) {
      problems.push(`${token}: listed as protocol-only but a skill of that name now exists — the trap table is stale`)
    }
  }

  const reachable = [...ids].filter(
    (id) => ALWAYS_ON.has(id) || routed.has(id) || (delegatesDesign && designIds.has(id)),
  )
  return {
    mode: 'coverage',
    skills: ids.size,
    reachable: reachable.length,
    alwaysOn: [...ids].filter((id) => ALWAYS_ON.has(id)).length,
    protocolOnly: protocolOnly.size,
    problems,
  }
}

// ----------------------------------------------------------------- reconciliation

function covers(entry, path) {
  const normalized = String(entry).replace(/\/+$/, '')
  return path === normalized || path.startsWith(`${normalized}/`)
}

function meetsFloor(reach, floor) {
  if (reach === 'E') return true
  return REACH_ORDER[reach] >= REACH_ORDER[floor]
}

export function reconcile({ plan, changed }) {
  const slices = Array.isArray(plan?.slices) ? plan.slices : null
  if (!slices) return { mode: 'reconcile', problems: ['work plan has no `slices` array'] }

  const problems = []
  const window = []
  let declaredFiles = 0
  let closedSlices = 0
  let pendingSlices = 0

  for (const slice of slices) {
    const id = slice.id ?? '<unnamed>'
    if (!DOMAINS.has(slice.domain)) {
      problems.push(`${id}: domain \`${slice.domain}\` is not one of the twelve classes in governance/critical.md section 2`)
    }
    if (!REACH.has(slice.reach)) {
      problems.push(`${id}: reach \`${slice.reach}\` is not T, C, X, or E`)
    }
    if (!Array.isArray(slice.dropped)) {
      problems.push(`${id}: no \`dropped\` array — an empty one is valid, a missing one hides which candidate skills were cut`)
    }
    if (!['closed', 'open', 'pending'].includes(slice.status)) {
      problems.push(`${id}: status \`${slice.status}\` is not closed, pending, or open`)
    } else if (slice.status === 'open') {
      problems.push(`${id}: still open — a slice closes before the next one opens`)
    } else if (slice.status === 'closed') {
      closedSlices += 1
    } else {
      pendingSlices += 1
    }
    for (const entry of slice.read ?? []) window.push(entry)
    for (const entry of slice.scope ?? []) window.push(entry)
    if (typeof slice.files === 'number') declaredFiles += slice.files
  }

  for (const path of changed) {
    if (!window.some((entry) => covers(entry, path))) {
      problems.push(`${path}: changed but outside every slice read-window`)
    }
  }

  if (declaredFiles > 0 && changed.length > declaredFiles) {
    problems.push(`${changed.length} files changed against ${declaredFiles} declared — the plan understated its own size`)
  }

  const declaredDomains = new Set(slices.map((slice) => slice.domain))
  const reaches = slices.map((slice) => slice.reach).filter((reach) => REACH.has(reach))
  for (const path of changed) {
    const rule = PATH_RULES.find((candidate) => candidate.re.test(path))
    if (!rule) continue
    if (rule.domain && !declaredDomains.has(rule.domain)) {
      problems.push(`${path}: reads as \`${rule.domain}\` (${rule.why}) but no slice declared that domain`)
    }
    if (!reaches.some((reach) => meetsFloor(reach, rule.floor))) {
      problems.push(`${path}: ${rule.why} sets a reach floor of \`${rule.floor}\`, which no slice declared`)
    }
  }

  return {
    mode: 'reconcile',
    mission: plan.mission ?? null,
    slices: slices.length,
    closedSlices,
    pendingSlices,
    changed: changed.length,
    declaredFiles,
    problems,
  }
}

// -------------------------------------------------------------------------- cli

function bail(message) {
  console.error(`check-work-plan: ${message}`)
  process.exit(2)
}

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, relative), 'utf8'))
  } catch (error) {
    return bail(`cannot read ${relative}: ${error.message}`)
  }
}

function changedPaths() {
  let status = ''
  try {
    status = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (error) {
    return bail(`git unavailable: ${error.message}`)
  }
  const records = status.split('\0')
  const paths = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4 || record[2] !== ' ') continue
    const code = record.slice(0, 2)
    const path = record.slice(3)
    if (path) paths.push(path.replace(/\\/g, '/'))
    if (code.includes('R') || code.includes('C')) index += 1
  }
  return paths.filter((path) => !path.startsWith('.scratch/'))
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const has = (name) => args.includes(name)
  const WARN = has('--warn')

  let result
  if (has('--coverage')) {
    const protocolFile = resolve(ROOT, PROTOCOL_PATH)
    if (!existsSync(protocolFile)) bail(`${PROTOCOL_PATH} is missing — the lane tables live there`)
    result = coverage({
      markdown: readFileSync(protocolFile, 'utf8'),
      manifest: readJson(MANIFEST_PATH),
    })
  } else if (!existsSync(resolve(ROOT, PLAN_PATH))) {
    result = { mode: 'reconcile', skipped: 'no work plan on disk — trivial slices owe none', problems: [] }
  } else {
    result = reconcile({ plan: readJson(PLAN_PATH), changed: changedPaths() })
  }

  const { problems } = result

  if (has('--log')) {
    try {
      mkdirSync(resolve(ROOT, dirname(LOG_PATH)), { recursive: true })
      appendFileSync(resolve(ROOT, LOG_PATH), `${JSON.stringify({ ...result, problems: problems.length })}\n`)
    } catch (error) {
      console.error(`check-work-plan: could not write ${LOG_PATH}: ${error.message}`)
    }
  }

  if (has('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.skipped) {
    console.log(`work plan: ${result.skipped}`)
  } else if (!problems.length) {
    console.log(
      result.mode === 'coverage'
        ? `work-router coverage ok: ${result.reachable}/${result.skills} skills reachable (${result.alwaysOn} always-on exempt, ${result.protocolOnly} protocol-only names trapped)`
        : `work plan ok: ${result.slices} slices declared (${result.closedSlices} closed, ${result.pendingSlices} pending), ${result.changed} files changed inside the declared read-window`,
    )
  } else {
    console.error(problems.map((problem) => `  - ${problem}`).join('\n'))
    console.error(`\n${problems.length} work-router violation(s). Canonical rules: ${PROTOCOL_PATH}`)
  }

  process.exit(problems.length && !WARN ? 1 : 0)
}
