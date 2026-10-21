// Scoring for a blind emergency evaluation set that someone other than the implementer wrote and sealed. It reads a set,
// classifies each row with the classifier it is given, and returns counts, intervals and a verdict. It never returns or
// logs a row's text, so a report can be attached to a review without leaking the set.

import { createHash } from 'node:crypto'

export const BLIND_ROUTES = ['fire', 'medical', 'police', 'electrical_water', 'gas', 'uncertain'] as const
export type BlindRoute = (typeof BLIND_ROUTES)[number]

export type BlindRow = {
  id: string
  text: string
  expected: BlindRoute | null
  language: 'vi' | 'en'
  kind: 'clear' | 'judgement'
  service?: string
}

export type BlindSet = {
  schema: 'kael_emergency_blind_set.v1'
  reviewer_attestation: {
    reviewer: string
    author_is_implementer: boolean
    sealed_at: string
    sealed_sha256: string
    source: string
  }
  rows: BlindRow[]
}

// Proposed release thresholds. They are a recommendation for the owner and have no authority until the owner approves
// them, which the report states.
export const PROPOSED_BLIND_THRESHOLDS = {
  overall_recall_lower_bound: 0.9,
  per_route_recall_lower_bound: 0.8,
  false_positive_upper_bound: 0.05,
  min_positives_per_route: 30,
  min_negatives: 100,
  owner_approved: false,
} as const

export function canonicalBlindHash(rows: readonly BlindRow[]): string {
  return createHash('sha256')
    .update(JSON.stringify(rows.map((row) => [row.id, row.text, row.expected, row.language, row.kind, row.service ?? null])))
    .digest('hex')
}

// Wilson score interval; null when there is nothing to divide.
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null
  const p = successes / n
  const denominator = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)
  return { low: Math.max(0, (centre - margin) / denominator), high: Math.min(1, (centre + margin) / denominator) }
}

// The smallest sample in which zero misses still proves a recall of at least `lowerBound` at the same confidence.
export function zeroMissSampleFor(lowerBound: number, z = 1.96): number {
  for (let n = 1; n < 100_000; n += 1) {
    const interval = wilsonInterval(n, n, z)
    if (interval && interval.low >= lowerBound) return n
  }
  return Number.POSITIVE_INFINITY
}

export function validateBlindSet(set: unknown): string[] {
  const errors: string[] = []
  const value = set as Partial<BlindSet> | null
  if (!value || typeof value !== 'object') return ['the set is not an object']
  if (value.schema !== 'kael_emergency_blind_set.v1') errors.push('schema must be kael_emergency_blind_set.v1')
  const attestation = value.reviewer_attestation
  if (!attestation) errors.push('reviewer_attestation is required')
  else {
    for (const key of ['reviewer', 'sealed_at', 'sealed_sha256', 'source'] as const) {
      if (typeof attestation[key] !== 'string' || attestation[key].length === 0) errors.push(`reviewer_attestation.${key} is required`)
    }
    if (typeof attestation.author_is_implementer !== 'boolean') errors.push('reviewer_attestation.author_is_implementer must be a boolean')
  }
  if (!Array.isArray(value.rows) || value.rows.length === 0) return [...errors, 'rows must be a non-empty array']
  const seen = new Set<string>()
  for (const row of value.rows as Partial<BlindRow>[]) {
    if (typeof row.id !== 'string' || row.id.length === 0) errors.push('every row needs an id')
    else if (seen.has(row.id)) errors.push(`duplicate row id ${row.id}`)
    else seen.add(row.id)
    if (typeof row.text !== 'string' || row.text.trim().length === 0) errors.push(`row ${row.id} needs text`)
    if (row.expected !== null && !BLIND_ROUTES.includes(row.expected as BlindRoute)) errors.push(`row ${row.id} has an unknown expected route`)
    if (row.language !== 'vi' && row.language !== 'en') errors.push(`row ${row.id} needs a language of vi or en`)
    if (row.kind !== 'clear' && row.kind !== 'judgement') errors.push(`row ${row.id} needs a kind of clear or judgement`)
  }
  return errors
}

type Ratio = { numerator: number; denominator: number; value: number | null; wilson95: { low: number; high: number } | null }
const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  value: denominator > 0 ? numerator / denominator : null,
  wilson95: wilsonInterval(numerator, denominator),
})

export type BlindReport = ReturnType<typeof evaluateBlindSet>

