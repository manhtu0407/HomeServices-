import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  resolveEmergencyGuidance,
  resolveReportedEmergencyGuidance,
  type EmergencyRoute,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'
import { buildSignalText } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text'

export const PILLAR = {
  id: 'P405-kael-emergency-signal-matrix',
  invariant:
    'emergency routing reads Vietnamese tone marks, clause-level negation, tense and intent, so a genuine danger in any of the six services is routed while ordinary service wording that shares letters with a danger word (chạy, chảy, khối, bleeding a radiator) is not',
  authority: [
    'governance/RULES.md #6 (six supported services, each with its own ordinary and dangerous phrasing)',
    'governance/RULES.md #3 (user-facing safety text is deterministic, never raw model output)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (emergency matrix with zero critical misses and zero false routing in the tested set)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P401-kael-emergency-routing', 'P406-kael-case-emergency-intake'],
  mutation:
    'compare the plain text only and drop the tone check, or let a negation reach across "but": the chạy/chảy rows and the contrast rows turn red',
} as const satisfies PillarManifest

type Row = readonly [text: string, route: EmergencyRoute]

const GENUINE: Record<string, readonly Row[]> = {
  electrical: [
    ['Ổ cắm đang bốc khói', 'fire'],
    ['o cam dang boc khoi', 'fire'],
    ['Tủ điện đang cháy', 'fire'],
    ['tu dien dang chay', 'fire'],
    ['Ổ điện tóe lửa, có mùi khét', 'electrical_water'],
    ['Nước ngập gần ổ cắm trong phòng ngủ', 'electrical_water'],
    ['Người bên cạnh bị điện giật', 'medical'],
    ['The outlet is smoking', 'fire'],
    ['There is exposed live wire near water', 'electrical_water'],
  ],
  plumbing: [
    ['Nhà đang cháy, ống nước cũng vỡ', 'fire'],
    ['Bình nóng lạnh rò nước, người nhà bị điện giật', 'medical'],
    ['Nước đang ngập gần ổ điện ở bếp', 'electrical_water'],
    ['nuoc dang ngap gan o dien', 'electrical_water'],
    ['He is bleeding heavily after the pipe burst', 'medical'],
  ],
  cleaning: [
    ['Có người đột nhập vào nhà trong lúc dọn', 'police'],
    ['Nhân viên vệ sinh bị ngã, chảy máu nhiều', 'medical'],
    ['She is bleeding badly', 'medical'],
    ['Có khói trong phòng khi lau bếp', 'fire'],
    ['Someone is breaking in', 'police'],
  ],
  hvac: [
    ['Máy lạnh bốc khói', 'fire'],
    ['Máy lạnh đang cháy', 'fire'],
    ['may lanh boc khoi', 'fire'],
    ['Có người khó thở vì mùi gas lạnh', 'medical'],
    ['The AC unit is on fire', 'fire'],
    ['I smell smoke from the AC', 'fire'],
  ],
  upholstery: [
    ['Ghế sofa đang cháy', 'fire'],
    ['Sofa is on fire', 'fire'],
    ['Bé bị ngộ độc hóa chất giặt thảm', 'medical'],
    ['Có lửa trong phòng khách', 'fire'],
  ],
  handyman: [
    ['Khoan trúng dây điện, tóe lửa', 'electrical_water'],
    ['Thợ bị ngã bất tỉnh', 'medical'],
    ['Giá treo rơi, tôi bị thương', 'medical'],
    ['Có kẻ trộm đột nhập', 'police'],
    ['Chuông báo cháy đang kêu', 'fire'],
  ],
}

const ORDINARY: Record<string, readonly string[]> = {
  electrical: [
    'Ổ cắm bị cháy từ tuần trước, nhờ thợ thay',
    'Thay ổ điện bị cháy hôm qua',
    'Cầu dao nhảy liên tục',
    'Cần lắp chuông báo cháy cho căn hộ',
    'Thay pin chuông báo khói',
    'Đèn LED chớp nháy',
  ],
  plumbing: [
    'Nước đang chảy ra từ vòi',
    'nuoc dang chay ra tu voi',
    'Máy giặt chảy nước ra sàn',
    'Ống nước chảy nhỏ giọt dưới bồn rửa',
    'The radiator needs bleeding',
    'He is bleeding the radiator valve',
    'Brake line bleeding a lot of air',
  ],
  cleaning: [
    'Dọn nhà sau vụ hỏa hoạn tuần trước',
    'Dọn dẹp căn hộ sau khi cháy nhà hàng xóm',
    'Cần tổng vệ sinh, có khối lượng đồ rất nhiều',
    'Cleaning needed after the fire last week',
    'Khử mùi khói thuốc trong phòng',
  ],
  hvac: [
    'Máy lạnh đang chạy nhưng không mát',
    'may lanh dang chay nhung khong mat',
    'Máy lạnh chạy ồn',
    'Máy lạnh chảy nước',
    'Máy lạnh bị cháy bo mạch hôm qua',
    'The AC keeps running all night',
  ],
  upholstery: [
    'Sofa có vết cháy thuốc lá',
    'Sofa có cháy xém một góc',
    'Có cháy nắng ở rèm cửa',
    'Máy giặt điện tử bị kẹt cửa',
    'Rèm bị cháy xém một góc',
    'Ghế ám mùi khói bếp',
    'Giặt thảm có mùi khói nhang',
    'An chay nha, cần giặt nệm',
  ],
  handyman: [
    'Bếp gas có lửa yếu, nhờ thợ xem',
    'Bếp không có lửa',
    'Ống chảy nước sau khi khoan tường',
    'Cần khởi công sửa tủ bếp',
    'Có khởi động lại bình nóng lạnh được không',
  ],
}

