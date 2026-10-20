#!/usr/bin/env node
// Test-integrity gate for governance/protocols/solve-conflict-maximize.md (Pillar A).
//
// Modes:
//   node scripts/check-test-integrity.mjs --working       uncommitted change (Stop hook)
//   node scripts/check-test-integrity.mjs --diff REF      committed range REF...HEAD (CI)
//   node scripts/check-test-integrity.mjs --rev SHA       one commit against its parent (calibration)
//   add --warn to report without failing
//
// Exit: 0 clean, 1 blocking findings, 2 the checker could not run. Zero runtime deps.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { TEST_FILE, collectChanges, selectMode } from './lib/unified-diff.mjs'

const PROTECTED = [
  /^scripts\/check-[^/]+\.mjs$/,
  /^scripts\/harness\//,
  /^scripts\/structure-baseline\.json$/,
  /^scripts\/lint-structure\.mjs$/,
  /^config\/harness\/manifest\.json$/,
  /(^|\/)jest\.config\.[cm]?[jt]s$/,
  /(^|\/)vitest\.config\.[cm]?[jt]s$|(^|\/)vitest\.config\.mts$/,
  /^\.github\/workflows\//,
  /^\.claude\/settings[^/]*\.json$/,
  /^\.claude\/hooks\//,
  /^docs\/test-debt-ledger\.md$/,
]

const PRODUCT_SOURCE = /^(apps|packages|supabase\/functions)\/.*\.[cm]?[jt]sx?$/

const ASSERTION = /\bexpect(?:TypeOf)?\s*\(|\bassert(?:\.\w+)?\s*\(/g
const TEST_CALL = /\b(?:it|test)\s*\(/
const FOCUS_OR_SKIP = /\.(?:skip|only|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/
const SNAPSHOT_ASSERTION = /\bto(?:Match|MatchInline|MatchFile)Snapshot\s*\(/
const SNAPSHOT_UPDATE = /\b(?:vitest|jest)\b[^\n]*\s(?:-u|--update|--updateSnapshot|--update-snapshot)(?=[\s"'`]|$)/
const TRIVIAL_ASSERTION = /\bexpect\s*\(\s*(?:true|false)\s*\)/
const TYPE_ESCAPE = /\bas\s+any\b|@ts-(?:ignore|expect-error|nocheck)\b/
const EXPECTED_LITERAL = /\.(?:toBe|toEqual|toStrictEqual|toMatchObject|toHaveLength)\s*\(/

export const countAssertions = (text) => (text.match(ASSERTION) ?? []).length

export function analyzeChanges(changes) {
  const productSourceChanged = changes.some((change) => PRODUCT_SOURCE.test(change.path) && !TEST_FILE.test(change.path))
  return changes.flatMap((change) => analyzeChange(change, productSourceChanged))
}

function analyzeChange(change, productSourceChanged) {
  const findings = []
  const block = (rule, detail) => findings.push({ file: change.path, severity: 'block', rule, detail })
  const report = (rule, detail) => findings.push({ file: change.path, severity: 'report', rule, detail })

  if (PROTECTED.some((pattern) => pattern.test(change.path))) {
    report('protected-surface', 'gate, config, or workflow changed; list it under "Gate or protected-surface changes"')
  }
  for (const { line, text } of change.added) {
    if (SNAPSHOT_UPDATE.test(text)) block('snapshot-update', `line ${line} runs a snapshot update`)
  }
  if (!TEST_FILE.test(change.path)) return findings

  const addedText = change.added.map((item) => item.text).join('\n')
  const removedText = change.removed.join('\n')
  const netDrop = countAssertions(removedText) - countAssertions(addedText)
  if (netDrop > 0) block('assertion-drop', `${netDrop} assertion call(s) removed net`)

  for (const { line, text } of change.added) {
    if (FOCUS_OR_SKIP.test(text)) block('focus-or-skip', `line ${line} adds a focused, skipped, or todo test`)
    if (SNAPSHOT_ASSERTION.test(text)) block('snapshot-assertion', `line ${line} adds a snapshot assertion`)
    if (TRIVIAL_ASSERTION.test(text)) block('trivial-assertion', `line ${line} asserts a constant`)
    if (TYPE_ESCAPE.test(text)) block('type-escape', `line ${line} adds a type escape in a test`)
  }

  if (!change.deleted && typeof change.content === 'string') {
    if (TEST_CALL.test(change.content) && countAssertions(change.content) === 0) {
      block('no-assertion', 'test file declares tests but contains no assertion')
    }
  }

  const literalRemoved = change.removed.some((line) => EXPECTED_LITERAL.test(line))
  const literalAdded = change.added.some((item) => EXPECTED_LITERAL.test(item.text))
  if (productSourceChanged && literalRemoved && literalAdded) {
    report('expected-literal-changed', 'an expected value changed while product source changed in the same diff')
  }
  return findings
}

function main(args) {
  const selection = selectMode(args)
  if (!selection) {
    console.error('check-test-integrity: pass --working, --diff <ref>, or --rev <sha>.')
    process.exit(2)
  }
  let changes
  try {
    changes = collectChanges(selection)
  } catch (error) {
    console.error(`check-test-integrity: git failed: ${error.message}`)
    process.exit(2)
  }
  let findings
  try {
    findings = analyzeChanges(changes)
  } catch (error) {
    console.error(`check-test-integrity: analysis failed: ${error.message}`)
    process.exit(2)
  }
  const blocking = findings.filter((finding) => finding.severity === 'block')
  const reports = findings.filter((finding) => finding.severity === 'report')
  for (const finding of [...blocking, ...reports]) {
    console.log(`${finding.severity === 'block' ? 'BLOCK ' : 'REPORT'} ${finding.file} [${finding.rule}] ${finding.detail}`)
  }
  console.log(`check-test-integrity: ${blocking.length} blocking, ${reports.length} report-only, ${changes.length} changed file(s) examined`)
  process.exit(blocking.length && !args.includes('--warn') ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
}
