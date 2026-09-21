#!/usr/bin/env node
// Deterministic half of the OCR review flow: chooses what to review in the current worktree and
// branch, and records what was reviewed. It never calls an LLM and never edits source files; the
// agent does the reviewing (procedure: .claude/commands/ocr-review.md).

import { OcrUnavailableError, buildPlan, checkNudge, diffFiles, markReviewed, renderPlan } from './lib/ocr-review-gate.mjs'

const USAGE = [
  'usage: node scripts/ocr-review.mjs plan [--full] [--fetch] [--base <ref>] [--format md|json]',
  '       node scripts/ocr-review.mjs diff --from <sha> --to <sha> <path>...',
  '       node scripts/ocr-review.mjs mark --snapshot <sha> [--base <ref>]',
  '       node scripts/ocr-review.mjs check',
].join('\n')

function fail(message) {
  console.error(message)
  process.exit(2)
}

function parseArgs(args) {
  const flags = { full: false, fetch: false, paths: [] }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--full' || arg === '--fetch') {
      flags[arg.slice(2)] = true
    } else if (['--base', '--format', '--snapshot', '--from', '--to'].includes(arg)) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) fail(`${arg} needs a value\n${USAGE}`)
      flags[arg.slice(2)] = value
      index += 1
    } else if (arg.startsWith('--')) {
      fail(`unknown argument ${arg}\n${USAGE}`)
    } else {
      flags.paths.push(arg)
    }
  }
  return flags
}

const [command, ...rest] = process.argv.slice(2)
if (!['plan', 'diff', 'mark', 'check'].includes(command)) fail(USAGE)
const flags = parseArgs(rest)
if (command !== 'diff' && flags.paths.length) fail(`unexpected argument ${flags.paths[0]}\n${USAGE}`)

try {
  if (command === 'plan') {
    const plan = buildPlan(process.cwd(), { base: flags.base, full: flags.full, fetch: flags.fetch })
    console.log(flags.format === 'json' ? JSON.stringify(plan, null, 2) : renderPlan(plan))
  } else if (command === 'diff') {
    if (!flags.from || !flags.to || !flags.paths.length) fail(`diff needs --from, --to and at least one path\n${USAGE}`)
    process.stdout.write(diffFiles(process.cwd(), { from: flags.from, to: flags.to, paths: flags.paths }))
  } else if (command === 'mark') {
    if (!flags.snapshot) fail(`mark needs --snapshot\n${USAGE}`)
    markReviewed(process.cwd(), { snapshot: flags.snapshot, base: flags.base })
    console.log(`Recorded review of snapshot ${flags.snapshot}.`)
  } else {
    console.log(JSON.stringify(checkNudge(process.cwd())))
  }
} catch (error) {
  if (error instanceof OcrUnavailableError) {
    fail('ocr is not installed. Install the pinned version described in docs/ops/agent-tooling.md, then run this again.')
  }
  fail(error.message)
}