// A second, broader ordinary-wording set: every phrase here is a real request or remark a customer of
// one of the six services could send, and none reports a danger.
const ORDINARY_MORE: Record<string, readonly string[]> = {
  electrical: [
    'Bóng đèn bị cháy, thay giúp mình',
    'Cầu chì bị cháy',
    'Cháy cầu dao tổng hôm qua',
    'Ổ cắm bị nóng khi cắm bếp từ',
    'Có mùi khét ở ổ cắm, nhờ thợ kiểm tra',
    'Dây điện bị chuột cắn lòi lõi',
    'Điện nhà chập chờn',
    'Mất điện cả căn hộ',
    'Aptomat nhảy khi bật máy giặt',
    'Ổ cắm bị cháy đen nhưng không có khói',
  ],
  plumbing: [
    'Vòi nước chảy yếu',
    'Ống thoát nước chảy chậm',
    'Bồn cầu chảy nước liên tục',
    'Nước nóng không chảy',
    'Máy giặt chạy xong không xả nước',
    'Bình nóng lạnh không có lửa',
  ],
  cleaning: [
    'Tổng vệ sinh sau hỏa hoạn',
    'Dọn nhà sau khi cháy bếp tuần trước',
    'Lau kính ban công',
    'Dọn dẹp nhà mới',
    'Vệ sinh bếp có khói dầu mỡ bám',
    'The kitchen smells of smoke from cooking',
    'I smoke indoors, remove the smell',
  ],
  hvac: [
    'Máy lạnh chạy không lạnh',
    'Máy lạnh chảy nước ra sàn',
    'Dàn nóng chạy ồn',
    'Máy lạnh có mùi hôi',
    'Máy lạnh đang chạy 24 giờ liên tục',
    'My AC is running but not cooling',
    'Need to bleed the AC line',
  ],
  upholstery: [
    'Giặt sofa vết cà phê',
    'Sofa bị cháy xém do tàn thuốc',
    'Giặt thảm có vết máu cũ',
    'Nệm có vết chảy mủ khô',
    'Rèm có mùi khói thuốc',
  ],
  handyman: [
    'Treo tivi lên tường',
    'Lắp kệ bếp',
    'Sửa cửa tủ bị kẹt',
    'Thay khóa cửa',
    'Khoan tường lắp rèm',
    'Bếp gas không lên lửa',
    'Máy hút khói bếp ồn',
    'The stove has a weak flame',
  ],
  general: [
    'Mình bị đau lưng sau khi khuân đồ, cần thợ giúp',
    'Con mình đang ngủ, cần thợ làm yên lặng',
    'Cần gấp trong hôm nay',
    'Cần thợ khẩn cấp vì mai có khách',
    'Chị ấy bị thương nhẹ ở tay từ hôm qua',
    'Anh thợ cũ bị ngã tuần trước',
    'Replace the smoke detector battery',
    'Install a fire alarm',
  ],
}

describe('P405 emergency matrix: a broader set of ordinary requests across the six services', () => {
  for (const [service, texts] of Object.entries(ORDINARY_MORE)) {
    it.each(texts)(`${service}: %s`, (text) => {
      expect(resolveReportedEmergencyGuidance(text, 'vi'), pillarWhy(PILLAR, `${service}: "${text}" is not a reported danger`)).toBeNull()
    })
  }
})

describe('P405 emergency matrix: genuine danger in each of the six services', () => {
  for (const [service, rows] of Object.entries(GENUINE)) {
    it.each(rows)(`${service}: %s -> %s`, (text, route) => {
      for (const resolve of [resolveEmergencyGuidance, resolveReportedEmergencyGuidance]) {
        expect(resolve(text, 'vi')?.route, pillarWhy(PILLAR, `${service}: "${text}" must route to ${route}`)).toBe(route)
      }
    })
  }
})

