import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P419-kael-emergency-electrical-spark',
  invariant:
    'a spark reported beside wired electrical equipment is routed to the electrical hazard guidance whatever the word order, accents or language, while a negated, past, hypothetical, resolved, quoted, mis-toned or non-electrical spark, a spark named only as a product feature or something to avoid, and equipment that is only warm, stay quiet, unless the customer is trying to stop a spark that is happening or says where it comes from',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate)',
    'governance/RULES.md #8 (a measurement states its sample and its limits)',
    'KAWA_01 six-service diagnostic DX-02 (frozen ELEC-S4 step 4 transcript was missed by the shared gate)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P405-kael-emergency-signal-matrix', 'P410-kael-emergency-phrase-sets', 'P408-kael-case-emergency-all-fields'],
  mutation:
    'delete the spark-with-wired-equipment cue from the electrical_water list: every positive row, including the frozen transcript, turns red while the negative rows stay green; delete the spark-prevention mask: the product and prevention rows turn red while the positive rows stay green; delete the attempt and source test from the mask: the attempt rows turn red while the product rows stay green',
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

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const WRITTEN_FORMS: ReadonlyArray<readonly [string, (value: string) => string]> = [
  ['as typed', (value) => value],
  ['without diacritics', stripDiacritics],
  ['in capitals', (value) => value.toUpperCase()],
]

const VI_FIXTURES = ['ổ cắm', 'công tắc', 'aptomat', 'cầu dao', 'bảng điện', 'tủ điện'] as const
const VI_PREVENTION = ['chống', 'ngăn', 'ngăn ngừa', 'phòng ngừa', 'hạn chế', 'giảm', 'tránh', 'chịu', 'chống phát sinh', 'hạn chế phát sinh'] as const
const VI_PRODUCT_CARRIERS: ReadonlyArray<(fixture: string, prevention: string) => string> = [
  (fixture, prevention) => `Nhờ lắp ${fixture} ${prevention} tia lửa cho bếp.`,
  (fixture, prevention) => `Cần thay ${fixture} ${prevention} tia lửa điện trong phòng khách.`,
  (fixture, prevention) => `Báo giá giúp mình ${fixture} ${prevention} tia lửa.`,
  (fixture, prevention) => `Tư vấn loại ${fixture} ${prevention} tia lửa cho căn hộ mới.`,
]

const EN_FIXTURES = ['outlet', 'socket', 'breaker', 'electrical panel', 'junction box'] as const
const EN_MODIFIERS = ['anti-spark', 'spark-proof', 'spark-resistant', 'spark-free', 'spark-safe', 'non-sparking', 'sparkproof'] as const
const EN_MODIFIER_CARRIERS: ReadonlyArray<(fixture: string, modifier: string) => string> = [
  (fixture, modifier) => `Please install the ${modifier} ${fixture} in the kitchen.`,
  (fixture, modifier) => `Can you quote a ${modifier} ${fixture}?`,
  (fixture, modifier) => `I want to replace my ${fixture} with a ${modifier} one.`,
]
const EN_NOUNS = ['spark arrestor', 'spark protection', 'spark suppression', 'spark prevention'] as const
const EN_NOUN_CARRIERS: ReadonlyArray<(fixture: string, noun: string) => string> = [
  (fixture, noun) => `Please fit ${noun} on the ${fixture}.`,
  (fixture, noun) => `I need ${noun} for the ${fixture} in the garage.`,
]
const EN_PREVENTION_VERBS = ['prevent', 'avoid', 'stop', 'reduce', 'suppress', 'limit'] as const

function misrouted(rows: ReadonlyArray<readonly [string, 'vi' | 'en']>, expected: 'electrical_water' | null) {
  return rows
    .map(([text, language]) => [text, route(text, language)] as const)
    .filter(([, got]) => got !== expected)
    .map(([text, got]) => `${JSON.stringify(text)} -> ${String(got)}`)
}

