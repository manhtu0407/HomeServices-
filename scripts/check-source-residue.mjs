#!/usr/bin/env node
// Residue ratchet: what the code still carries that should have been deleted before it shipped.
//
// The comment linter next door judges comment TEXT. This one judges the code itself. Three
// things hide there, each one plausible-looking line that review slides past, and each one
// changes behavior: a focused test silences every other test in its file, an unconditionally
// skipped test silences itself, and a stray console.log prints whatever it was handed.
//
// Two scopes, because the axes are not the same kind of rule:
//   focus/skip + debug probe -> every source file, `sandbox/` included
//   console.log/debug        -> runtime .ts/.tsx only
// The console axis splits by file KIND, not by directory. Every .mjs here is tooling, and a
// CLI script printing to stdout is using console.log for its purpose, not leaving residue.
// Splitting by kind means there is no per-file allowlist for anyone to remember or grow.
//
//   node scripts/check-source-residue.mjs
//
// Exit: 0 clean, 1 violations found. Zero runtime deps.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE = /\.(ts|tsx|mjs|cjs|js)$/
const RUNTIME_EXT = /\.(ts|tsx)$/
const TEST = /(^|\/)__tests__\/|(\.|-)test\.(ts|tsx|mjs|cjs|js)$/
const TOOLING = /(^|\/)scripts\//

export const RULES = [
  {
    id: 'focused test',
    re: /\.only\s*\(/,
    scope: 'source',
    why: 'a focused test silences every other test in its file',
  },
  {
    id: 'skipped test',
    // `.skip` followed by a call. `it.skipIf(...)` and the ternary `cond ? describe :
    // describe.skip` have no `(` in that position, so both stay legal by construction
    // rather than by exception list — this repo has 11 of them and they must survive.
    re: /\b(?:describe|it|test)\.skip\s*\(/,
    scope: 'source',
    why: 'an unconditionally skipped test is a test that never runs',
  },
  {
    id: 'skipped test',
    // Word-anchored on purpose: an unanchored `xit\(` also matches `process.exit(` and
    // `onExit(`, which is 39 false positives across this repo.
    re: /\b(?:xit|xdescribe|xtest)\s*\(/,
    scope: 'source',
    why: 'an unconditionally skipped test is a test that never runs',
  },
  {
    id: 'debug probe',
    // The group around `kael` is what keeps this file from flagging itself: it still
    // accepts a real probe marker while its own source no longer spells one out.
    re: /\[DEBUG-(kael)-/,
    scope: 'source',
    why: 'critical.md section 24.14 requires temporary probes be removed before final',
  },
  {
    id: 'debug console',
    re: /\bconsole\.(?:log|debug)\s*\(/,
    scope: 'runtime',
    why: 'runtime code logs through the platform logger; warn/error/info are untouched',
  },
]

/** Which scopes a path is judged under. A path outside SOURCE is judged under none. */
export function scopesFor(path) {
  if (!SOURCE.test(path)) return []
  const runtime = RUNTIME_EXT.test(path) && !TEST.test(path) && !TOOLING.test(path)
  return runtime ? ['source', 'runtime'] : ['source']
}

/**
 * Pure so the fixture suite can drive it without a repository; the CLI below supplies the
 * real files as `{ path, text }`.
 */
export function residue(files) {
  const problems = []
  let scanned = 0
  let runtime = 0

  for (const file of files) {
    const scopes = scopesFor(file.path)
    if (!scopes.length) continue
    scanned += 1
    if (scopes.includes('runtime')) runtime += 1

    file.text.split(/\r?\n/).forEach((line, index) => {
      for (const rule of RULES) {
        if (!scopes.includes(rule.scope)) continue
        if (!rule.re.test(line)) continue
        problems.push({
          path: file.path,
          line: index + 1,
          id: rule.id,
          why: rule.why,
          text: line.trim().slice(0, 120),
        })
      }
    })
  }

  return { problems, scanned, runtime }
}
function gitList(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).split('\0').filter(Boolean)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  // Untracked-but-not-ignored files are scanned too. Residue is cheapest to remove before the
  // commit, and a scan of only committed files is blind at the one moment the author is still
  // looking at the line — this rule said nothing about its own source until the day it was
  // committed, which is the failure mode in miniature.
  const listed = [
    ...gitList(['ls-files', '-z']),
    ...gitList(['ls-files', '--others', '--exclude-standard', '-z']),
  ]

  const files = []
  for (const path of listed) {
    if (!SOURCE.test(path)) continue
    try {
      files.push({ path, text: readFileSync(resolve(ROOT, path), 'utf8') })
    } catch {
      // A listed path that cannot be read is a checkout problem, not a residue problem.
    }
  }

  const result = residue(files)
  if (result.problems.length) {
    console.error('source residue violations:')
    for (const problem of result.problems) {
      console.error(`  - ${problem.path}:${problem.line}  ${problem.id} — ${problem.why}`)
      console.error(`      ${problem.text}`)
    }
    console.error(`\n${result.problems.length} residue violation(s). Remove them; do not widen the rule to fit.`)
    process.exit(1)
  }

  console.log(
    `source residue ok: ${result.scanned} source files (${result.runtime} runtime) — ` +
    'no focused or skipped tests, no debug probes, no runtime console.log',
  )
}