// Paraphrases of a real danger as a stressed customer types it: accented, unaccented, terse, English.
const GENUINE_PARAPHRASES: readonly Row[] = [
  ['Cháy! Cháy rồi!', 'fire'],
  ['nhà tôi đang cháy', 'fire'],
  ['nha toi dang chay', 'fire'],
  ['Cháy nhà rồi cứu với', 'fire'],
  ['Căn hộ bên cạnh đang cháy, khói tràn sang', 'fire'],
  ['Ổ cắm bốc khói đen', 'fire'],
  ['tu dien boc khoi va co mui khet', 'fire'],
  ['Có khói từ máy lạnh', 'fire'],
  ['Thấy lửa từ ổ điện', 'fire'],
  ['Ổ điện có lửa', 'fire'],
  ['Quạt đang cháy', 'fire'],
  ['Bình nóng lạnh đang cháy', 'fire'],
  ['Tivi đang bốc khói', 'fire'],
  ['Dây điện đang cháy', 'fire'],
  ['Smoke is coming from the outlet', 'fire'],
  ['My kitchen is on fire', 'fire'],
  ['Flames are coming from the panel', 'fire'],
  ['I can see smoke in the hallway', 'fire'],
  ['The breaker is smoking', 'fire'],
  ['Fire alarm is going off', 'fire'],
  ['Có người bị điện giật', 'medical'],
  ['bi dien giat roi', 'medical'],
  ['Con tôi bị điện giật ngất xỉu', 'medical'],
  ['Ông ấy bất tỉnh', 'medical'],
  ['Bà ngoại khó thở', 'medical'],
  ['Có người đau ngực', 'medical'],
  ['Thợ bị chảy máu nhiều', 'medical'],
  ['Cần cấp cứu gấp', 'medical'],
  ['Bé bị ngộ độc', 'medical'],
  ['Anh ấy bị thương nặng', 'medical'],
  ['He got an electric shock', 'medical'],
  ['She is unconscious', 'medical'],
  ['My dad is not breathing', 'medical'],
  ['Someone is bleeding badly', 'medical'],
  ['He was electrocuted', 'medical'],
  ['Có người đột nhập', 'police'],
  ['Có kẻ trộm trong nhà', 'police'],
  ['Cháy ở tầng 5', 'fire'],
  ['Có cháy trong tòa nhà', 'fire'],
  ['Xảy ra cháy ở bếp nhà hàng xóm', 'fire'],
  ['Bị giật điện', 'medical'],
  ['Ông ấy thở không nổi', 'medical'],
  ['Bé bị ngạt thở', 'medical'],
  ['Tôi đang bị đe dọa', 'police'],
  ['Tôi bị cướp', 'police'],
  ['An intruder is in my house', 'police'],
  ['Someone is breaking in', 'police'],
  ['I am being threatened', 'police'],
  ['Ổ cắm tóe lửa', 'electrical_water'],
  ['Nước ngập gần ổ điện', 'electrical_water'],
  ['Dây điện phát tia lửa', 'electrical_water'],
  ['Exposed live wire in the bathroom', 'electrical_water'],
  ['Ổ cắm bốc khói và tóe lửa', 'electrical_water'],
  ['Có khói và có người bị điện giật', 'uncertain'],
  ['Có người đột nhập và nhà đang cháy', 'uncertain'],
  ['Tôi không biết gọi số nào', 'uncertain'],
  ['Đang gặp nguy hiểm', 'uncertain'],
]

describe('P405 emergency matrix: zero critical misses across paraphrases of a real danger', () => {
  it.each(GENUINE_PARAPHRASES)('%s -> %s', (text, route) => {
    expect(resolveReportedEmergencyGuidance(text, 'vi')?.route ?? null, pillarWhy(PILLAR, `a real danger was missed: "${text}"`)).toBe(route)
  })
})

describe('P405 emergency matrix: ordinary service wording is not an emergency', () => {
  for (const [service, texts] of Object.entries(ORDINARY)) {
    it.each(texts)(`${service}: %s`, (text) => {
      expect(resolveEmergencyGuidance(text, 'vi'), pillarWhy(PILLAR, `${service}: "${text}" is an ordinary request`)).toBeNull()
      expect(resolveReportedEmergencyGuidance(text, 'vi')).toBeNull()
    })
  }
})

