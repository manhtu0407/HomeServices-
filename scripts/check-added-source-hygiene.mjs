#!/usr/bin/env node
// Watermark gate for governance/protocols/solve-conflict-maximize.md (Pillar B).
//
// Judges only lines a change adds under apps/, packages/, and supabase/functions/ (.ts and .tsx).
// Comment tokens are judged by check-comment-discipline.mjs --diff and --working, not here.
// Test files are checked too: a watermark is a watermark wherever it sits.
//
// Modes:
//   node scripts/check-added-source-hygiene.mjs --working     uncommitted change (Stop hook)
//   node scripts/check-added-source-hygiene.mjs --diff REF    committed range REF...HEAD (CI)
//   node scripts/check-added-source-hygiene.mjs --rev SHA     one commit against its parent (calibration)
//   add --warn to report without failing
//
// Exit: 0 clean, 1 blocking findings, 2 the checker could not run. Zero runtime deps.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { collectChanges, selectMode } from './lib/unified-diff.mjs'

const PRODUCT_ROOTS = /^(apps|packages|supabase\/functions)\//
const SCANNED = /\.(ts|tsx)$/
const SKIPPED_SEGMENTS = new Set(['node_modules', 'dist', 'build', '.next', '.expo', 'ios', 'android', 'coverage', '.turbo'])

export const WATERMARKS = [
  [/Generated with\b[^\n]*Claude/i, 'generated-with marker'],
  [/Co-Authored-By:/i, 'commit trailer'],
  [/\u{1F916}/u, 'robot emoji'],
  [/\b(?:generated|written|authored)\s+(?:by|with)\s+(?:claude|codex|copilot|cursor|chatgpt|gpt)\b/i, 'AI self-attribution'],
  [/@(?:author|license)\b/i, 'author or license tag'],
  [/SPDX-License-Identifier|Copyright \(c\)/i, 'license header'],
]

export function analyzeHygiene(change) {
  const findings = []
  const path = change.path
  if (!PRODUCT_ROOTS.test(path) || !SCANNED.test(path)) return findings
  if (path.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))) return findings

  for (const { line, text } of change.added) {
    const hit = WATERMARKS.find(([pattern]) => pattern.test(text))
    if (hit) findings.push({ file: path, line, rule: 'watermark', detail: hit[1] })
  }
  return findings
}

function main(args) {
  const selection = selectMode(args)
  if (!selection) {
    console.error('check-added-source-hygiene: pass --working, --diff <ref>, or --rev <sha>.')
    process.exit(2)
  }
  let changes
  try {
    changes = collectChanges(selection)
  } catch (error) {
    console.error(`check-added-source-hygiene: git failed: ${error.message}`)
    process.exit(2)
  }
  let findings
  try {
    findings = changes.flatMap(analyzeHygiene)
  } catch (error) {
    console.error(`check-added-source-hygiene: analysis failed: ${error.message}`)
    process.exit(2)
  }
  for (const finding of findings) {
    console.log(`BLOCK ${finding.file}:${finding.line} [${finding.rule}] ${finding.detail}`)
  }
  console.log(`check-added-source-hygiene: ${findings.length} blocking, ${changes.length} changed file(s) examined`)
  process.exit(findings.length && !args.includes('--warn') ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
}
