import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'
import {
  BLIND_ROUTES,
  PROPOSED_BLIND_THRESHOLDS,
  canonicalBlindHash,
  evaluateBlindSet,
  validateBlindSet,
  wilsonInterval,
  zeroMissSampleFor,
  type BlindRoute,
  type BlindRow,
  type BlindSet,
} from '../helpers/emergency-blind-eval'

export const PILLAR = {
  id: 'P415-kael-emergency-blind-eval',
  invariant:
    'a blind emergency set written and sealed by someone other than the implementer is scored with recall and false positives reported separately, per route, with sample sizes and intervals; it is called independent only when the reviewer attests the authorship and the rows match both the sealed hash and a hash the reviewer registered out of band; a report never carries a row\'s text; an absent set is not run, never passed',
  authority: [
    'governance/RULES.md #8 (a measurement states its sample and its limits; no fake success)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (emergency routing misses) and W02 (truthful evaluation taxonomy)',
    'governance/critical.md #3 (a gate that could not run is not a gate that passed)',
  ],
  target: 'apps/api/src/__tests__/helpers/emergency-blind-eval.ts',
  layer: 'unit',
  siblings: ['P410-kael-emergency-phrase-sets', 'P402-kael-eval-report-contract'],
  mutation:
    'call a set independent without the registered hash, merge false positives into recall, report 0 for an empty denominator, or copy a row\'s text into the report: the matching row turns red',
} as const satisfies PillarManifest

// Synthetic rows that exercise the arithmetic and the labels. They are not the sealed development set and not a blind set.
const row = (id: string, expected: BlindRoute | null, text = `synthetic ${id}`, extra: Partial<BlindRow> = {}): BlindRow => ({
  id, text, expected, language: 'vi', kind: 'clear', ...extra,
})

function sealed(rows: BlindRow[], overrides: Partial<BlindSet['reviewer_attestation']> = {}): BlindSet {
  return {
    schema: 'kael_emergency_blind_set.v1',
    reviewer_attestation: {
      reviewer: 'independent-reviewer',
      author_is_implementer: false,
      sealed_at: '2026-10-21T00:00:00.000Z',
      sealed_sha256: canonicalBlindHash(rows),
      source: 'written fresh for this evaluation',
      ...overrides,
    },
    rows,
  }
}

// A classifier stand-in that answers from a table, so a row's label and answer are chosen by the test.
const answers = (table: Record<string, BlindRoute | null>) => (candidate: BlindRow) => table[candidate.id] ?? null

describe(`${PILLAR.id}: the arithmetic`, () => {
  it('computes a Wilson interval and returns null, not 0 or 1, with nothing to divide', () => {
    expect(wilsonInterval(0, 0), pillarWhy(PILLAR, 'no denominator')).toBeNull()
    const perfect = wilsonInterval(30, 30)
    expect(perfect?.low, pillarWhy(PILLAR, '30 of 30 does not prove 100%')).toBeCloseTo(0.8865, 3)
    expect(perfect?.high, pillarWhy(PILLAR, 'the upper bound is 1')).toBeCloseTo(1, 6)
    expect(wilsonInterval(0, 30)?.low, pillarWhy(PILLAR, '0 of 30')).toBe(0)
  })

  it('states how many clean rows are needed before zero misses supports a given recall', () => {
    expect(zeroMissSampleFor(0.9), pillarWhy(PILLAR, '90% lower bound')).toBe(35)
    expect(zeroMissSampleFor(0.95), pillarWhy(PILLAR, '95% lower bound')).toBe(73)
    expect(zeroMissSampleFor(0.98), pillarWhy(PILLAR, '98% lower bound')).toBe(189)
  })
})