describe('P405 tone marks decide between words the plain text cannot tell apart', () => {
  it.each([
    ['máy đang chạy', null],
    ['máy đang chảy nước', null],
    ['máy đang cháy', 'fire'],
    ['may dang chay', null],
    ['ổ cắm dang chay', 'fire'],
    ['Có khối lượng lớn', null],
    ['Có khởi động chậm', null],
    ['Có khói', 'fire'],
    ['co khoi', 'fire'],
    ['Có lừa đảo qua điện thoại', null],
    ['Có lửa', 'fire'],
  ] as const)('%s -> %s', (text, route) => {
    expect(resolveReportedEmergencyGuidance(text, 'vi')?.route ?? null, pillarWhy(PILLAR, `tone marks: "${text}"`)).toBe(route)
  })

  it('reads a decomposed (NFD) keyboard input the same as the composed spelling', () => {
    const decomposed = 'Ổ cắm đang cháy'.normalize('NFD')
    expect(decomposed).not.toBe('Ổ cắm đang cháy')
    expect(resolveReportedEmergencyGuidance(decomposed, 'vi')?.route).toBe('fire')
    expect(resolveReportedEmergencyGuidance('máy đang chạy'.normalize('NFD'), 'vi')).toBeNull()
  })

  it('keeps the accented and plain twins index-aligned for every input', () => {
    for (const text of ['Ổ cắm đang cháy!', 'smoke 🔥 everywhere', 'á́ b', "don't  panic\n\nplease", '“fire” — now']) {
      const signal = buildSignalText(text)
      expect(signal.accented.length, pillarWhy(PILLAR, `alignment for ${JSON.stringify(text)}`)).toBe(signal.plain.length)
    }
  })
})

describe('P405 negation, contrast and who is affected', () => {
  it.each([
    ['Không có khói nhưng có lửa.', 'fire'],
    ['Không có khói, nhưng ổ cắm đang cháy', 'fire'],
    ['There is no smoke, but flames are visible.', 'fire'],
    ['No smoke here, however the outlet is on fire', 'fire'],
    ['Không phải tôi bị điện giật, người bên cạnh mới bị.', 'medical'],
    ['Tôi không bị điện giật mà là con tôi.', 'medical'],
    ['Tôi không bị điện giật, nhưng chồng tôi thì có', 'medical'],
    ['I am not bleeding, but he is bleeding badly', 'medical'],
    ['Tôi không bị điện giật, nhưng có ổ cắm bị cháy', null],
    ['Tôi không bị điện giật nhưng người thợ nói ổ cắm bị cháy', null],
    ['Không có khói . Có lửa', 'fire'],
    ['Không có khói', null],
    ['Không thấy lửa', null],
    ['Tôi không bị điện giật.', null],
    ['No one is hurt and there is no smoke', null],
    ['Không có người đột nhập', null],
  ] as const)('%s -> %s', (text, route) => {
    expect(resolveReportedEmergencyGuidance(text, 'vi')?.route ?? null, pillarWhy(PILLAR, `negation: "${text}"`)).toBe(route)
  })
})

describe('P405 an active danger is not a past event, a hypothetical, a quotation or a technical term', () => {
  it.each([
    ['Hôm qua có khói từ ổ cắm, giờ hết rồi.', null],
    ['Tôi cần thay ổ cắm bốc khói hôm qua', null],
    ['Last night the outlet was smoking, it has stopped', null],
    ['Sáng nay ổ cắm bốc khói nhưng đã hết', null],
    ['Ổ cắm bốc khói, khói đã tan', null],
    ['Ổ cắm đang bốc khói, tôi đã tắt aptomat tổng', 'fire'],
    ['Ổ cắm đang bốc khói nhưng tôi đã gọi 114', 'fire'],
    ['Sau khi cắm bếp từ thì ổ cắm bốc khói', 'fire'],
    ['Fire started 5 minutes ago and is getting worse', 'fire'],
    ['Phòng cháy rồi!', 'fire'],
    ['Nếu không dập được thì làm sao, nhà đang cháy', 'fire'],
    ['Phòng cháy chữa cháy tòa nhà', null],
    ['Từ hôm qua tới giờ ổ cắm vẫn đang bốc khói', 'fire'],
    ['Hôm qua van nước bị rò, ổ cắm bốc khói lúc sáng', null],
    ['Nếu cháy nhà thì gọi số nào?', null],
    ['What if the outlet is on fire?', null],
    ['Nhà đang cháy, tôi nên gọi số nào?', 'fire'],
    ['Màn hình hiển thị chữ "cháy" nhưng máy vẫn chạy bình thường', null],
    ['The panel shows the word "fire" but nothing is wrong', null],
    ['The radiator needs bleeding', null],
    ['The person is bleeding badly', 'medical'],
  ] as const)('%s -> %s', (text, route) => {
    expect(resolveReportedEmergencyGuidance(text, 'vi')?.route ?? null, pillarWhy(PILLAR, `tense and intent: "${text}"`)).toBe(route)
  })
})

