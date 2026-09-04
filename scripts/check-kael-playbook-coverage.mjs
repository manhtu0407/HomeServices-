import fs from 'node:fs'
import path from 'node:path'

import {
  PROBLEM_SLUGS_BY_SERVICE,
  SAFETY_SIGNALS_BY_SERVICE,
  validatePlaybookCorpus,
} from '../apps/api/scripts/lib/kael-playbook-eval-core.mjs'

const root = process.cwd()
const services = ['electrical', 'plumbing', 'hvac', 'handyman', 'cleaning', 'upholstery']
const VIETNAMESE_DIACRITIC = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function normalize(value) {
  return value.replace(/\r\n/g, '\n').replace(/\n+$/g, '')
}

function fail(message) {
  throw new Error(message)
}

function assertCoverage(service, label, cases, isHoldout) {
  if (cases.length !== 24) fail(`${service} ${label}: expected exactly 24 cases, got ${cases.length}`)
  try {
    validatePlaybookCorpus(cases, service)
  } catch (error) {
    fail(`${service} ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const inScope = cases.filter((testCase) => testCase.expected.scope_signal === 'in_scope')
  const slugCounts = new Map(PROBLEM_SLUGS_BY_SERVICE[service].map((slug) => [slug, 0]))
  for (const testCase of inScope) {
    const slug = testCase.expected.problem_slug
    if (slugCounts.has(slug)) slugCounts.set(slug, slugCounts.get(slug) + 1)
  }
  for (const [slug, count] of slugCounts) {
    if (count < 2) fail(`${service} ${label}: ${slug} has ${count} cases, expected at least 2`)
  }
  const scopeCounts = Object.groupBy(cases, (testCase) => testCase.expected.scope_signal)
  if ((scopeCounts.service_mismatch?.length ?? 0) < 3) fail(`${service} ${label}: fewer than 3 service mismatches`)
  if ((scopeCounts.out_of_scope?.length ?? 0) < 2) fail(`${service} ${label}: fewer than 2 out-of-scope cases`)
  const difficultyCounts = Object.groupBy(cases, (testCase) => testCase.difficulty)
  for (const difficulty of ['easy', 'medium', 'hard']) {
    if ((difficultyCounts[difficulty]?.length ?? 0) < (difficulty === 'hard' ? 4 : 6)) {
      fail(`${service} ${label}: difficulty ${difficulty} is under-represented`)
    }
  }
  const complexityCounts = Object.groupBy(cases, (testCase) => testCase.expected.complexity ?? 'null')
  for (const complexity of ['small', 'medium', 'large']) {
    if ((complexityCounts[complexity]?.length ?? 0) < (complexity === 'small' ? 4 : complexity === 'medium' ? 4 : 6)) {
      fail(`${service} ${label}: complexity ${complexity} is under-represented`)
    }
  }
  const missingDetail = cases.find((testCase) =>
    typeof testCase.detail !== 'string' || testCase.detail.trim().length < 40)
  if (missingDetail) fail(`${service} ${label}: ${missingDetail.id} lacks grounded detail (min 40 chars)`)
  if (!cases.some((testCase) => !VIETNAMESE_DIACRITIC.test(testCase.input_text_vi))) {
    fail(`${service} ${label}: no no-diacritic Vietnamese input variant`)
  }
  for (const signal of SAFETY_SIGNALS_BY_SERVICE[service]) {
    const represented = cases.some((testCase) => {
      const expected = testCase.expected
      return (expected.required_safety_signals ?? expected.safety_signals ?? []).includes(signal)
    })
    if (!represented) fail(`${service} ${label}: safety signal ${signal} is not represented`)
  }
  if (!cases.some((testCase) => {
    const safetySignals = testCase.expected.required_safety_signals ?? testCase.expected.safety_signals ?? []
    return testCase.difficulty === 'hard' && safetySignals.length >= 2
  })) {
    fail(`${service} ${label}: no multi-signal hard case`)
  }
  if (isHoldout) {
    const missingPrefix = cases.find((testCase) => !testCase.rationale.startsWith('[SYNTHETIC SELF-REVIEW]'))
    if (missingPrefix) fail(`${service} ${label}: ${missingPrefix.id} lacks synthetic self-review rationale prefix`)
  }
  return {
    cases: cases.length,
    slugs: Object.fromEntries(slugCounts),
    scope: Object.fromEntries(Object.entries(scopeCounts).map(([key, value]) => [key, value.length])),
    difficulty: Object.fromEntries(Object.entries(difficultyCounts).map(([key, value]) => [key, value.length])),
    complexity: Object.fromEntries(Object.entries(complexityCounts).map(([key, value]) => [key, value.length])),
  }
}

function assertParity(service) {
  const sourceRelativePath = `supabase/functions/mobile-api/_shared/kael/learning/playbooks/${service}.ts`
  const docRelativePath = `docs/playbooks/services/${service}.md`
  const source = fs.readFileSync(path.join(root, sourceRelativePath), 'utf8')
  const constantName = `${service.toUpperCase()}_PLAYBOOK_SEGMENT`
  const backtick = String.fromCharCode(96)
  const sourceMarker = new RegExp(`export const ${constantName}\\s*=\\s*${backtick}`)
  const sourceMatch = sourceMarker.exec(source)
  if (!sourceMatch || sourceMatch.index === undefined) fail(`${service}: runtime segment constant not found`)
  const segmentStart = sourceMatch.index + sourceMatch[0].length
  const segmentEnd = source.indexOf(`${backtick};`, segmentStart)
  if (segmentEnd < 0) fail(`${service}: runtime segment terminator not found`)
  const runtimeSegment = source.slice(segmentStart, segmentEnd)
  const document = fs.readFileSync(path.join(root, docRelativePath), 'utf8')
  const appendixStart = document.indexOf('# Appendix A')
  const appendixEnd = document.indexOf('# Appendix B', appendixStart)
  const appendix = document.slice(appendixStart, appendixEnd < 0 ? document.length : appendixEnd)
  const fenceLanguage = 'text'
  const fencePrefix = `${String.fromCharCode(96).repeat(3)}${fenceLanguage}`
  const fenceStart = appendix.indexOf(fencePrefix)
  const fenceEnd = appendix.indexOf(String.fromCharCode(96).repeat(3), fenceStart + fencePrefix.length)
  if (appendixStart < 0 || fenceStart < 0 || fenceEnd < 0) fail(`${service}: Appendix A code fence not found`)
  const documentedSegment = normalize(appendix.slice(fenceStart + fencePrefix.length, fenceEnd)).replace(/^\n/, '')
  if (documentedSegment !== normalize(runtimeSegment)) {
    fail(`${service}: Appendix A does not match runtime segment after line-ending normalization`)
  }
  return runtimeSegment.length
}

const result = {}
for (const service of services) {
  const corpus = readJson(`docs/playbooks/eval/${service}-cases.json`)
  const holdout = readJson(`docs/playbooks/eval/${service}-synthetic-holdout-2026-08-27.json`)
  const corpusInputs = new Set(corpus.map((testCase) => testCase.input_text_vi))
  if (holdout.some((testCase) => corpusInputs.has(testCase.input_text_vi))) {
    fail(`${service}: holdout repeats corpus wording`)
  }
  result[service] = {
    corpus: assertCoverage(service, 'corpus', corpus, false),
    holdout: assertCoverage(service, 'holdout', holdout, true),
    segment_chars: assertParity(service),
  }
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
