import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P419-kael-emergency-electrical-spark',
  invariant:
    'a spark reported beside wired electrical equipment is routed to the electrical hazard guidance whatever the word order, accents or language, while a negated, past, hypothetical, resolved, quoted, mis-toned or non-electrical spark, and equipment that is only warm, stay quiet',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate)',
    'governance/RULES.md #8 (a measurement states its sample and its limits)',
    'KAWA_01 six-service diagnostic DX-02 (frozen ELEC-S4 step 4 transcript was missed by the shared gate)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P405-kael-emergency-signal-matrix', 'P410-kael-emergency-phrase-sets', 'P408-kael-case-emergency-all-fields'],
  mutation:
    'delete the spark-with-wired-equipment cue from the electrical_water list: every positive row, including the frozen transcript, turns red while the negative rows stay green',
} as const satisfies PillarManifest

const route = (text: string, language: 'vi' | 'en' = 'vi') =>
  resolveReportedEmergencyGuidance(text, language, { serviceType: 'electrical' })?.route ?? null

const FROZEN_ELEC_S4 = 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ.'

const POSITIVE: ReadonlyArray<readonly [string, string, 'vi' | 'en']> = [
  ['frozen ELEC-S4 transcript', FROZEN_ELEC_S4, 'vi'],
  ['frozen transcript without diacritics', 'Tu dien bay gio nong rat tay, co mui khet va thay tia lua xet sau canh tu.', 'vi'],
  ['frozen transcript in capitals', FROZEN_ELEC_S4.toUpperCase(), 'vi'],
  ['spark without smell or heat', 'Tủ điện đang có tia lửa xẹt sau cánh tủ.', 'vi'],
  ['spark named before the equipment', 'Thấy tia lửa xẹt sau cánh tủ điện, tủ nóng rát tay.', 'vi'],
  ['socket that is hot, smells burnt and flashes', 'Ổ cắm nóng, có mùi khét, thấy tia lửa nháy bên trong.', 'vi'],
  ['distribution board flash', 'Bảng điện sau cửa vừa có tia lửa chớp lên một cái.', 'vi'],
  ['single-change control: spark from the equipment', 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt từ tủ điện.', 'vi'],
  ['single-change control: tia lửa điện', 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa điện xẹt sau cánh tủ.', 'vi'],
  ['English panel with heat, smell and sparks', 'The electrical panel is burning hot, there is a burning smell and I can see sparks behind the cover.', 'en'],
  ['English sparks at a breaker box', 'I saw sparks jump inside the breaker box just now.', 'en'],
]

const NEGATIVE: ReadonlyArray<readonly [string, string, 'vi' | 'en']> = [
  ['negated spark and smell', 'Tủ điện không có tia lửa và không có mùi khét, chỉ cần thợ kiểm tra định kỳ.', 'vi'],
  ['negated spark without diacritics', 'Tu dien khong co tia lua, nong binh thuong.', 'vi'],
  ['spark reported yesterday', 'Hôm qua tủ điện có tia lửa nhưng thợ đã sửa xong.', 'vi'],
  ['spark reported last week', 'Tuần trước ổ cắm từng bị tia lửa, nhờ thợ thay ổ mới.', 'vi'],
  ['hypothetical spark', 'Nếu tủ điện có tia lửa thì tôi phải làm gì?', 'vi'],
  ['spark that has stopped', 'Tủ điện có tia lửa xẹt nhưng đã hết rồi.', 'vi'],
  ['gas stove ignition near a socket', 'Bếp ga nhà mình hay có tia lửa khi bật, nhờ thợ kiểm tra ổ cắm gần bếp.', 'vi'],
  ['equipment that is warm and smells, no spark', 'Tủ điện nóng và có mùi khét, nhờ thợ kiểm tra.', 'vi'],
  ['spark with no equipment', 'Pháo hoa bắn tia lửa rất đẹp.', 'vi'],
  ['quoted label', 'Tủ điện hãng có ghi "tia lửa" trên nhãn.', 'vi'],
  ['wrong tone on lửa', 'Tủ điện có tia lúa xẹt sau cánh tủ.', 'vi'],
  ['ordinary maintenance', 'Nhờ thợ thay ổ cắm và kiểm tra tủ điện, không có sự cố gì.', 'vi'],
  ['English negated', 'There are no sparks and the electrical panel is cold.', 'en'],
  ['English past', 'Last week the panel had sparks but it is fixed now.', 'en'],
  ['English hypothetical', 'What should I do if the outlet sparks?', 'en'],
]

describe(`${PILLAR.id}: a spark beside wired equipment is an electrical hazard`, () => {
  it.each(POSITIVE)('%s -> electrical_water', (label, text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBe('electrical_water')
  })

  it('names 112, 114 and 115 for the frozen transcript, in the language it was written in', () => {
    const vi = resolveReportedEmergencyGuidance(FROZEN_ELEC_S4, 'vi', { serviceType: 'electrical' })
    const why = pillarWhy(PILLAR, `response=${vi?.response ?? 'none'}`)
    for (const number of ['112', '114', '115']) expect(vi?.response ?? '', why).toContain(number)
  })

  it('keeps the route a single-change counterfactual already had: flames named instead of sparks is still a fire', () => {
    const got = route('Tủ điện bây giờ nóng rát tay, có mùi khét và thấy lửa sau cánh tủ.')
    expect(got, pillarWhy(PILLAR, `routed to ${String(got)}`)).toBe('fire')
  })

  it('does not depend on the Case service: the same words route from any of the six services', () => {
    for (const service of ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']) {
      const got = resolveReportedEmergencyGuidance(FROZEN_ELEC_S4, 'vi', { serviceType: service })?.route ?? null
      expect(got, pillarWhy(PILLAR, `service=${service} routed to ${String(got)}`)).toBe('electrical_water')
    }
  })
})

describe(`${PILLAR.id}: nothing that is not a live electrical spark is escalated`, () => {
  it.each(NEGATIVE)('%s -> no route', (label, text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBeNull()
  })
})

describe(`${PILLAR.id}: each clause of the frozen transcript alone stays quiet (pinned: an owner decision, not a fix)`, () => {
  it.each([
    ['the hot panel alone', 'Tủ điện bây giờ nóng rát tay.'],
    ['the burning smell alone', 'Có mùi khét.'],
    ['the spark alone, no equipment named', 'Thấy tia lửa xẹt sau cánh tủ.'],
  ])('%s -> no route', (label, text) => {
    const got = route(text)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBeNull()
  })
})