describe('P405 mixed categories, mixed language and generic urgency', () => {
  it('routes two different danger categories to the national number', () => {
    expect(resolveReportedEmergencyGuidance('Có người bị điện giật và có khói trong nhà', 'vi')?.route).toBe('uncertain')
    expect(resolveReportedEmergencyGuidance('Someone is breaking in and the kitchen is on fire', 'en')?.route).toBe('uncertain')
  })

  it('keeps smoke with sparking as one electrical hazard whose guidance names 114, 115 and 112', () => {
    const guidance = resolveReportedEmergencyGuidance('Máy lạnh nhà mình bốc khói và có mùi khét, tia lửa điện ở ổ cắm', 'vi')
    expect(guidance?.route, pillarWhy(PILLAR, 'fire with electrical sparking')).toBe('electrical_water')
    for (const number of ['114', '115', '112']) expect(guidance?.response).toContain(number)
  })

  it('reads a Vietnamese fitting with an English verb', () => {
    expect(resolveReportedEmergencyGuidance('ổ cắm is on fire', 'vi')?.route).toBe('fire')
    expect(resolveReportedEmergencyGuidance('tủ điện is smoking', 'vi')?.route).toBe('fire')
  })

  it('answers "who do I call" with the national number in both entry points', () => {
    expect(resolveReportedEmergencyGuidance('Tôi không biết gọi số nào, đang gặp nguy hiểm', 'vi')?.route).toBe('uncertain')
    expect(resolveEmergencyGuidance('Not sure who to call', 'en')?.route).toBe('uncertain')
  })

  it('treats "urgent" alone as a priority for the assistant but not as a reported danger for a Case', () => {
    const urgent = 'Ống nước vỡ, cần hỗ trợ khẩn cấp'
    expect(resolveEmergencyGuidance(urgent, 'vi')?.route).toBe('uncertain')
    expect(resolveReportedEmergencyGuidance(urgent, 'vi')).toBeNull()
  })

  it('names the verified Vietnam number for each route', () => {
    const numbers: Array<[string, string]> = [
      ['Ổ cắm đang bốc khói', '114'],
      ['Có người bị điện giật', '115'],
      ['Có người đột nhập', '113'],
      ['Có người bị điện giật và có khói', '112'],
    ]
    for (const [text, number] of numbers) {
      expect(resolveReportedEmergencyGuidance(text, 'vi')?.response, pillarWhy(PILLAR, `${text} -> ${number}`)).toContain(number)
      expect(resolveReportedEmergencyGuidance(text, 'en')?.response).toContain(number)
    }
  })
})

// Fuel gas (LPG, cooking gas) leaking is an emergency; "gas" is also the everyday Vietnamese word for HVAC refrigerant,
// whose leak is a service request. The word alone never decides: the object, the smell and the surrounding service do.
const GAS_EMERGENCY: ReadonlyArray<readonly [text: string, note: string]> = [
  ['Nhà có mùi gas nồng nặc', 'smell, tone marks'],
  ['nha co mui gas rat nong', 'smell, no accents'],
  ['Ngửi thấy mùi gas trong bếp', 'smell in the kitchen'],
  ['Mùi ga nồng nặc ở bếp', 'ga spelling'],
  ['Bình gas bị rò rỉ', 'cylinder leak'],
  ['binh gas bi ro ri', 'cylinder leak, no accents'],
  ['Bình ga bị rò', 'ga spelling'],
  ['Bình gas đang xì', 'cylinder hiss'],
  ['Bếp gas bị rò, mùi gas khắp nhà', 'stove leak'],
  ['Bếp ga bị hở', 'stove, ga spelling'],
  ['Ống dẫn gas bị hở', 'pipe'],
  ['Dây gas bị xì', 'hose'],
  ['Van gas bị rỉ', 'valve'],
  ['Khí đốt bị rò rỉ trong bếp', 'fuel gas wording'],
  ['Rò gas ở bếp', 'bare leak with kitchen context'],
  ['hở gas ở bếp', 'bare leak, no accents, kitchen'],
  ['Xì gas ở bình đang dùng nấu ăn', 'bare leak with cylinder context'],
  ['Rò rỉ LPG trong căn hộ', 'LPG'],
  ['Đang sửa điện thì ngửi thấy mùi gas', 'electrical visit'],
  ['Khoan trúng ống gas, ống gas đang xì', 'handyman drilling'],
  ['Lau bếp thì thấy bình gas bị rò', 'cleaning visit'],
  ['Máy lạnh chạy bình thường nhưng bếp có mùi gas', 'HVAC visit, smell in another clause'],
  ['Giặt sofa xong thấy mùi gas ở bếp', 'upholstery visit'],
  ['Không có mùi gas nhưng bếp đang rò gas ở van', 'a contrast ends the negation'],
  ['I can smell gas in the kitchen', 'EN smell'],
  ['There is a gas leak in my apartment', 'EN leak'],
  ['The LPG cylinder is leaking', 'EN cylinder'],
  ['The house smells of gas', 'EN smell'],
  ['Propane leak in the kitchen', 'EN propane'],
  ['I hear hissing from the gas cylinder', 'EN hiss'],
  ['Bếp gas bị rò, gas leak in the kitchen', 'mixed language'],
  ['Ống dẫn gas từ bình ra bếp bị hở, nghe tiếng xì', 'long object phrase'],
  ['Khí gas đang rò rỉ trong căn hộ, mùi rất nồng', 'khí gas is fuel gas'],
  ['I smell propane near the stove', 'EN propane smell'],
  ['Hissing sound from the gas regulator', 'EN hiss with a noun'],
  ['Gas leak', 'EN, no refrigerant context'],
  ['There is a leak of gas', 'EN, no refrigerant context'],
]