describe(`${PILLAR.id}: a set must be well formed`, () => {
  it('accepts a sealed set and names every defect of a malformed one', () => {
    expect(validateBlindSet(sealed([row('B1', 'fire')])), pillarWhy(PILLAR, 'a well-formed set')).toEqual([])
    const broken = { schema: 'other', rows: [{ id: 'B1' }, { id: 'B1', text: 'x', expected: 'volcano', language: 'fr', kind: 'maybe' }] }
    const problems = validateBlindSet(broken)
    expect(problems.some((entry) => entry.includes('schema')), pillarWhy(PILLAR, problems.join('; '))).toBe(true)
    expect(problems.some((entry) => entry.includes('reviewer_attestation')), pillarWhy(PILLAR, problems.join('; '))).toBe(true)
    expect(problems.some((entry) => entry.includes('duplicate row id')), pillarWhy(PILLAR, problems.join('; '))).toBe(true)
    expect(problems.some((entry) => entry.includes('unknown expected route')), pillarWhy(PILLAR, problems.join('; '))).toBe(true)
  })

  it('refuses to score a malformed set', () => {
    expect(() => evaluateBlindSet({ schema: 'x' } as unknown as BlindSet, () => null), pillarWhy(PILLAR, 'no score for a malformed set')).toThrow(/invalid blind set/)
  })
})

describe(`${PILLAR.id}: independence is earned, not claimed`, () => {
  const rows = [row('B1', 'fire'), row('B2', null)]
  const classify = answers({ B1: 'fire' })

  it('is independent only with the attestation, the sealed hash and the hash registered out of band', () => {
    const set = sealed(rows)
    const report = evaluateBlindSet(set, classify, { registeredSha256: canonicalBlindHash(rows) })
    expect(report.independent_validation, pillarWhy(PILLAR, report.reasons_not_independent.join('; '))).toBe(true)
    expect(report.label).toBe('INDEPENDENT_BLIND')
  })

  it.each([
    ['the author is the implementer', sealed(rows, { author_is_implementer: true }), canonicalBlindHash(rows)],
    ['the rows were edited after sealing', sealed([row('B1', 'fire'), row('B2', null, 'edited text')], { sealed_sha256: canonicalBlindHash(rows) }), canonicalBlindHash(rows)],
    ['the reviewer registered no hash', sealed(rows), null],
    ['the registered hash is not the rows\' hash', sealed(rows), 'f'.repeat(64)],
  ])('is not independent when %s', (_name, set, registered) => {
    const report = evaluateBlindSet(set, classify, { registeredSha256: registered })
    expect(report.independent_validation, pillarWhy(PILLAR, _name)).toBe(false)
    expect(report.label).toBe('NOT_INDEPENDENT')
    expect(report.release_blocker, pillarWhy(PILLAR, 'a result that is not independent never clears the gate')).toBe(true)
  })
})

