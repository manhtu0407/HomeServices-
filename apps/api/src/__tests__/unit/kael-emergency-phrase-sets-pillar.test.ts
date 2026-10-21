import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  resolveEmergencyGuidance,
  resolveReportedEmergencyGuidance,
  resolveReportedEmergencyGuidanceFromTexts,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P410-kael-emergency-phrase-sets',
  invariant:
    'the emergency classifier answers four hand-written development phrase sets exactly as labelled, a fifth set stays sealed (its hash is fixed, nothing in the suite or the source copies a phrase from it, and it is evaluated only on an explicit request), no phrase of any length makes classification slow, and the contestable phrasings are pinned to their current behavior so a change of route is an explicit decision',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate)',
    'governance/RULES.md #8 (a measurement states its sample and its limits)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (emergency routing false negatives and false positives)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P405-kael-emergency-signal-matrix', 'P408-kael-case-emergency-all-fields'],
  mutation:
    'delete a cue added for a development set, or copy a sealed phrase into a cue or a test: the matching set row or the independence row turns red',
} as const satisfies PillarManifest

const API_ROOT = process.cwd()
const REPO_ROOT = resolve(API_ROOT, '..', '..')
const PHRASES = join(API_ROOT, 'src', '__tests__', 'kael-edge-runtime', 'fixtures', 'emergency-phrases')
const SEALED_FILE = join(PHRASES, 'sealed-h5.json')
// Fixed when the set was written. A different hash means the sealed set was edited, which would make any score
// taken against it meaningless.
const SEALED_H5_SHA256 = '80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d'

type Row = {
  id: string
  text: string
  expected: string | null
  kind: 'clear' | 'judgement'
  service?: string
  disputed?: boolean
  currently?: string | null
}
type PhraseSet = { set: string; status?: string; rows: Row[] }

type RowResult = { id: string; kind: string; expected: string | null; got: string | null }

// Confusion counts over the clear rows only. An emergency is "detected" when any route is returned, and "routed
// correctly" when the route is the labelled one; both recalls are reported because a wrong route is still an answer
// but not the right one. Specificity is the share of labelled non-emergencies that stayed quiet. A ratio with no rows
// to divide is null, never 0 and never 1.
export function confusionMetrics(results: readonly RowResult[]) {
  const clear = results.filter((row) => row.kind === 'clear')
  const positives = clear.filter((row) => row.expected !== null)
  const negatives = clear.filter((row) => row.expected === null)
  const truePositiveRouted = positives.filter((row) => row.got === row.expected).length
  const wrongRoute = positives.filter((row) => row.got !== null && row.got !== row.expected).length
  const falseNegative = positives.filter((row) => row.got === null).length
  const falsePositive = negatives.filter((row) => row.got !== null).length
  const trueNegative = negatives.length - falsePositive
  const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null)
  return {
    clear_rows: clear.length,
    positives: positives.length,
    negatives: negatives.length,
    true_positive_routed: truePositiveRouted,
    wrong_route: wrongRoute,
    false_negative: falseNegative,
    false_positive: falsePositive,
    true_negative: trueNegative,
    recall_detected: ratio(positives.length - falseNegative, positives.length),
    recall_route_exact: ratio(truePositiveRouted, positives.length),
    specificity: ratio(trueNegative, negatives.length),
    judgement_rows: results.length - clear.length,
  }
}

const load = (name: string): PhraseSet => JSON.parse(readFileSync(join(PHRASES, name), 'utf8')) as PhraseSet
const routeOf = (row: Row) => resolveReportedEmergencyGuidance(row.text, 'vi', { serviceType: row.service ?? null })?.route ?? null
const normalise = (text: string) => text.normalize('NFC').toLowerCase()

describe(`${PILLAR.id}: the development sets`, () => {
  it.each(['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json'])('%s: every labelled row routes as labelled', (file) => {
    const set = load(file)
    const wrong = set.rows
      .filter((row) => row.kind === 'clear' && !row.disputed)
      .map((row) => ({ row, got: routeOf(row) }))
      .filter(({ row, got }) => got !== row.expected)
      .map(({ row, got }) => `${row.id} "${row.text}" expected ${row.expected} got ${got}`)
    expect(set.status, pillarWhy(PILLAR, `${file} is a development set: it was used to fix the classifier`)).toBe('development')
    expect(wrong, pillarWhy(PILLAR, `${set.set} rows that no longer route as labelled`)).toEqual([])
  })

  it('pins every contestable phrasing to what the classifier does today, so changing it is a decision', () => {
    const moved: string[] = []
    for (const file of ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']) {
      for (const row of load(file).rows.filter((candidate) => candidate.kind === 'judgement')) {
        if (!('currently' in row)) moved.push(`${row.id} has no pinned current route`)
        else if (routeOf(row) !== row.currently) moved.push(`${row.id} "${row.text}" was ${row.currently}, now ${routeOf(row)}`)
      }
    }
    expect(moved, pillarWhy(PILLAR, 'a contestable phrasing changed route: record the decision, then update the pin')).toEqual([])
  })

  it('keeps the disputed labels few and explained', () => {
    const disputed = ['development-h1.json', 'development-h2.json', 'development-h3.json', 'development-h4.json']
      .flatMap((file) => load(file).rows.filter((row) => row.disputed) as Array<Row & { disputedWhy?: string }>)
    expect(disputed.length, pillarWhy(PILLAR, 'a label disputed after the fact is a measurement caveat, not a way to drop a failing row')).toBeLessThanOrEqual(3)
    expect(disputed.every((row) => typeof row.disputedWhy === 'string' && row.disputedWhy.length > 10), pillarWhy(PILLAR, 'every disputed label says why')).toBe(true)
  })
})