const GAS_ORDINARY: ReadonlyArray<readonly [text: string, why: string]> = [
  ['Máy lạnh bị xì gas, cần nạp gas', 'refrigerant top-up'],
  ['Máy lạnh rò gas ở dàn lạnh', 'refrigerant leak on the indoor unit'],
  ['Điều hòa thiếu gas, cần bơm gas R32', 'R32'],
  ['Dàn nóng bị rò gas', 'outdoor unit'],
  ['dieu hoa ro gas', 'no accents'],
  ['Máy lạnh hết gas', 'out of refrigerant'],
  ['Nạp gas máy lạnh giúp mình', 'refill'],
  ['Máy lạnh inverter xì gas R410A', 'R410A'],
  ['Ống đồng máy lạnh bị rò gas', 'copper line'],
  ['Có người khó thở vì mùi gas lạnh', 'gas lạnh is refrigerant (the person is the emergency, covered above)'],
  ['Phòng có mùi gas lạnh', 'gas lạnh is refrigerant, not fuel gas'],
  ['The AC is leaking refrigerant gas', 'EN refrigerant'],
  ['air conditioner gas leak', 'EN AC'],
  ['Refrigerant gas top-up for the split AC', 'EN top-up'],
  ['Thay bình gas mới giúp mình', 'cylinder replacement'],
  ['Hết gas rồi, đổi bình gas giúp', 'cylinder swap'],
  ['Bếp gas có lửa yếu, nhờ thợ xem', 'weak flame'],
  ['Bếp gas không lên lửa', 'no flame'],
  ['Lắp đặt bếp gas mới', 'install'],
  ['Thay dây gas và van gas cho bếp', 'part replacement'],
  ['Lắp thiết bị báo rò gas', 'install a detector'],
  ['Nhờ kiểm tra rò gas định kỳ cho bếp', 'periodic inspection'],
  ['We need a gas stove installed', 'EN install'],
  ['The gas bill is high this month', 'EN bill'],
  ['Mùi gà quay ám vào sofa', 'gà (chicken) is not ga'],
  ['Bếp có mùi gà nướng', 'gà (chicken) is not ga'],
  ['Giặt ga trải giường', 'ga is a bedsheet'],
  ['Ga giường bị rò rỉ nước giặt', 'ga is a bedsheet'],
  ['Gasket under the sink is leaking', 'gasket is not gas'],
]

const GAS_NEGATED_OR_NOT_NOW: ReadonlyArray<readonly [text: string, why: string]> = [
  ['Không có mùi gas, chỉ là mùi thức ăn', 'negated smell'],
  ['Bếp gas không bị rò', 'negated leak'],
  ['Không phải rò gas, chỉ là máy lạnh', 'negated leak'],
  ['Chưa thấy mùi gas', 'not yet'],
  ['Hôm qua có mùi gas nhưng đã hết', 'past'],
  ['Bình gas từng bị rò hồi tuần trước, thợ đã thay van', 'past, repaired'],
  ['Nếu ngửi thấy mùi gas thì nên làm gì?', 'hypothetical'],
  ['Phòng khi rò gas thì cần chuẩn bị gì?', 'precaution'],
  ['Mùi gas đã hết', 'resolved'],
  ['There is no smell of gas', 'EN negated'],
  ['We had a gas leak last year', 'EN past'],
  ['What should I do if I smell gas?', 'EN hypothetical'],
]