const viProductRows = (prevention: string) =>
  VI_FIXTURES.flatMap((fixture) =>
    VI_PRODUCT_CARRIERS.flatMap((carrier) => WRITTEN_FORMS.map(([, write]) => [write(carrier(fixture, prevention)), 'vi'] as const)),
  )

describe(`${PILLAR.id}: a spark named only as a product feature or something to avoid is not a live hazard`, () => {
  it.each(VI_PREVENTION)('Vietnamese: "%s tia lửa" in installation, replacement, quote and advice requests stays quiet', (prevention) => {
    const rows = viProductRows(prevention)
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} written forms of "${prevention} tia lửa"`)).toEqual([])
  })

  it.each(EN_MODIFIERS)('English: "%s" fixtures in installation, replacement and quote requests stay quiet', (modifier) => {
    const rows = EN_FIXTURES.flatMap((fixture) => EN_MODIFIER_CARRIERS.map((carrier) => [carrier(fixture, modifier), 'en'] as const))
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} sentences with "${modifier}"`)).toEqual([])
  })

  it.each(EN_NOUNS)('English: "%s" as the thing being fitted stays quiet', (noun) => {
    const rows = EN_FIXTURES.flatMap((fixture) => EN_NOUN_CARRIERS.map((carrier) => [carrier(fixture, noun), 'en'] as const))
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} sentences with "${noun}"`)).toEqual([])
  })

  it.each(EN_PREVENTION_VERBS)('English: a request for equipment that will %s sparks stays quiet', (verb) => {
    const rows = EN_FIXTURES.flatMap((fixture) => [
      [`Looking for a ${fixture} that can ${verb} sparks when I plug appliances in.`, 'en'] as const,
      [`Which ${fixture} would ${verb} sparking best in a damp bathroom?`, 'en'] as const,
    ])
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} sentences with "${verb}"`)).toEqual([])
  })

  it.each([
    ['the Codex review example in Vietnamese', 'Nhờ lắp ổ cắm chống tia lửa cho bếp.', 'vi'],
    ['the Codex review example in English', 'Please replace the spark-proof outlet cover.', 'en'],
    ['a negated spark inside a routine installation request', 'Lắp ổ cắm mới giúp mình, ổ cũ không có tia lửa nhưng đã ố vàng.', 'vi'],
    ['an English negated spark inside a routine installation request', 'Install a new outlet; the old one looks scorched but has not sparked.', 'en'],
    ['a plain installation request', 'Nhờ lắp ổ cắm mới cho bếp từ.', 'vi'],
    ['a plain English replacement request', 'Please replace the outlet cover in the hallway.', 'en'],
    ['a routine wiring quote', 'Báo giá đi lại dây điện và thay công tắc cho phòng ngủ.', 'vi'],
  ] as const)('%s -> no route', (label, text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBeNull()
  })
})

