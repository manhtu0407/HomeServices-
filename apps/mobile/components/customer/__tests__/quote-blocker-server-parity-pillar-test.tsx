import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { localizedQuoteBlockerCopy } from '../kael-chat/case-work-localization'
import { buildQuoteBlockerView } from '../kael-chat/quote-blocker-view-model'

export const PILLAR = {
  id: 'P399-quote-blocker-server-parity',
  invariant:
    'the quote card is built from the payload the real Edge route sends for the HVAC incident Case, not from a hand-written scope: after the unit answer it names the missing price evidence, and after a WHY question it keeps naming it instead of falling back to the generic review sentence',
  authority: [
    'governance/RULES.md #8 (no silent degradation: a known blocker is shown, not replaced by a generic sentence)',
    'governance/RULES.md #4 (no price without validated evidence)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/quote-blocker-view-model.ts',
  layer: 'integration',
  siblings: ['P397-quote-blocker-states', 'P398-kael-recurring-incident-e2e'],
  mutation:
    'make buildQuoteBlockerView ignore quote_blockers - the server-sent turn 1 payload reads as review_unspecified and the first case turns red',
} as const satisfies PillarManifest

const FIXTURE_DIR = resolve(__dirname, '../../../../api/src/__tests__/kael-edge-runtime/fixtures/hvac-recurring-incident')

function serverPayload(name: string) {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${name}.json`), 'utf8')) as {
    diagnosis_scope: unknown
    intake_coverage: unknown
  }
}

const viewOf = (name: string) => {
  const payload = serverPayload(name)
  return buildQuoteBlockerView({ diagnosisScope: payload.diagnosis_scope, intakeCoverage: payload.intake_coverage })
}

const genericReviewCopy = localizedQuoteBlockerCopy({ kind: 'review_unspecified', missingSlots: [], recorded: [] }, 'vi')

describe(`${PILLAR.id}: the card reads what the server sent`, () => {
  it('names the missing price evidence on the payload sent after the unit answer', () => {
    const view = viewOf('01-after-unit-answer')
    withPillarContext(PILLAR, () => {
      expect(view.kind).toBe('price_evidence_unavailable')
      expect(localizedQuoteBlockerCopy(view, 'vi')).not.toEqual(genericReviewCopy)
      expect(localizedQuoteBlockerCopy(view, 'en').title).not.toEqual(localizedQuoteBlockerCopy({ ...view, kind: 'review_unspecified' }, 'en').title)
    }, `view=${JSON.stringify(view)}`)
  })

  it('keeps naming the missing price evidence on the payload sent after a WHY question', () => {
    const view = viewOf('02-after-why-question')
    withPillarContext(PILLAR, () => {
      expect(view.kind).toBe('price_evidence_unavailable')
    }, `view=${JSON.stringify(view)}`)
  })
})