describe('P405 fuel gas is an emergency, refrigerant gas is a service request', () => {
  it.each(GAS_EMERGENCY)('routes "%s" (%s) to the fire service at 114', (text) => {
    for (const resolve of [resolveEmergencyGuidance, resolveReportedEmergencyGuidance]) {
      const guidance = resolve(text, 'vi')
      expect(guidance?.route, pillarWhy(PILLAR, `"${text}" reports a fuel-gas leak`)).toBe('gas')
      expect(guidance?.response).toContain('114')
    }
  })

  it.each(GAS_ORDINARY)('leaves "%s" (%s) to the ordinary service intake', (text) => {
    const why = pillarWhy(PILLAR, `"${text}" is a refrigerant, parts or install request, not a fuel-gas leak`)
    if (text === 'Có người khó thở vì mùi gas lạnh') {
      expect(resolveReportedEmergencyGuidance(text, 'vi')?.route, why).toBe('medical')
      return
    }
    expect(resolveEmergencyGuidance(text, 'vi'), why).toBeNull()
    expect(resolveReportedEmergencyGuidance(text, 'vi')).toBeNull()
  })

  it.each(GAS_NEGATED_OR_NOT_NOW)('does not route "%s" (%s)', (text) => {
    const why = pillarWhy(PILLAR, `"${text}" negates, dates, conditions or resolves the leak`)
    expect(resolveEmergencyGuidance(text, 'vi'), why).toBeNull()
    expect(resolveReportedEmergencyGuidance(text, 'vi')).toBeNull()
    expect(resolveReportedEmergencyGuidance(text, 'en'), why).toBeNull()
  })

  it('answers in English with the same verified number and no new instruction beyond leaving, no flame, no switch', () => {
    const guidance = resolveReportedEmergencyGuidance('I can smell gas in the kitchen', 'en')
    expect(guidance?.route).toBe('gas')
    expect(guidance?.response).toContain('114')
    expect(guidance?.response).not.toMatch(/\b(?:valve|cylinder|window|open|close|turn off|shut)\b/i)
    const vi = resolveReportedEmergencyGuidance('Nhà có mùi gas', 'vi')
    expect(vi?.response).not.toMatch(/\bvan\b|mở cửa|khóa/i)
    expect(vi?.response).toMatch(/lửa/)
    expect(vi?.response).toMatch(/công tắc/)
  })
})

describe('P405 an unclear gas report asks for the national line instead of guessing', () => {
  it.each([
    ['Nhà bị rò gas', 'vi'],
    ['Xì gas', 'vi'],
    ['hơi bị hở gas', 'vi'],
    ['Máy lạnh có mùi gas', 'vi'],
  ] as const)('sends "%s" to 112 because the gas could be fuel or refrigerant', (text, language) => {
    const guidance = resolveReportedEmergencyGuidance(text, language)
    expect(guidance?.route, pillarWhy(PILLAR, `"${text}" is ambiguous between fuel gas and refrigerant`)).toBe('uncertain')
    expect(guidance?.response).toContain('112')
  })

  it('reads a bare leak as refrigerant inside the HVAC service, where "xì gas" is the usual phrase', () => {
    for (const text of ['Bị xì gas', 'Rò gas', 'hở gas', 'Gas leak']) {
      expect(resolveReportedEmergencyGuidance(text, 'vi', { serviceType: 'hvac' }), pillarWhy(PILLAR, `"${text}" in the HVAC service`)).toBeNull()
    }
  })

  it('still routes a fuel-gas object or smell inside the HVAC service', () => {
    expect(resolveReportedEmergencyGuidance('Bình gas bị rò', 'vi', { serviceType: 'hvac' })?.route).toBe('gas')
    expect(resolveReportedEmergencyGuidance('Xì gas ở bếp', 'vi', { serviceType: 'hvac' })?.route).toBe('gas')
    expect(resolveReportedEmergencyGuidance('Nhà có mùi gas', 'vi', { serviceType: 'hvac' })?.route).toBe('gas')
  })

  it('keeps asking for 112 for a bare leak in every other service', () => {
    for (const serviceType of ['electrical', 'plumbing', 'cleaning', 'upholstery', 'handyman']) {
      expect(resolveReportedEmergencyGuidance('Bị xì gas', 'vi', { serviceType })?.route, pillarWhy(PILLAR, serviceType)).toBe('uncertain')
    }
  })

  it('combines a gas leak with fire or sparking into the gas guidance, and with an injury into 112', () => {
    expect(resolveReportedEmergencyGuidance('Có mùi gas và bếp đang cháy', 'vi')?.route).toBe('gas')
    expect(resolveReportedEmergencyGuidance('Ổ cắm tóe lửa và có mùi gas', 'vi')?.route).toBe('gas')
    expect(resolveReportedEmergencyGuidance('Có mùi gas, người nhà ngất xỉu', 'vi')?.route).toBe('uncertain')
    expect(resolveReportedEmergencyGuidance('Có mùi gas, người nhà ngất xỉu', 'vi')?.response).toContain('112')
  })

  it('does not let a refrigerant word elsewhere in the sentence hide a fuel-gas object', () => {
    expect(resolveReportedEmergencyGuidance('Máy lạnh vẫn mát nhưng bếp gas bị rò', 'vi')?.route).toBe('gas')
    expect(resolveReportedEmergencyGuidance('Cạnh máy lạnh có bình gas bị rò', 'vi')?.route).toBe('gas')
  })

  it('does not treat the tone-marked chicken or bedsheet words as gas', () => {
    expect(buildSignalText('mùi gà').accented).toContain('gà')
    expect(resolveReportedEmergencyGuidance('Phòng có mùi gà rất nặng', 'vi')).toBeNull()
    expect(resolveReportedEmergencyGuidance('mui ga', 'vi')?.route).toBe('gas')
  })
})

