#!/usr/bin/env node
// Comment-discipline linter for Home Services.
//
// Enforces governance/skills.md "Core Skill 5": code comments explain non-obvious WHY or
// warn about a trap, briefly. They are NOT a changelog. Phase/plan numbers,
// dates, status banners, audit/ticket codes, and internal-doc references belong
// in the git commit message and docs/ — never baked into the source.
//
// Modes:
//   node scripts/check-comment-discipline.mjs            full scan of code dirs
//   node scripts/check-comment-discipline.mjs --diff REF only added lines vs REF
//   node scripts/check-comment-discipline.mjs --working  only the uncommitted change (Stop hook)
//   node scripts/check-comment-discipline.mjs --warn     report but exit 0
//
// Exit: 0 clean, 1 violations found (unless --warn), 2 git/infra failure. Zero runtime deps.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { execSync } from 'node:child_process'

const ROOTS = ['apps', 'packages', 'supabase/functions']
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.expo',
  'coverage', '.turbo', 'ios', 'android',
])

// High-signal patterns for EPHEMERAL changelog noise. Tested against extracted
// COMMENT text only, so string literals and live code never trip them.
//
// Deliberately NOT flagged — citing a durable contract is legitimate WHY:
//   governance/STRUCTURES.md §X, governance/RULES.md #X, governance/design.md, governance/critical.md, bare "Phase 1" scope.
// Banned is the dated/status/plan-tag narrative, not authority citations.
const RULES = [
  { re: /\b20\d\d-\d\d-\d\d\b/, why: 'date in comment' }, // ISO 2026-07-13
  { re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, why: 'date in comment' }, // 13/07/2026, 07-13-26
  { re: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+20\d\d\b/i, why: 'date in comment' }, // Jul 2026
  { re: /\bphase\s+\d+\.\d+/i, why: 'phase tag' }, // "5.11" (a plan tag), not "Phase 1" scope
  { re: /\bstatus:\s*(wired|done|deferred|pending|blocked|todo)\b/i, why: 'status banner' },
  { re: /\bplan\s*§/i, why: 'plan reference' },
  { re: /\b(map plan|notes\.md|plan\.md)\b/i, why: 'ephemeral-doc reference' },
  { re: /\baudit\s*§/i, why: 'audit reference' },
  { re: /\([A-Z]\d{0,2}-\d+\)/, why: 'ticket/audit code' },
  // AI residue — the source is not the agent's worklog.
  { re: /\b(added|generated|written|created|refactored|updated|fixed|wired|authored)\s+by\s+(claude|codex|chatgpt|gpt|ai|cursor|copilot|the assistant|an? ai)\b/i, why: 'AI self-attribution' },
  { re: /\bas an? ai\b/i, why: 'AI self-attribution' },
  { re: /\b(claude|codex|copilot|cursor)\s+(generated|wrote|added|created|refactored)\b/i, why: 'AI self-attribution' },
  { re: /\b(as requested|per your request|as you asked|you asked me to|per request)\b/i, why: 'request narration' },
  { re: /\b(i|we)['’]?(ve|ll|m)?\s+(added|created|implemented|refactored|removed|changed|fixed|updated|wrote|renamed|moved|introduced)\b/i, why: 'first-person change narration' },
  { re: /\b(todo|fixme|xxx|hack)\b\s*[:\-—]?\s*$/i, why: 'bare backlog marker' },
]

// Pull comment text out of one source line, carrying block-comment state.
// Strings are skipped so a "//" or date inside a literal is ignored.
function commentText(line, state) {
  let out = ''
  let i = 0
  if (state.inBlock) {
    const end = line.indexOf('*/')
    if (end === -1) return line
    out += line.slice(0, end)
    i = end + 2
    state.inBlock = false
  }
  let quote = null
  for (; i < line.length; i++) {
    const c = line[i]
    const n = line[i + 1]
    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '/' && n === '/') { out += ' ' + line.slice(i + 2); break }
    if (c === '/' && n === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end === -1) { out += ' ' + line.slice(i + 2); state.inBlock = true; break }
      out += ' ' + line.slice(i + 2, end)
      i = end + 1
    }
  }
  return out
}

