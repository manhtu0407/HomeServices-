#!/usr/bin/env node
// Reuse-before-build observer (karpathy-guidelines: Reuse-Before-Build Ladder).
//
// Canonical rule: governance/skills.md "Core Skill 2 — Reuse-Before-Build Ladder" and
// .claude/skills/karpathy-guidelines/SKILL.md's "Reuse check" prompt field. This script
// does not — and cannot — prove a search actually happened; it only names newly exported
// symbols and, in --audit, existing same-name collisions. The binding half of the rule
// lives in the skill body, the Reuse check field, the debt ledger
// (docs/reuse-ladder-debt.md), and the No False Completion gate (governance/critical.md
// section 3).
//
// Modes:
//   node scripts/check-reuse-ladder.mjs --working         uncommitted change only (Stop hook)
//   node scripts/check-reuse-ladder.mjs --working --log   also append a record to
//                                                          .scratch/reuse-ladder-log.jsonl
//   node scripts/check-reuse-ladder.mjs --audit            repo-wide: exported function/class
//                                                          names declared in more than one file
//                                                          (ponytail's "/ponytail-audit" — a
//                                                          bloat report, not a ratchet; const
//                                                          exports are skipped because per-module
//                                                          generic names like `schema`/`router`
//                                                          would drown real signal, and Next.js
//                                                          route-handler names (GET/POST/...) are
//                                                          skipped because the framework requires
//                                                          them, not because logic duplicated)
//
// Always exits 0 — observational only, never blocks. Zero runtime deps.

import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['apps/api/src', 'apps/mobile', 'packages/shared/src', 'supabase/functions']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.expo', '.turbo', 'coverage', '__tests__'])
const LOG_PATH = '.scratch/reuse-ladder-log.jsonl'
// Next.js App Router requires every app/**/route.ts to export these exact names — a
// same-name "collision" here is the framework, not duplicated logic.
const FRAMEWORK_EXPORT_NAMES = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])

// Mirrors scripts/lint-structure.mjs's isSource: same exclusions (generated database
// types, .d.ts, test/spec doubles) so the two scripts agree on what counts as "source".
function isSource(path) {
  if (!/\.(ts|tsx)$/.test(path)) return false
  if (/\.(test|spec)\.(ts|tsx)$/.test(path)) return false
  if (/\.d\.ts$/.test(path)) return false
  if (path.includes('/types/database/')) return false
  if (/\.generated\./.test(path)) return false
  return true
}

function inRoots(path) {
  return ROOTS.some((r) => path === r || path.startsWith(`${r}/`))
}

// Capture the kind alongside the name: --audit only flags function/class collisions
// (see header — const names collide too often by convention to carry signal).
const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class)\s+([A-Za-z0-9_]+)\b|^\s*export\s+(const)\s+([A-Za-z0-9_]+)\s*=/

function symbolsIn(text, includedLines = null) {
  const found = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    if (includedLines && !includedLines.has(lineNumber)) continue
    const m = EXPORT_RE.exec(lines[i])
    if (m) found.push({ line: lineNumber, kind: m[1] || m[3], name: m[2] || m[4] })
  }
  return found
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  } catch (e) {
    console.error(`check-reuse-ladder: git ${args[0]} failed: ${e.message}`)
    process.exit(0) // infra failure never blocks an observational check
  }
}

// Tracked edits: only lines the diff actually adds, so an existing export that is merely
// moved or reformatted is not mistaken for a new one.
function trackedNewSymbols() {
  const raw = runGit(['diff', '--unified=0', 'HEAD', '--', ...ROOTS])
  const byFile = new Map()
  let file = null
  let ok = false
  let newLine = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '')
      file = p === '/dev/null' ? null : p
      ok = !!file && isSource(file) && inRoots(file)
      continue
    }
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      newLine = m ? parseInt(m[1], 10) : 0
      continue
    }
    if (line.startsWith('---')) continue
    if (line[0] === '+') {
      if (ok) {
        if (!byFile.has(file)) byFile.set(file, new Set())
        byFile.get(file).add(newLine)
      }
      newLine++
    } else if (line[0] !== '-') {
      newLine++
    }
  }
  const results = []
  for (const [path, addedLines] of byFile) {
    let content
    try {
      content = readFileSync(resolve(ROOT, path), 'utf8')
    } catch {
      continue
    }
    for (const s of symbolsIn(content, addedLines)) results.push({ file: path, ...s })
  }
  return results
}