// Rules the audit remediation added. Every phrasing here is written for the rule and appears in none of the
// holdout sets, so those sets stay a measurement and not a source of cues.
describe('P405 the classifier rules added by the audit remediation', () => {
  const route = (text: string, serviceType: string | null = null) =>
    resolveReportedEmergencyGuidance(text, 'vi', { serviceType })?.route ?? null

  it('does not read a word that only spells like a negation as one: nổ is not "no", hét is not "hết", chữa is not "chưa"', () => {
    expect(route('Cái nồi áp suất nổ rồi bốc cháy ngay trong bếp'), pillarWhy(PILLAR, 'nổ (explodes) is not the English "no"')).toBe('fire')
    expect(route('Chủ nhà hét lên là nhà cháy rồi'), pillarWhy(PILLAR, 'hét (shouts) is not "hết" (no more)')).toBe('fire')
    expect(route('Hết khói rồi, không còn lửa'), pillarWhy(PILLAR, 'hết is a real negation')).toBeNull()
    expect(route('Chưa có khói, chỉ nóng ổ cắm'), pillarWhy(PILLAR, 'chưa is a real negation')).toBeNull()
    expect(route('Chẳng có lửa gì cả'), pillarWhy(PILLAR, 'chẳng is a real negation')).toBeNull()
    expect(route('There is no smoke and no fire')).toBeNull()
    expect(route('Nó nổ bốp một tiếng rồi tắt, không có khói'), pillarWhy(PILLAR, 'a real "không" still negates after a nổ')).toBeNull()
  })

  it('keeps cooking, a candle or a cigarette out of the smoke and flame cues', () => {
    expect(route('Khói bốc ra từ chảo chiên khi nấu ăn')).toBeNull()
    expect(route('Khói thuốc dày đặc trong phòng karaoke')).toBeNull()
    expect(route('Lửa to quá khi em nấu ăn')).toBeNull()
    expect(route('Khói bốc ra từ tủ điện hành lang')).toBe('fire')
    expect(route('Lửa to lan sang rèm cửa')).toBe('fire')
    expect(route('Khói dày đặc từ cửa thang máy')).toBe('fire')
  })

  it('reads "collapsed" as a person only when nothing was collapsed by them', () => {
    expect(route('The ladder collapsed the shelf this morning')).toBeNull()
    expect(route('My cleaner collapsed and is not breathing')).toBe('medical')
  })

  it('tells the refrigerant line of an air conditioner from the line to a stove', () => {
    expect(route('Ống gas bị hở ở dàn nóng', 'hvac'), pillarWhy(PILLAR, 'the air conditioner\'s own gas pipe is refrigerant')).toBeNull()
    expect(route('Ống dẫn gas bị rò', 'hvac'), pillarWhy(PILLAR, 'a bare gas line in the air-conditioning service is refrigerant')).toBeNull()
    expect(route('Ống dẫn gas bếp bị rò', 'hvac'), pillarWhy(PILLAR, 'a kitchen word makes it fuel gas in any service')).toBe('gas')
    expect(route('Ống gas bếp bị hở')).toBe('gas')
    expect(route('Bình gas cạnh dàn lạnh đang xì'), pillarWhy(PILLAR, 'an air conditioner beside a cylinder does not make the cylinder refrigerant')).toBe('gas')
  })

  it('reads a refrigerant word inside the object phrase as the air conditioner\'s own line in every service', () => {
    for (const serviceType of [null, 'plumbing', 'electrical']) {
      expect(route('Ống gas máy lạnh bị rò', serviceType), pillarWhy(PILLAR, `"ống gas máy lạnh" is refrigerant tubing, service ${serviceType}`)).toBeNull()
    }
    expect(route('Ống gas bếp bị rò', 'plumbing'), pillarWhy(PILLAR, 'the same pipe with a kitchen word is fuel gas')).toBe('gas')
  })

  it('asks about a gas smell beside refrigerant words (112) outside the air-conditioning service, and treats it as the refrigerant inside it', () => {
    expect(route('Có mùi gas máy lạnh sau khi nạp', 'hvac')).toBeNull()
    expect(route('Có mùi gas máy lạnh sau khi nạp')).toBe('uncertain')
  })

  it('is not vetoed by a tone rule meant for another cue when free words sit inside a cue: máy giặt is not "giật"', () => {
    expect(route('Nước tràn từ máy giặt sang sàn rồi chạm tới ổ điện')).toBe('electrical_water')
  })

  it('does not report a fire scene in a film', () => {
    expect(route('Xem cảnh cháy nhà trong phim làm em sợ')).toBeNull()
  })
})
