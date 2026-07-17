#!/usr/bin/env node
// Reorg drift check for the Edge backend (governance/skills.md "Core Skill 6").
//
// The backend reorg groups _shared/services and _shared/kael into domain folders. A plain
// move list rots the moment a 55th file lands. So the target is expressed as a convergence
// law in scripts/reorg-manifest.json instead: every source file must have exactly one
// declared home, and must actually sit in it. A file that appears mid-reorg is either
// claimed by a rule or it fails here and a human classifies it — it cannot sit unnoticed.
//
// Two failure modes, both real:
//   unfiled   — a file at the root with no declared home (or two homes, which is undecided).
//   misplaced — a file physically inside the wrong folder. Nothing else catches this: the
//               root-empty invariants only look at the root, the size cap ignores location,
//               and a byte-diff is identical for a file dropped in the wrong folder.
//
// What this does NOT check: whether the root is already empty. Flat-but-claimed is the
// expected state until the move lands, so it is reported as pending, not failed. The
// "nothing may live at the root" invariant belongs to the structure ratchet
// (scripts/lint-structure.mjs) once the move is complete.
//
// Modes:
//   node scripts/check-reorg-drift.mjs                  report + fail on drift
//   node scripts/check-reorg-drift.mjs --quiet          only print problems
//   node scripts/check-reorg-drift.mjs --manifest PATH  run against a fixture manifest
//
// Exit: 0 every file has exactly one home and sits in it, 1 drift found, 2 manifest/infra failure.
// Zero runtime deps.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const manifestFlag = argv.indexOf('--manifest')
const MANIFEST =
  manifestFlag !== -1 && argv[manifestFlag + 1]
    ? resolve(argv[manifestFlag + 1])
    : resolve(root, 'scripts/reorg-manifest.json')

// Mirrors the structure ratchet's skip list so a co-located test dir is never mistaken for a domain.
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'coverage'])

function fail(message) {
  console.error(`reorg-drift: ${message}`)
  process.exit(2)
}

function isSource(name) {
  if (!/\.ts$/.test(name)) return false
  if (/\.(test|spec)\.ts$/.test(name)) return false
  if (/\.d\.ts$/.test(name)) return false
  return true
}

if (!existsSync(MANIFEST)) fail(`missing manifest: ${MANIFEST}`)

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
} catch (e) {
  fail(`cannot parse ${MANIFEST}: ${e.message}`)
}

// A rule set that cannot decide is worse than no rule set: catch a filename listed under two
// folders, or a regex that fails to compile, before it can mis-file anything. Regex overlap
// between two rules is only detectable once a colliding filename exists — resolveHome reports
// it as a tie at that point rather than letting the first rule win.
function validateManifest(name, spec) {
  if (!spec || !spec.dir || !spec.rules) fail(`root "${name}" is missing dir or rules`)
  if (spec.match === 'regex') {
    for (const [folder, pattern] of Object.entries(spec.rules)) {
      try {
        new RegExp(pattern)
      } catch (e) {
        fail(`root "${name}" folder "${folder}" has an invalid regex: ${e.message}`)
      }
    }
    return
  }
  if (spec.match === 'explicit') {
    const seen = new Map()
    for (const [folder, list] of Object.entries(spec.rules)) {
      if (!Array.isArray(list)) fail(`root "${name}" folder "${folder}" must list filenames`)
      for (const file of list) {
        if (seen.has(file)) {
          fail(`root "${name}": "${file}" is listed under both "${seen.get(file)}" and "${folder}"`)
        }
        seen.set(file, folder)
      }
    }
    return
  }
  fail(`root "${name}" has unknown match mode "${spec.match}" (expected regex or explicit)`)
}

function resolveHome(spec, filename) {
  const hits = []
  if (spec.match === 'regex') {
    for (const [folder, pattern] of Object.entries(spec.rules)) {
      if (new RegExp(pattern).test(filename)) hits.push(folder)
    }
  } else {
    for (const [folder, list] of Object.entries(spec.rules)) {
      if (list.includes(filename)) hits.push(folder)
    }
  }
  return hits
}