describe(`${PILLAR.id}: a product mention never hides a spark that is actually happening`, () => {
  it.each(VI_PREVENTION)('Vietnamese: after "%s tia lửa" a real spark in the same message still routes', (prevention) => {
    const rows = VI_FIXTURES.flatMap((fixture) =>
      WRITTEN_FORMS.map(([, write]) => [write(`Nhờ lắp ${fixture} ${prevention} tia lửa cho bếp. Nhưng ${fixture} cũ vừa có tia lửa xẹt ra, nóng rát tay.`), 'vi'] as const),
    )
    expect(misrouted(rows, 'electrical_water'), pillarWhy(PILLAR, `${rows.length} written forms`)).toEqual([])
  })

  it.each(EN_MODIFIERS)('English: next to a "%s" fixture, a real spark in the same message still routes', (modifier) => {
    const rows = EN_FIXTURES.map((fixture) => [`Please install the ${modifier} ${fixture} in the kitchen. But the old ${fixture} is sparking right now.`, 'en'] as const)
    expect(misrouted(rows, 'electrical_water'), pillarWhy(PILLAR, `${rows.length} sentences`)).toEqual([])
  })

  it.each([
    ['the product itself sparks', 'Ổ cắm chống tia lửa này vừa bắn tia lửa ra, nóng rát tay.', 'vi'],
    ['the product claims protection yet sparks', 'Ổ cắm loại hạn chế tia lửa, vậy mà ổ cắm đang xẹt tia lửa, mùi khét.', 'vi'],
    ['English: the cover is melted and the outlet sparks', 'The spark-proof outlet cover is melted and the outlet is sparking.', 'en'],
    ['English: new anti-spark socket now sparks', 'We installed an anti-spark socket and now I can see sparks coming out of it.', 'en'],
    ['a protection that is not stopping the sparks is a report', 'Cầu dao loại chống tia lửa, vậy mà ổ cắm vẫn đang xẹt tia lửa.', 'vi'],
    ['English: cannot stop the sparks', 'I cannot stop the sparks coming out of the outlet.', 'en'],
    ['English: protection that fails to stop sparks', 'The breaker fails to stop sparks at the outlet, it is sparking right now.', 'en'],
    ['a few sparks are still sparks', 'Ổ cắm đang có ít tia lửa xẹt ra, mùi khét.', 'vi'],
  ] as const)('%s -> electrical_water', (label, text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBe('electrical_water')
  })
})

const VI_ATTEMPT_VERBS = ['ngăn', 'chặn', 'ngăn ngừa', 'hạn chế', 'chống', 'giảm'] as const
const VI_ATTEMPT_CARRIERS: ReadonlyArray<(fixture: string, verb: string) => string> = [
  (fixture, verb) => `Tôi đang cố ${verb} tia lửa điện bắn ra từ ${fixture}.`,
  (fixture, verb) => `Mình đang ${verb} tia lửa xẹt ra từ ${fixture}.`,
  (fixture, verb) => `Em cố gắng ${verb} tia lửa ở ${fixture} nhưng vẫn không được.`,
  (fixture, verb) => `Nhờ thợ ${verb} tia lửa phát ra từ ${fixture} giúp mình.`,
  (fixture, verb) => `Cần ${verb} tia lửa bắn ra ngay tại ${fixture}.`,
]
const EN_ATTEMPT_VERBS = ['stop', 'suppress', 'limit', 'reduce'] as const
const EN_ATTEMPT_CARRIERS: ReadonlyArray<(fixture: string, verb: string) => string> = [
  (fixture, verb) => `I am trying to ${verb} sparks coming out of the ${fixture}.`,
  (fixture, verb) => `We tried to ${verb} the sparks at the ${fixture} but they keep appearing.`,
  (fixture, verb) => `Please help me ${verb} sparks coming from the ${fixture}.`,
  (fixture, verb) => `How do I ${verb} sparks shooting out of the ${fixture}?`,
]
const VI_NEED_CARRIERS: ReadonlyArray<(fixture: string, prevention: string) => string> = [
  (fixture, prevention) => `Tôi đang cần ${fixture} ${prevention} tia lửa cho phòng bếp.`,
  (fixture, prevention) => `Mình đang tìm ${fixture} ${prevention} tia lửa bắn ra ngoài khi cắm sạc.`,
  (fixture, prevention) => `${fixture.charAt(0).toUpperCase()}${fixture.slice(1)} có ${prevention} tia lửa không, nhờ tư vấn giúp.`,
  (fixture, prevention) => `Nhờ lắp ${fixture} để ${prevention} tia lửa bắn ra từ phích cắm.`,
  (fixture, prevention) => `Lắp ${fixture} có thể ${prevention} tia lửa phát ra từ tiếp điểm.`,
]
const EN_NEED_CARRIERS: ReadonlyArray<(fixture: string, verb: string) => string> = [
  (fixture, verb) => `Looking for a ${fixture} cover that can ${verb} sparks when I plug appliances in.`,
  (fixture, verb) => `I need a ${fixture} designed to ${verb} sparks coming out of the contacts.`,
  (fixture, verb) => `Which ${fixture} would ${verb} sparks coming from the plug best?`,
]