function violationsFor(text) {
  const hits = []
  for (const r of RULES) if (r.re.test(text)) hits.push(r.why)
  return hits
}

function scanContent(content) {
  const found = []
  const state = { inBlock: false }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const text = commentText(lines[i], state)
    if (!text) continue
    const hits = violationsFor(text)
    if (hits.length) found.push({ line: i + 1, hits, snippet: lines[i].trim().slice(0, 90) })
  }
  return found
}

function eligible(path) {
  return EXTS.some((e) => path.endsWith(e))
}

function walk(dir, acc) {
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, acc)
    else if (eligible(full)) acc.push(full)
  }
  return acc
}

function fullScan() {
  const files = []
  for (const root of ROOTS) walk(root, files)
  const violations = []
  for (const f of files) {
    let content
    try { content = readFileSync(f, 'utf8') } catch { continue }
    for (const v of scanContent(content)) {
      violations.push({ file: f.split(sep).join('/'), ...v })
    }
  }
  return violations
}

// Ratchet: judge only added lines (`+`) from a git diff, so legacy files stay
// until touched while any NEW banner comment is blocked.
function parseAddedViolations(raw) {
  const violations = []
  let file = null
  let ok = false
  let newLine = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '')
      file = p === '/dev/null' ? null : p
      ok = !!file && eligible(file)
        && ROOTS.some((r) => file === r || file.startsWith(r + '/'))
        && !file.split('/').some((seg) => SKIP_DIRS.has(seg))
      continue
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      newLine = m ? parseInt(m[1], 10) : 0
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line[0] === '+') {
      if (ok) {
        const text = commentText(line.slice(1), { inBlock: false })
        const hits = text ? violationsFor(text) : []
        if (hits.length) violations.push({ file, line: newLine, hits, snippet: line.slice(1).trim().slice(0, 90) })
      }
      newLine++
    } else if (line[0] !== '-') {
      newLine++
    }
  }
  return violations
}

function runGitDiff(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch (e) {
    console.error(`comment-discipline: "${cmd}" failed: ${e.message}`)
    process.exit(2)
  }
}

// CI ratchet: added lines between a base ref and HEAD.
function diffScan(ref) {
  return parseAddedViolations(runGitDiff(`git diff --unified=0 ${ref}...HEAD`))
}

// Stop-hook ratchet: the current uncommitted change only. Tracked edits come
// from `git diff HEAD`; brand-new untracked code files are scanned whole, since
// every one of their comment lines is effectively an added line.
function workingScan() {
  const violations = parseAddedViolations(runGitDiff('git diff --unified=0 HEAD'))
  let untracked = ''
  try {
    untracked = execSync(`git ls-files --others --exclude-standard -- ${ROOTS.join(' ')}`, {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
  } catch {
    return violations
  }
  for (const rel of untracked.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (!eligible(rel)) continue
    let content
    try {
      content = readFileSync(rel, 'utf8')
    } catch {
      continue
    }
    for (const v of scanContent(content)) violations.push({ file: rel.split(sep).join('/'), ...v })
  }
  return violations
}

function main() {
  const args = process.argv.slice(2)
  const warn = args.includes('--warn')
  const diffIdx = args.indexOf('--diff')
  const violations = args.includes('--working')
    ? workingScan()
    : diffIdx !== -1
      ? diffScan(args[diffIdx + 1])
      : fullScan()

  if (!violations.length) {
    console.log('comment-discipline: clean — no note-banner comments found.')
    return
  }

  const byFile = new Map()
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, [])
    byFile.get(v.file).push(v)
  }
  console.error(`comment-discipline: ${violations.length} violation(s) in ${byFile.size} file(s)\n`)
  for (const [file, vs] of byFile) {
    console.error(file)
    for (const v of vs) console.error(`  ${v.line}: [${v.hits.join(', ')}] ${v.snippet}`)
    console.error('')
  }
  console.error('Move dates, phase/status/plan/audit banners, AI attribution, and first-person narration to the git commit message or docs/.')
  console.error('See the kael-core-hygiene skill / governance/protocols/code-hygiene.md.')
  if (!warn) process.exit(1)
}

main()