// Brand-new untracked files: every export in them is, by definition, new.
function untrackedNewSymbols() {
  const raw = runGit(['ls-files', '-z', '--others', '--exclude-standard', '--', ...ROOTS])
  const results = []
  for (const rel of raw.split('\0').filter(Boolean)) {
    if (!isSource(rel)) continue
    let content
    try {
      content = readFileSync(resolve(ROOT, rel), 'utf8')
    } catch {
      continue
    }
    for (const s of symbolsIn(content)) results.push({ file: rel.split(sep).join('/'), ...s })
  }
  return results
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), acc)
    } else {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

// Repo-wide: every function/class exported under more than one file. lint-structure.mjs
// already does this for `export type`/`export interface`; this is the same name-keyed
// approach applied to function/class declarations, which that script deliberately leaves
// alone.
function auditDuplicateSymbols() {
  const files = []
  for (const r of ROOTS) {
    const abs = resolve(ROOT, r)
    try {
      statSync(abs)
    } catch {
      continue
    }
    walk(abs, files)
  }
  const decls = new Map()
  for (const f of files) {
    const rel = f.split(sep).join('/').slice(ROOT.split(sep).join('/').length + 1)
    if (!isSource(rel)) continue
    let content
    try {
      content = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    for (const s of symbolsIn(content)) {
      if (s.kind !== 'function' && s.kind !== 'class') continue
      if (FRAMEWORK_EXPORT_NAMES.has(s.name)) continue
      if (!decls.has(s.name)) decls.set(s.name, new Set())
      decls.get(s.name).add(rel)
    }
  }
  const dups = []
  for (const [name, set] of decls) if (set.size > 1) dups.push({ name, files: [...set].sort() })
  return dups.sort((a, b) => a.name.localeCompare(b.name))
}

function runWorking(args) {
  const symbols = [...trackedNewSymbols(), ...untrackedNewSymbols()]
  const files = [...new Set(symbols.map((s) => s.file))]

  if (args.includes('--log')) {
    try {
      mkdirSync(resolve(ROOT, dirname(LOG_PATH)), { recursive: true })
      const record = {
        timestamp: new Date().toISOString(),
        newSymbolCount: symbols.length,
        files,
        symbolNames: symbols.map((s) => s.name),
      }
      appendFileSync(resolve(ROOT, LOG_PATH), `${JSON.stringify(record)}\n`)
    } catch (e) {
      console.error(`check-reuse-ladder: could not write ${LOG_PATH}: ${e.message}`)
    }
  }

  if (!symbols.length) {
    console.log('reuse-ladder: no new exported symbols in this change.')
    return
  }

  console.log(`reuse-ladder: ${symbols.length} new exported symbol(s) in ${files.length} file(s) — observational only, not a gate.`)
  for (const s of symbols) console.log(`  ${s.file}:${s.line} export ${s.name}`)
  console.log(
    'Before reporting done, confirm the Reuse-Before-Build Ladder ran for each ' +
      '(governance/skills.md Core Skill 2; karpathy-guidelines "Reuse check" field). ' +
      'Found a reuse candidate but wrote new code anyway? Log why in docs/reuse-ladder-debt.md. ' +
      'Skipping either trips the No False Completion gate (governance/critical.md section 3), not this script.',
  )
}

function runAudit() {
  const dups = auditDuplicateSymbols()
  if (!dups.length) {
    console.log('reuse-ladder audit: no duplicate exported function/class names across the scanned roots.')
    return
  }
  console.log(`reuse-ladder audit: ${dups.length} exported function/class name(s) declared in more than one file — same name is not proof of duplication, read before merging.`)
  for (const d of dups) console.log(`  ${d.name}: ${d.files.join(', ')}`)
  console.log('Scope: apps/api/src, apps/mobile, packages/shared/src, supabase/functions — function/class exports only (const skipped, see header).')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--audit')) {
    runAudit()
  } else if (args.includes('--working')) {
    runWorking(args)
  } else {
    console.error('check-reuse-ladder: pass --working (Stop hook / local) or --audit (repo-wide report).')
  }
  process.exit(0)
}

main()