describe(`${PILLAR.id}: an attempt to stop a spark that is happening is a report, not a product description`, () => {
  it.each(VI_ATTEMPT_VERBS)('Vietnamese: "%s tia lửa" while trying, asking for help or saying where it comes from still routes', (verb) => {
    const rows = VI_FIXTURES.flatMap((fixture) =>
      VI_ATTEMPT_CARRIERS.flatMap((carrier) => WRITTEN_FORMS.map(([, write]) => [write(carrier(fixture, verb)), 'vi'] as const)),
    )
    expect(misrouted(rows, 'electrical_water'), pillarWhy(PILLAR, `${rows.length} written forms of "${verb} tia lửa"`)).toEqual([])
  })

  it.each(EN_ATTEMPT_VERBS)('English: "%s sparks" while trying, asking for help or saying where they come from still routes', (verb) => {
    const rows = EN_FIXTURES.flatMap((fixture) => EN_ATTEMPT_CARRIERS.map((carrier) => [carrier(fixture, verb), 'en'] as const))
    expect(misrouted(rows, 'electrical_water'), pillarWhy(PILLAR, `${rows.length} sentences with "${verb}"`)).toEqual([])
  })

  it.each([
    ['the Codex review example', 'Tôi đang cố ngăn tia lửa điện bắn ra từ ổ cắm.', 'vi'],
    ['trying, with diacritics, and no place named', 'Tôi cố ngăn tia lửa ở ổ cắm.', 'vi'],
    ['trying, in capitals', 'TÔI ĐANG CỐ CHẶN TIA LỬA Ở CẦU DAO.', 'vi'],
    ['English: trying to stop sparks', 'I am trying to stop sparks coming out of the outlet.', 'en'],
  ] as const)('%s -> electrical_water', (label, text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBe('electrical_water')
  })

  it.each(VI_PREVENTION)('Vietnamese: "%s tia lửa" asked for, offered, described as a capability or given as a purpose stays quiet', (prevention) => {
    const rows = VI_FIXTURES.flatMap((fixture) =>
      VI_NEED_CARRIERS.flatMap((carrier) => WRITTEN_FORMS.map(([, write]) => [write(carrier(fixture, prevention)), 'vi'] as const)),
    )
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} written forms of "${prevention} tia lửa"`)).toEqual([])
  })

  it.each(EN_PREVENTION_VERBS)('English: a product that can %s sparks, asked for in a request, stays quiet', (verb) => {
    const rows = EN_FIXTURES.flatMap((fixture) => EN_NEED_CARRIERS.map((carrier) => [carrier(fixture, verb), 'en'] as const))
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} sentences with "${verb}"`)).toEqual([])
  })
})

const SHOT_SPARK_CARRIERS: ReadonlyArray<(fixture: string) => string> = [
  (fixture) => `${fixture.charAt(0).toUpperCase()}${fixture.slice(1)} đang phóng tia lửa, nóng rát tay.`,
  (fixture) => `${fixture.charAt(0).toUpperCase()}${fixture.slice(1)} phóng tia lửa mỗi lần bật.`,
  (fixture) => `Thấy ${fixture} phóng tia lửa điện ra ngoài.`,
]

describe(`${PILLAR.id}: a spark that is shot out is a report although "phóng" and "phòng" share a plain spelling`, () => {
  it.each(VI_FIXTURES)('%s: "phóng tia lửa" in every written form still routes', (fixture) => {
    const rows = SHOT_SPARK_CARRIERS.flatMap((carrier) => WRITTEN_FORMS.map(([, write]) => [write(carrier(fixture)), 'vi'] as const))
    expect(misrouted(rows, 'electrical_water'), pillarWhy(PILLAR, `${rows.length} written forms with ${fixture}`)).toEqual([])
  })

  it.each(VI_FIXTURES)('%s: "phòng tia lửa" typed with its tone, as a feature of a new fixture, stays quiet', (fixture) => {
    const rows = [
      [`Nhờ lắp ${fixture} phòng tia lửa cho bếp.`, 'vi'] as const,
      [`Cần thay ${fixture} phòng ngừa tia lửa điện trong phòng khách.`, 'vi'] as const,
      [`NHỜ LẮP ${fixture.toUpperCase()} PHÒNG TIA LỬA CHO BẾP.`, 'vi'] as const,
    ]
    expect(misrouted(rows, null), pillarWhy(PILLAR, `${rows.length} written forms with ${fixture}`)).toEqual([])
  })
})

