// Reads the structured blocker fields the server already persists on the Case Work artifact
// (`quote_blockers`, `missing_facts`, `next_action.reason`, `facts`) and the policy coverage.
// Chat text and free-text reasons are never parsed: a field this reader does not recognise
// degrades to `review_unspecified` rather than to a guessed cause.

import { quoteSlotKeys } from './case-work-localization'

export type QuoteBlockerKind =
  | 'scope_missing'
  | 'price_evidence_unavailable'
  | 'scope_and_price_missing'
  | 'inspection_required'
  | 'policy_blocked'
  | 'support_review'
  | 'review_unspecified'

export type QuoteBlockerView = Readonly<{
  kind: QuoteBlockerKind
  missingSlots: readonly string[]
  recorded: readonly Readonly<{ slot: string; value: string }>[]
}>

const PRICE_EVIDENCE_BLOCKER = 'validated_price_evidence'
const PRICE_EVIDENCE_REASON = 'validated_price_evidence_unavailable'
const ONSITE_BLOCKER = 'onsite_inspection_required'
const SCOPE_FACT_PREFIX = 'missing_profile_fact:'
const SUPPORT_REVIEW_REASON = 'case_work_turn_safety_limit'
const MAX_RECORDED = 3
const MAX_RECORDED_LENGTH = 80

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function scopeSlotsOf(codes: readonly string[]) {
  return codes.flatMap((code) => code.startsWith(SCOPE_FACT_PREFIX) ? [code.slice(SCOPE_FACT_PREFIX.length)] : [])
}

function truncate(value: string) {
  const text = value.trim()
  return text.length > MAX_RECORDED_LENGTH ? `${text.slice(0, MAX_RECORDED_LENGTH - 1)}…` : text
}

export function buildQuoteBlockerView(input: {
  diagnosisScope?: unknown
  intakeCoverage?: unknown
  reason?: string
}): QuoteBlockerView {
  const scope = asRecord(input.diagnosisScope)
  const nextAction = asRecord(scope.next_action)
  const reason = typeof nextAction.reason === 'string' ? nextAction.reason : input.reason
  const blockers = stringList(scope.quote_blockers)
  const missingFacts = stringList(scope.missing_facts)
  const missingSlots = [...new Set([
    ...missingFacts,
    ...scopeSlotsOf(blockers),
    ...(reason ? scopeSlotsOf([reason]) : []),
  ])]
  const facts = asRecord(scope.facts)
  const recorded = quoteSlotKeys.flatMap((slot) => {
    const value = facts[slot]
    return !missingSlots.includes(slot) && typeof value === 'string' && value.trim()
      ? [{ slot, value: truncate(value) }]
      : []
  }).slice(0, MAX_RECORDED)
  const priceMissing = blockers.includes(PRICE_EVIDENCE_BLOCKER) || reason === PRICE_EVIDENCE_REASON
  const make = (kind: QuoteBlockerKind): QuoteBlockerView => ({ kind, missingSlots, recorded })

  if (asRecord(input.intakeCoverage).quote_mode === 'blocked') return make('policy_blocked')
  if (reason === SUPPORT_REVIEW_REASON) return make('support_review')
  if (blockers.includes(ONSITE_BLOCKER)) return make('inspection_required')
  if (missingSlots.length > 0 && priceMissing) return make('scope_and_price_missing')
  if (missingSlots.length > 0) return make('scope_missing')
  if (priceMissing) return make('price_evidence_unavailable')
  return make('review_unspecified')
}
