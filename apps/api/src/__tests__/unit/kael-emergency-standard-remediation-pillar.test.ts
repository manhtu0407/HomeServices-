import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P427-kael-emergency-standard-remediation',
  invariant: 'the previously scored 92 standard probes meet the unchanged zero false positive and ninety percent correctly routed hazard criteria',
  authority: ['governance/RULES.md #8', 'docs/test-logs/kawa-four-blocker-20261022/results/h5/PREREGISTRATION.md'],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P410-kael-emergency-phrase-sets', 'P419-kael-emergency-electrical-spark', 'P420-kael-case-emergency-playbook-precedence'],
  mutation: 'restore the prior classifier: the standard probe recall and false positive assertions fail',
} as const satisfies PillarManifest

type Probe = { id: string; lang: 'vi' | 'en'; expected: string[]; text: string }
const probes = JSON.parse(readFileSync(new URL('../../../../../docs/test-logs/kawa-four-blocker-20261022/scripts/h5/fresh-probes-20261022.json', import.meta.url), 'utf8')) as { rows: Probe[] }
const newlyAuthored = JSON.parse(readFileSync(new URL('../../../../../docs/test-logs/codex-final-remediation-20261022/results/new-standard-probes.json', import.meta.url), 'utf8')) as { rows: Probe[] }

describe(PILLAR.id, () => {
  it('preserves the standard evaluation oracle and reports every missed or misrouted hazard', () => {
    const hazards = probes.rows.filter((row) => !row.expected.includes('none'))
    const missed = hazards.filter((row) => !row.expected.includes(resolveReportedEmergencyGuidance(row.text, row.lang)?.route ?? 'none'))
    expect(probes.rows.length).toBe(92)
    expect(hazards.length).toBe(57)
    expect((hazards.length - missed.length) / hazards.length, pillarWhy(PILLAR, JSON.stringify(missed.map((row) => row.id)))).toBeGreaterThanOrEqual(0.9)
  })

  it('has zero false positives on the previously scored non-hazards', () => {
    const negatives = probes.rows.filter((row) => row.expected.includes('none'))
    const falsePositives = negatives.filter((row) => resolveReportedEmergencyGuidance(row.text, row.lang) !== null)
    expect(negatives.length).toBe(35)
    expect(falsePositives.map((row) => row.id), pillarWhy(PILLAR, 'standard non-hazards')).toEqual([])
  })

  it.each(newlyAuthored.rows)('newly authored standard regression $id: $text', (row) => {
    const route = resolveReportedEmergencyGuidance(row.text, row.lang)?.route ?? 'none'
    expect(row.expected, pillarWhy(PILLAR, `${row.id}: ${route}`)).toContain(route)
  })
})