describe(`${PILLAR.id}: the sealed set stays sealed`, () => {
  const sealedBytes = readFileSync(SEALED_FILE, 'utf8').replace(/\r\n/g, '\n')
  const sealed = JSON.parse(sealedBytes) as PhraseSet

  it('has the hash it was sealed with', () => {
    expect(createHash('sha256').update(sealedBytes).digest('hex'), pillarWhy(PILLAR, 'the sealed set was edited')).toBe(SEALED_H5_SHA256)
    expect(sealed.status).toBe('sealed')
    expect(sealed.rows.length).toBe(63)
  })

  it('is not copied into any test or source file, so nothing was tuned on it', () => {
    const files: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(?:ts|tsx|mjs|json)$/.test(entry.name) && path !== SEALED_FILE) files.push(path)
      }
    }
    walk(join(API_ROOT, 'src', '__tests__'))
    walk(join(REPO_ROOT, 'supabase', 'functions', 'mobile-api', '_shared'))
    const corpus = files.map((path) => ({ path, text: normalise(readFileSync(path, 'utf8')) }))
    const copied: string[] = []
    for (const row of sealed.rows) {
      const phrase = normalise(row.text)
      for (const { path, text } of corpus) {
        if (text.includes(phrase)) copied.push(`${row.id} appears in ${relative(REPO_ROOT, path)}`)
      }
    }
    expect(corpus.length, pillarWhy(PILLAR, 'the scan found files to compare against')).toBeGreaterThan(200)
    expect(copied, pillarWhy(PILLAR, 'a sealed phrase was copied elsewhere')).toEqual([])
  })

  it('is evaluated only when asked for, and the result is reported, never asserted', () => {
    if (process.env.KAEL_EVALUATE_SEALED_H5 !== '1') return
    const results: RowResult[] = sealed.rows.map((row) => ({ id: row.id, kind: row.kind, expected: row.expected, got: routeOf(row) }))
    const metrics = confusionMetrics(results)
    const git = (...args: string[]) => {
      try {
        return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
      } catch {
        return null
      }
    }
    const classifierFiles = [
      'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
      'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text.ts',
    ]
    const sha = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
    const baselineSha = process.env.KAEL_H5_BASELINE_SHA ?? null
    const classifier = classifierFiles.map((path) => {
      const baselineText = baselineSha ? git('show', `${baselineSha}:${path}`) : null
      const current = sha(readFileSync(join(REPO_ROOT, path), 'utf8'))
      return { path, sha256: current, identical_to_baseline: baselineText === null ? null : sha(baselineText) === current }
    })
    const report = {
      schema: 'kael_emergency_phrase_evaluation.v1',
      set: 'H5',
      // Not an original first run: this set was sealed by the same author who wrote the classifier fixes, no record of an
      // earlier evaluation exists in the repository, and the result below was produced by that author. It is a
      // reproduction on a frozen classifier, never independent validation, and the set is no longer a holdout after it.
      label: 'REPRODUCTION',
      independent_validation: false,
      evidence_tier: 'T0',
      sealed_sha256: createHash('sha256').update(sealedBytes).digest('hex'),
      sealed_hash_matches: createHash('sha256').update(sealedBytes).digest('hex') === SEALED_H5_SHA256,
      baseline_sha: baselineSha,
      head_sha: git('rev-parse', 'HEAD')?.trim() ?? null,
      classifier,
      tuned_on_this_set: false,
      metrics,
      misses: results.filter((row) => row.kind === 'clear' && row.expected !== null && row.got === null).map((row) => ({ id: row.id, expected: row.expected })),
      wrong_routes: results.filter((row) => row.kind === 'clear' && row.expected !== null && row.got !== null && row.got !== row.expected).map((row) => ({ id: row.id, expected: row.expected, got: row.got })),
      false_alarms: results.filter((row) => row.kind === 'clear' && row.expected === null && row.got !== null).map((row) => ({ id: row.id, got: row.got })),
      judgement: results.filter((row) => row.kind !== 'clear').map((row) => ({ id: row.id, got: row.got })),
    }
    const out = process.env.KAEL_H5_OUT
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 1))
    expect(metrics.clear_rows).toBeGreaterThan(0)
  })

  describe('the measurement arithmetic, on synthetic rows that are not H5', () => {
    const rows = (...spec: Array<[string, string | null, string | null]>): RowResult[] =>
      spec.map(([kind, expected, got], index) => ({ id: `S-${index}`, kind, expected, got }))

    it('separates a missed emergency, a wrong route, a false alarm and a correct quiet', () => {
      const metrics = confusionMetrics(rows(
        ['clear', 'gas', 'gas'], ['clear', 'fire', null], ['clear', 'medical', 'fire'], ['clear', null, 'fire'], ['clear', null, null], ['clear', null, null], ['judgement', 'fire', null],
      ))
      expect(metrics, pillarWhy(PILLAR, 'confusion counts')).toMatchObject({
        clear_rows: 6, positives: 3, negatives: 3, true_positive_routed: 1, wrong_route: 1, false_negative: 1, false_positive: 1, true_negative: 2, judgement_rows: 1,
      })
      expect(metrics.recall_detected, pillarWhy(PILLAR, 'detected = routed or wrongly routed')).toBeCloseTo(2 / 3)
      expect(metrics.recall_route_exact).toBeCloseTo(1 / 3)
      expect(metrics.specificity).toBeCloseTo(2 / 3)
    })

    it('reports null, never 0 or 1, for a ratio with nothing to divide', () => {
      const none = confusionMetrics(rows(['judgement', 'fire', 'fire']))
      expect([none.recall_detected, none.recall_route_exact, none.specificity], pillarWhy(PILLAR, 'no clear rows means no ratio')).toEqual([null, null, null])
      const onlyNegatives = confusionMetrics(rows(['clear', null, null]))
      expect([onlyNegatives.recall_detected, onlyNegatives.specificity], pillarWhy(PILLAR, 'no positives means no recall')).toEqual([null, 1])
    })

    it('excludes judgement rows from every ratio', () => {
      const metrics = confusionMetrics(rows(['clear', 'gas', 'gas'], ['judgement', 'gas', null], ['judgement', null, 'fire']))
      expect([metrics.recall_detected, metrics.specificity, metrics.false_positive], pillarWhy(PILLAR, 'a contestable row never moves a rate')).toEqual([1, null, 0])
    })
  })
})

