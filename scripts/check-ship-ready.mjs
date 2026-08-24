#!/usr/bin/env node
// One command to answer "is this tree fit to push or open a PR with".
//
// Everything it runs was already runnable; nothing gathered it. An agent about to open a PR
// had to remember nine separate commands, and every workflow in .github only triggers on
// pull_request or push-to-main — so a feature branch pushed before its PR exists runs no
// check at all. This closes that window from the local side.
//
// Two things it does that harness/verify.mjs deliberately does not:
//   - it runs every gate before concluding, instead of stopping at the first red, because
//     the point is to see the whole picture once rather than discover it one push at a time;
//   - it prints what it could NOT run and why. critical.md section 3: a gate that could not
//     run is not a gate that passed. Name it.
// It delegates the harness chain to harness/verify.mjs rather than restating its steps, so
// that chain has exactly one definition.
//
//   node scripts/check-ship-ready.mjs
//
// Exit: 0 everything it ran passed, 1 something it ran failed. Zero runtime deps.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.execPath

const GATES = [
  ['comment discipline', ['scripts/check-comment-discipline.mjs']],
  ['source residue', ['scripts/check-source-residue.mjs']],
  ['structure and ratchets', ['scripts/lint-structure.mjs']],
  ['skills mirror', ['scripts/check-skills-sync.mjs']],
  ['skill contracts', ['scripts/check-skill-contracts.mjs']],
  ['protocol routes', ['scripts/check-protocol-routes.mjs']],
  ['work-router coverage', ['scripts/check-work-plan.mjs', '--coverage']],
  ['runner parity', ['scripts/check-runner-parity.mjs']],
  ['harness assurance', ['scripts/harness/verify.mjs']],
]

// Named here rather than probed, because whether the tool happens to be installed does not
// change the fact that this command does not run these. The probe only fills in the reason.
const ELSEWHERE = [
  ['pnpm type-check, test, build, lint', 'pnpm'],
  ['deno check on the Edge functions', 'deno'],
  ['migration replay and the SQL actor matrix', 'supabase'],
]

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) return null
  return result.stdout
}

function onPath(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(probe, [command], { encoding: 'utf8', windowsHide: true, shell: false })
  return !result.error && result.status === 0
}

/** Test suites are enumerated rather than globbed: `node --test <glob>` needs Node 21+. */
function testFiles() {
  const found = []
  for (const dir of ['scripts', 'scripts/harness']) {
    for (const name of readdirSync(resolve(ROOT, dir))) {
      if (name.endsWith('.test.mjs')) found.push(`${dir}/${name}`)
    }
  }
  return found.sort()
}

function gitState() {
  const problems = []
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])?.trim()
  const status = git(['status', '--porcelain'])

  if (branch === null || status === null) {
    problems.push(['git is not answering here — run this inside the repository', []])
    return { branch: branch ?? 'unknown', problems }
  }
  if (branch === 'main') {
    problems.push(['on main — branch before you push', []])
  }

  const groups = { staged: [], unstaged: [], untracked: [] }
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const code = line.slice(0, 2)
    const path = line.slice(3)
    if (code === '??') groups.untracked.push(path)
    else {
      if (code[0] !== ' ') groups.staged.push(path)
      if (code[1] !== ' ') groups.unstaged.push(path)
    }
  }

  const dirty = groups.staged.length + groups.unstaged.length + groups.untracked.length
  if (dirty) {
    const detail = []
    for (const [label, paths] of Object.entries(groups)) {
      for (const path of paths) detail.push(`${label.padEnd(10)} ${path}`)
    }
    problems.push([`${dirty} path(s) not committed — a push carries only what is committed`, detail])
  }

  return { branch, problems }
}

function runGate(name, args) {
  const started = Date.now()
  const result = spawnSync(NODE, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd()
  return { name, ok: !result.error && result.status === 0, seconds, output }
}

const state = gitState()
console.log(`ship readiness on ${state.branch}\n`)

console.log('git state')
if (state.problems.length === 0) {
  console.log('  ok    worktree clean, branch is not main')
} else {
  for (const [summary, detail] of state.problems) {
    console.log(`  FAIL  ${summary}`)
    for (const line of detail) console.log(`          ${line}`)
  }
}

console.log('\ngates')
const results = []
for (const [name, args] of GATES) {
  const result = runGate(name, args)
  results.push(result)
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(26)} ${result.seconds}s`)
}
const suites = runGate('script fixture suites', ['--test', ...testFiles()])
results.push(suites)
console.log(`  ${suites.ok ? 'ok  ' : 'FAIL'}  ${'script fixture suites'.padEnd(26)} ${suites.seconds}s`)

const failed = results.filter((result) => !result.ok)
for (const result of failed) {
  console.log(`\n--- ${result.name} ---\n${result.output}`)
}

console.log('\nnot run by this command')
for (const [what, command] of ELSEWHERE) {
  console.log(`  ${what.padEnd(42)} ${onPath(command) ? `${command} is on PATH; run it yourself` : `${command} is not on PATH here`}`)
}
console.log('  CI runs all of these on the pull request. This command does not stand in for them.')

const gitFailed = state.problems.length > 0
console.log('')
if (failed.length || gitFailed) {
  const parts = []
  if (gitFailed) parts.push('git state')
  if (failed.length) parts.push(`${failed.length} gate(s): ${failed.map((result) => result.name).join(', ')}`)
  console.error(`NOT READY — ${parts.join(' + ')}`)
  process.exit(1)
}
console.log(`ready — ${results.length} gates passed, worktree clean, and the list above is what stayed unproven here`)