const SECOND_SPARK_PROBE_SET: ReadonlyArray<readonly ['report' | 'quiet', 'vi' | 'en', string]> = [
  ['report', 'vi', 'Em đang cố chặn tia lửa nhảy ra từ cái ổ cắm trong bếp.'],
  ['report', 'vi', 'Cứu với, ổ cắm đang phóng tia lửa, tôi đang cố ngăn nó lại.'],
  ['report', 'vi', 'Nhờ thợ qua ngăn giúp tia lửa xẹt ra từ cầu dao nhà mình.'],
  ['report', 'vi', 'Tôi cố gắng chặn tia lửa bắn từ bảng điện mà không được.'],
  ['report', 'en', 'Can you help me stop the sparks flying out of my breaker panel?'],
  ['report', 'en', 'I keep trying to stop sparks jumping from the wall socket.'],
  ['report', 'vi', 'Mình đang tìm cách ngăn tia lửa phát ra từ ổ cắm.'],
  ['report', 'vi', 'Công tắc phòng ngủ cứ bắn tia lửa, tôi chưa biết cách chống.'],
  ['quiet', 'vi', 'Mình muốn thay sang ổ cắm có khả năng chống tia lửa khi cắm bếp từ.'],
  ['quiet', 'vi', 'Báo giá cầu dao chống giật, chống tia lửa cho căn hộ 60m2.'],
  ['quiet', 'en', 'Do you stock a socket that stops sparks when plugging in a kettle?'],
  ['quiet', 'vi', 'Tôi đang cân nhắc mua ổ cắm hạn chế tia lửa nhưng chưa biết hãng nào tốt.'],
  ['quiet', 'vi', 'Nhà mình đang dùng ổ cắm chống tia lửa, nhờ thợ lắp thêm hai cái.'],
  ['quiet', 'en', 'Please quote a breaker designed to stop sparks coming from loose plugs.'],
  ['quiet', 'vi', 'Ổ cắm hiện tại đang chống tia lửa khá tốt, chỉ cần thay mặt nạ.'],
]

describe(`${PILLAR.id}: a second probe set, written after the first implementation and run once (14 of 15 as labelled; the miss and the phóng/phòng defect it led to are fixed at class level)`, () => {
  it.each(SECOND_SPARK_PROBE_SET)('%s: "%s"', (expected, language, text) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${expected}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBe(expected === 'report' ? 'electrical_water' : null)
  })
})

describe(`${PILLAR.id}: wording that reads two ways (pinned: decided on the safe side or missed before this round, an owner decision, not a fix)`, () => {
  it.each([
    ['without its tone "phong tia lua" cannot be told from "phóng tia lửa" and is read as a report', 'Nho lap o cam phong tia lua cho bep.', 'vi', 'electrical_water'],
    ['a product question that names where the spark comes from is read as a report', 'Which outlet cover stops sparks coming out of the socket?', 'en', 'electrical_water'],
    ['a plain "co" before the avoidance verb cannot be told from "có" and stays quiet', 'Toi dang co ngan tia lua o o cam.', 'vi', null],
    ['"to prevent" is a hypothetical frame in the shared gate', 'I am trying to prevent sparks coming out of the outlet.', 'en', null],
  ] as const)('%s', (label, text, language, expected) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBe(expected)
  })
})