describe(`${PILLAR.id}: classification stays fast on hostile input`, () => {
  const N = 5000
  const hostile: Record<string, string> = {
    'one repeated word': 'a '.repeat(N / 2),
    'object then filler': 'binh gas ' + 'x '.repeat(N / 2),
    'leak words': 'ro '.repeat(N / 3),
    'a negation chain': ('khong ' + 'x '.repeat(3) + 'gas ').repeat(N / 16),
    'water with no fixture': 'nuoc ' + 'tran tu may giat ra san va '.repeat(N / 28),
    'a fall with no end': ('nga ' + 'x '.repeat(6) + 'khong ').repeat(N / 24),
    'a stranger with no verb': ('nguoi la ' + 'a b c '.repeat(2)).repeat(N / 24),
    'sparks with no fixture': ('tia lua ' + 'a b ').repeat(N / 12),
    'combining marks': '́̀'.repeat(N / 2) + ' mui gas',
  }

  it.each(Object.entries(hostile))('%s: one 5,000-character text is read in well under a second', (_label, text) => {
    const started = performance.now()
    resolveEmergencyGuidance(text.slice(0, N), 'vi')
    resolveReportedEmergencyGuidance(text.slice(0, N), 'en', { serviceType: 'hvac' })
    expect(performance.now() - started, pillarWhy(PILLAR, 'a pattern with a bounded gap must not backtrack badly')).toBeLessThan(1000)
  })

  it('reads the largest request a Case accepts (21 texts of 5,000 characters) in a few seconds', () => {
    const texts = Array.from({ length: 21 }, () => 'Ổ cắm tóe lửa nhưng không cháy '.repeat(N / 31).slice(0, N))
    const started = performance.now()
    resolveReportedEmergencyGuidanceFromTexts(texts, 'vi', { serviceType: 'hvac' })
    expect(performance.now() - started, pillarWhy(PILLAR, 'the evidence-item ceiling')).toBeLessThan(5000)
  })

  it('does not throw on words that are also property names of a plain object', () => {
    const route = resolveReportedEmergencyGuidance('constructor __proto__ toString hasOwnProperty valueOf Ổ cắm đang bốc khói', 'vi')?.route
    expect(route, pillarWhy(PILLAR, 'the negation lookup reads customer words')).toBe('fire')
  })
})
