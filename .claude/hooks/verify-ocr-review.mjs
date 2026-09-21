#!/usr/bin/env node
// Stop hook — asks for an OCR review of the current change once per change state.
//
// The hook only reads git state and runs `ocr delegate preview`, which selects files and calls no
// LLM. It blocks at most once for a given tree, and it fails open on every infrastructure problem
// (no git, no ocr, unreadable input), so it can flag unreviewed work but can never trap a session.
// Procedure it points at: .claude/commands/ocr-review.md. Runbook: docs/ops/agent-tooling.md.

import { NUDGE_LINE_THRESHOLD, checkNudge, markNudged } from '../../scripts/lib/ocr-review-gate.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    const timer = setTimeout(() => resolve(data), 2000)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

function allowStop(note) {
  if (note) console.error(`[verify-ocr-review] ${note}`)
  process.exit(0)
}

const raw = await readStdin()
let input = {}
try {
  input = raw ? JSON.parse(raw) : {}
} catch {
  allowStop('unreadable hook payload; not blocking')
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const result = checkNudge(projectDir)
if (result.skipped) allowStop(`skipped: ${result.skipped}`)
if (!result.nudge) process.exit(0)

try {
  markNudged(projectDir, result.tree)
} catch (error) {
  allowStop(`could not record the nudge (${error.message}); not blocking`)
}

console.error(
  `OCR review has not covered the current change: ${result.files} reviewable files, ${result.lines} changed lines ` +
    `since the last review (threshold ${NUDGE_LINE_THRESHOLD}).\n` +
    'Run /ocr-review (the ocr-review skill), or follow .claude/commands/ocr-review.md by hand starting from ' +
    '`node scripts/run.mjs run-node scripts/ocr-review.mjs plan --fetch`. Report the findings, then finish.\n' +
    'This blocks once per change state; the next stop for the same state passes.',
)
process.exit(2)