describe(`${PILLAR.id}: reports the shared gate already missed before this round (pinned: an owner decision, not a fix)`, () => {
  it.each([
    ['a negated verb in front of the spark reads as a negated spark', 'Tôi không thể ngăn tia lửa bắn ra từ ổ cắm, nóng rát tay.'],
    ['a spark clause split from its equipment by a contrast word', 'Tủ điện có mùi khét nhưng vẫn thấy tia lửa xẹt.'],
  ])('%s -> no route', (label, text) => {
    const got = route(text)
    expect(got, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} routed to ${String(got)}`)).toBeNull()
  })
})

describe(`${PILLAR.id}: a long or hostile message is decided in bounded time`, () => {
  const HOSTILE: ReadonlyArray<readonly [string, string]> = [
    ['avoidance words before a Vietnamese spark', `${'chong '.repeat(6000)}tia lua o cam`],
    ['avoidance words before an English spark', `${'prevent '.repeat(6000)}sparks outlet`],
    ['negations before an avoidance phrase', `${'khong '.repeat(8000)}ngan tia lua o cam`],
    ['connector words between an avoidance word and a spark', `chong ${'phat '.repeat(6000)}tia lua o cam`],
    ['a spark phrase repeated thousands of times', 'o cam chong tia lua, '.repeat(3000)],
    ['hyphen chains', `${'spark-proof-'.repeat(5000)}outlet`],
    ['attempt words before a Vietnamese avoidance phrase', `${'dang co gang '.repeat(3000)}ngan tia lua o cam`],
    ['progressive words after an avoidance phrase', `ngan tia lua ${'dang '.repeat(6000)}ban ra tu o cam`],
    ['purpose words before an avoidance phrase', `${'de nham '.repeat(4000)}ngan tia lua ban ra tu o cam`],
    ['an avoidance phrase and its source repeated thousands of times', 'o cam ngan tia lua ban ra tu, '.repeat(3000)],
    ['English attempt words before a spark', `${'trying to '.repeat(4000)}stop sparks coming out of the outlet`],
  ]

  it.each(HOSTILE)('%s', (label, text) => {
    const started = performance.now()
    resolveReportedEmergencyGuidance(text, 'vi', { serviceType: 'electrical' })
    const elapsed = performance.now() - started
    expect(elapsed, pillarWhy(PILLAR, `${label}: ${text.length} characters took ${Math.round(elapsed)} ms`)).toBeLessThan(1500)
  })
})

const DEVELOPMENT_SPARK_PROBES: ReadonlyArray<readonly [string, 'vi' | 'en']> = [
  ['Mình muốn đổi sang loại ổ điện có màng chắn tia lửa cho an toàn.', 'vi'],
  ['Thợ có bán công tắc không phát ra tia lửa khi bật không?', 'vi'],
  ['Ổ cắm loại an toàn, ít sinh tia lửa, giá bao nhiêu vậy?', 'vi'],
  ['Cần lắp thêm cầu dao tự ngắt để phòng tia lửa điện ở bếp.', 'vi'],
  ['Nhờ thay ổ cắm cũ bằng loại có nắp, không bắn tia lửa khi cắm sạc.', 'vi'],
  ['Do you sell sockets that do not spark when plugged in?', 'en'],
  ['We offer spark-safe wiring upgrades for older apartments, can you quote one?', 'en'],
  ['Quote for fitting spark suppression on the distribution board.', 'en'],
  ['Looking for an outlet cover that stops sparks reaching the curtains.', 'en'],
  ['The new outlets are rated against sparking, please fit them on the balcony.', 'en'],
]

describe(`${PILLAR.id}: development probes written before the fix, which the avoidance classes were widened to cover`, () => {
  it.each(DEVELOPMENT_SPARK_PROBES)('%s -> no route', (text, language) => {
    const got = route(text, language)
    expect(got, pillarWhy(PILLAR, `${JSON.stringify(text)} routed to ${String(got)}`)).toBeNull()
  })
})