describe(`${PILLAR.id}: recall and false positives are reported separately`, () => {
  it('counts a missed emergency, a wrong route and a false alarm each once, per route, with intervals', () => {
    const rows = [
      row('P1', 'fire'), row('P2', 'fire'), row('P3', 'medical'), row('P4', 'police'),
      row('N1', null), row('N2', null), row('N3', null),
      row('J1', 'gas', 'judgement call', { kind: 'judgement' }),
    ]
    const report = evaluateBlindSet(sealed(rows), answers({ P1: 'fire', P2: null, P3: 'police', P4: 'police', N1: 'gas', J1: null }), { registeredSha256: canonicalBlindHash(rows) })
    expect(report.sample, pillarWhy(PILLAR, JSON.stringify(report.sample))).toEqual({ rows: 8, clear_rows: 7, positives: 4, negatives: 3, judgement_rows: 1 })
    expect(report.unseen_wording_recall.detected.numerator, pillarWhy(PILLAR, 'detected: fire, medical (wrong route), police')).toBe(3)
    expect(report.unseen_wording_recall.route_exact.numerator, pillarWhy(PILLAR, 'exact: fire, police')).toBe(2)
    expect(report.unseen_wording_recall.per_route.fire.detected, pillarWhy(PILLAR, 'fire 1 of 2')).toMatchObject({ numerator: 1, denominator: 2 })
    expect(report.unseen_wording_recall.per_route.gas.detected.value, pillarWhy(PILLAR, 'no gas positives: null, never 0 or 1')).toBeNull()
    expect(report.false_positives, pillarWhy(PILLAR, 'one false alarm in three quiet rows')).toMatchObject({ numerator: 1, denominator: 3 })
    expect(report.misses, pillarWhy(PILLAR, 'misses name an id and a route only')).toEqual([{ id: 'P2', expected: 'fire' }])
    expect(report.wrong_routes).toEqual([{ id: 'P3', expected: 'medical', got: 'police' }])
    expect(report.false_alarms).toEqual([{ id: 'N1', got: 'gas' }])
    expect(report.sample.judgement_rows, pillarWhy(PILLAR, 'judgement rows are excluded from every rate')).toBe(1)
  })

  it('never carries a row\'s text', () => {
    const secret = 'cụm từ riêng tư không được lộ ra'
    const rows = [row('P1', 'fire', secret), row('N1', null, `${secret} thêm`)]
    const report = evaluateBlindSet(sealed(rows), answers({}), { registeredSha256: canonicalBlindHash(rows) })
    expect(JSON.stringify(report), pillarWhy(PILLAR, 'a report is safe to attach to a review')).not.toContain(secret)
  })

  it('stays a release blocker when the sample is too small, even for a perfect and independent result', () => {
    const rows = BLIND_ROUTES.map((route) => row(`P-${route}`, route)).concat([row('N1', null)])
    const classify = (candidate: BlindRow) => candidate.expected
    const report = evaluateBlindSet(sealed(rows), classify, { registeredSha256: canonicalBlindHash(rows) })
    expect(report.independent_validation, pillarWhy(PILLAR, 'authorship is fine')).toBe(true)
    expect(report.unseen_wording_recall.detected.value, pillarWhy(PILLAR, 'every row was caught')).toBe(1)
    expect(report.sample_shortfalls.length, pillarWhy(PILLAR, 'one row per route proves nothing')).toBeGreaterThan(0)
    expect(report.release_blocker, pillarWhy(PILLAR, 'too few rows cannot clear the gate')).toBe(true)
  })

  it('can clear the gate only with enough independent rows and a recall interval above the proposed bounds', () => {
    const positives = BLIND_ROUTES.flatMap((route) => Array.from({ length: PROPOSED_BLIND_THRESHOLDS.min_positives_per_route + 5 }, (_unused, index) => row(`P-${route}-${index}`, route)))
    const negatives = Array.from({ length: PROPOSED_BLIND_THRESHOLDS.min_negatives + 20 }, (_unused, index) => row(`N-${index}`, null))
    const rows = [...positives, ...negatives]
    const report = evaluateBlindSet(sealed(rows), (candidate) => candidate.expected, { registeredSha256: canonicalBlindHash(rows) })
    expect(report.sample_shortfalls, pillarWhy(PILLAR, JSON.stringify(report.sample_shortfalls))).toEqual([])
    expect(report.below_proposed_thresholds, pillarWhy(PILLAR, JSON.stringify(report.below_proposed_thresholds))).toEqual([])
    expect(report.release_blocker, pillarWhy(PILLAR, 'a large, independent, perfect set clears the proposal')).toBe(false)
    expect(report.proposed_thresholds.owner_approved, pillarWhy(PILLAR, 'the thresholds are the owner\'s to approve')).toBe(false)
  })

  it('blocks a wrong emergency route even when detection, sample sizes and false positives meet the proposal', () => {
    const positives = BLIND_ROUTES.flatMap((route) => Array.from({ length: 40 }, (_unused, index) => row(`P-${route}-${index}`, route)))
    const negatives = Array.from({ length: 200 }, (_unused, index) => row(`N-${index}`, null))
    const rows = [...positives, ...negatives]
    const report = evaluateBlindSet(sealed(rows), (candidate) => candidate.expected === null ? null : 'fire', { registeredSha256: canonicalBlindHash(rows) })
    expect(report.independent_validation, pillarWhy(PILLAR, 'synthetic attestation exercises only the scoring mechanics')).toBe(true)
    expect(report.sample_shortfalls, pillarWhy(PILLAR, 'the result must fail on routing, not sample size')).toEqual([])
    expect(report.unseen_wording_recall.detected.value, pillarWhy(PILLAR, 'all 240 emergencies were detected')).toBe(1)
    expect(report.unseen_wording_recall.route_exact.numerator, pillarWhy(PILLAR, 'only the 40 fire rows were routed correctly')).toBe(40)
    expect(report.wrong_routes, pillarWhy(PILLAR, '200 medical, police, electrical/water, gas and uncertain rows were misrouted')).toHaveLength(200)
    expect(report.release_blocker, pillarWhy(PILLAR, 'detecting an emergency does not excuse sending the wrong guidance')).toBe(true)
  })

  it('is a blocker for a perfect, independent set that is short on one stratum alone', () => {
    const positives = BLIND_ROUTES.flatMap((route) => Array.from({ length: PROPOSED_BLIND_THRESHOLDS.min_positives_per_route + 10 }, (_unused, index) => row(`P-${route}-${index}`, route)))
    const negatives = Array.from({ length: PROPOSED_BLIND_THRESHOLDS.min_negatives - 1 }, (_unused, index) => row(`N-${index}`, null))
    const rows = [...positives, ...negatives]
    const report = evaluateBlindSet(sealed(rows), (candidate) => candidate.expected, { registeredSha256: canonicalBlindHash(rows) })
    expect(report.below_proposed_thresholds, pillarWhy(PILLAR, 'every interval is inside the proposed bounds: only the size is short')).toEqual([])
    expect(report.sample_shortfalls.length, pillarWhy(PILLAR, JSON.stringify(report.sample_shortfalls))).toBe(1)
    expect(report.release_blocker, pillarWhy(PILLAR, 'one short stratum is enough to keep the gate closed')).toBe(true)
  })

  it('blocks release when recall is poor, however large the set is', () => {
    const positives = BLIND_ROUTES.flatMap((route) => Array.from({ length: 40 }, (_unused, index) => row(`P-${route}-${index}`, route)))
    const negatives = Array.from({ length: 120 }, (_unused, index) => row(`N-${index}`, null))
    const rows = [...positives, ...negatives]
    const report = evaluateBlindSet(sealed(rows), (candidate) => candidate.id.endsWith('0') || candidate.id.endsWith('1') ? candidate.expected : null, { registeredSha256: canonicalBlindHash(rows) })
    expect(report.below_proposed_thresholds.length, pillarWhy(PILLAR, JSON.stringify(report.below_proposed_thresholds))).toBeGreaterThan(0)
    expect(report.release_blocker, pillarWhy(PILLAR, 'a poor independent result is a safety blocker, not a reason to change the data')).toBe(true)
  })
})

describe(`${PILLAR.id}: the opt-in run against a real blind set`, () => {
  it('is evaluated only when a reviewer hands over a set, and is otherwise NOT_RUN', () => {
    const file = process.env.KAEL_EVALUATE_BLIND_SET
    if (!file) return
    const set = JSON.parse(readFileSync(file, 'utf8')) as BlindSet
    const report = evaluateBlindSet(
      set,
      (candidate) => resolveReportedEmergencyGuidance(candidate.text, candidate.language, { serviceType: candidate.service ?? null })?.route ?? null,
      { registeredSha256: process.env.KAEL_BLIND_REGISTERED_SHA256 ?? null },
    )
    const out = process.env.KAEL_BLIND_EVAL_OUT
    if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
    expect(report.schema, pillarWhy(PILLAR, 'the report is written, never asserted as a pass')).toBe('kael_emergency_blind_report.v1')
  })
})