function walkSources(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkSources(join(dir, entry.name), acc)
    } else if (isSource(entry.name)) {
      acc.push(entry.name)
    }
  }
  return acc
}

const quiet = argv.includes('--quiet')
const problems = []
const summary = []

for (const [name, spec] of Object.entries(manifest.roots ?? {})) {
  validateManifest(name, spec)

  const abs = resolve(root, spec.dir)
  if (!existsSync(abs)) fail(`root "${name}" points at a missing dir: ${spec.dir}`)

  const allowlist = new Set(spec.rootAllowlist ?? [])
  const keepDirs = new Set(spec.keepDirs ?? [])
  const declared = new Set(Object.keys(spec.rules))
  const renamesExpected = spec.renamesExpected === true

  const pending = []
  const seenOnDisk = new Set()
  let placed = 0
  let kept = 0
  let allowed = 0

  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue

      // Pre-existing dirs the map leaves alone: count them, never judge their contents.
      if (keepDirs.has(entry.name)) {
        kept += walkSources(join(abs, entry.name)).length
        continue
      }

      if (!declared.has(entry.name)) {
        problems.push(
          `${spec.dir}/${entry.name}/ is not a declared domain — add it to reorg-manifest.json or move it into one`,
        )
        continue
      }

      // A file inside a domain folder must belong to THAT folder.
      for (const file of walkSources(join(abs, entry.name))) {
        placed++
        seenOnDisk.add(file)
        const hits = resolveHome(spec, file)
        if (hits.length === 1 && hits[0] !== entry.name) {
          problems.push(
            `${spec.dir}/${entry.name}/${file} is misplaced — its declared home is ${hits[0]}/`,
          )
        } else if (hits.length > 1) {
          problems.push(
            `${spec.dir}/${entry.name}/${file} matches ${hits.length} homes (${hits.join(', ')}) — rules must be mutually exclusive`,
          )
        } else if (hits.length === 0 && !renamesExpected) {
          problems.push(
            `${spec.dir}/${entry.name}/${file} has no declared home — classify it in reorg-manifest.json (ask before guessing a folder)`,
          )
        }
      }
      continue
    }

    if (!isSource(entry.name)) continue
    if (allowlist.has(entry.name)) {
      allowed++
      continue
    }

    seenOnDisk.add(entry.name)
    const hits = resolveHome(spec, entry.name)
    if (hits.length === 1) {
      pending.push(`${entry.name} -> ${hits[0]}/`)
    } else if (hits.length === 0) {
      problems.push(
        `${spec.dir}/${entry.name} has no declared home — classify it in reorg-manifest.json (ask before guessing a folder)`,
      )
    } else {
      problems.push(
        `${spec.dir}/${entry.name} matches ${hits.length} homes (${hits.join(', ')}) — rules must be mutually exclusive`,
      )
    }
  }

  // A hand-maintained list rots silently when a file it names is deleted or renamed.
  if (spec.match === 'explicit') {
    for (const [folder, list] of Object.entries(spec.rules)) {
      for (const file of list) {
        if (!seenOnDisk.has(file)) {
          problems.push(
            `${spec.dir}: "${file}" is listed under ${folder}/ but no longer exists on disk — drop the stale entry`,
          )
        }
      }
    }
  }

  summary.push({ dir: spec.dir, pending, placed, kept, allowed })
}

if (!quiet) {
  for (const s of summary) {
    console.log(s.dir)
    console.log(
      `  ${s.placed} moved into domain folders, ${s.pending.length} awaiting move, ${s.allowed} allowed at root, ${s.kept} in pre-existing folders`,
    )
    for (const p of s.pending) console.log(`    pending: ${p}`)
  }
  console.log('')
}

if (problems.length) {
  console.error(`reorg-drift: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nEvery Edge source file needs exactly one declared home in scripts/reorg-manifest.json, and must sit in it.')
  process.exit(1)
}

console.log('reorg-drift: clean — every file under the scanned roots has one declared home and sits in it.')