export function evaluateBlindSet(
  set: BlindSet,
  classify: (row: BlindRow) => BlindRoute | null,
  options: { registeredSha256?: string | null } = {},
) {
  const problems = validateBlindSet(set)
  if (problems.length > 0) throw new Error(`invalid blind set: ${problems.join('; ')}`)
  const recomputed = canonicalBlindHash(set.rows)
  const reasonsNotIndependent: string[] = []
  if (set.reviewer_attestation.author_is_implementer !== false) reasonsNotIndependent.push('the reviewer did not attest that the author is not the implementer')
  if (recomputed !== set.reviewer_attestation.sealed_sha256) reasonsNotIndependent.push('the rows do not match the sealed hash in the attestation')
  if (!options.registeredSha256) reasonsNotIndependent.push('no hash was registered by the reviewer out of band')
  else if (options.registeredSha256 !== recomputed) reasonsNotIndependent.push('the rows do not match the hash the reviewer registered out of band')

  const clear = set.rows.filter((row) => row.kind === 'clear')
  const results = clear.map((row) => ({ row, got: classify(row) }))
  const positives = results.filter((entry) => entry.row.expected !== null)
  const negatives = results.filter((entry) => entry.row.expected === null)
  const detected = positives.filter((entry) => entry.got !== null)
  const routed = positives.filter((entry) => entry.got === entry.row.expected)
  const falseAlarms = negatives.filter((entry) => entry.got !== null)

  const perRoute = Object.fromEntries(BLIND_ROUTES.map((route) => {
    const rows = positives.filter((entry) => entry.row.expected === route)
    return [route, {
      detected: ratio(rows.filter((entry) => entry.got !== null).length, rows.length),
      route_exact: ratio(rows.filter((entry) => entry.got === route).length, rows.length),
    }]
  })) as Record<BlindRoute, { detected: Ratio; route_exact: Ratio }>

  const overall = ratio(detected.length, positives.length)
  const falsePositive = ratio(falseAlarms.length, negatives.length)
  const thresholds = PROPOSED_BLIND_THRESHOLDS
  const shortfalls: string[] = []
  for (const route of BLIND_ROUTES) {
    if (perRoute[route].detected.denominator < thresholds.min_positives_per_route) shortfalls.push(`${route}: ${perRoute[route].detected.denominator} positives, ${thresholds.min_positives_per_route} needed`)
  }
  if (negatives.length < thresholds.min_negatives) shortfalls.push(`${negatives.length} negatives, ${thresholds.min_negatives} needed`)
  const failing: string[] = []
  if (routed.length < detected.length) failing.push('wrong emergency routes in clear positives')
  if (overall.wilson95 && overall.wilson95.low < thresholds.overall_recall_lower_bound) failing.push('overall recall lower bound below the proposed threshold')
  for (const route of BLIND_ROUTES) {
    const interval = perRoute[route].detected.wilson95
    if (interval && interval.low < thresholds.per_route_recall_lower_bound) failing.push(`${route} recall lower bound below the proposed threshold`)
  }
  if (falsePositive.wilson95 && falsePositive.wilson95.high > thresholds.false_positive_upper_bound) failing.push('false-positive upper bound above the proposed threshold')

  return {
    schema: 'kael_emergency_blind_report.v1' as const,
    label: reasonsNotIndependent.length === 0 ? ('INDEPENDENT_BLIND' as const) : ('NOT_INDEPENDENT' as const),
    independent_validation: reasonsNotIndependent.length === 0,
    reasons_not_independent: reasonsNotIndependent,
    evidence_tier: 'T0' as const,
    sealed_sha256: recomputed,
    sample: { rows: set.rows.length, clear_rows: clear.length, positives: positives.length, negatives: negatives.length, judgement_rows: set.rows.length - clear.length },
    unseen_wording_recall: { detected: overall, route_exact: ratio(routed.length, positives.length), per_route: perRoute },
    false_positives: falsePositive,
    misses: positives.filter((entry) => entry.got === null).map((entry) => ({ id: entry.row.id, expected: entry.row.expected })),
    wrong_routes: positives.filter((entry) => entry.got !== null && entry.got !== entry.row.expected).map((entry) => ({ id: entry.row.id, expected: entry.row.expected, got: entry.got })),
    false_alarms: falseAlarms.map((entry) => ({ id: entry.row.id, got: entry.got })),
    proposed_thresholds: thresholds,
    sample_shortfalls: shortfalls,
    below_proposed_thresholds: failing,
    release_blocker: reasonsNotIndependent.length > 0 || shortfalls.length > 0 || failing.length > 0,
    limits: [
      'T0 rule classifier only: no model, no device, no real customer text.',
      'The thresholds are a proposal and have no authority until the owner approves them.',
      'A passing independent result supports a recall claim for the wording the reviewer sampled, not for wording nobody has seen.',
    ],
  }
}
