import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P430-kael-emergency-context-guards',
  invariant:
    'shock cues require electrical or faucet context rather than furniture contact; ordinary pulling, soot, steady cooking flames, denied injury and gas-alarm installation/testing stay quiet, while active smoke, spreading flames, affirmed hazards and actively sounding fuel-gas leak alarms retain the appropriate emergency routes across written forms and service contexts',
  authority: [
    'governance/RULES.md #6 (Kael answers the six active services and does not stop a supported request on a false alarm)',
    'governance/RULES.md #8 (an emergency reply is explicit and never a silent drop)',
    'PR 406 review (Codex P2 on the "bị giật" and dense-smoke cues)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P410-kael-emergency-phrase-sets', 'P427-kael-emergency-standard-remediation', 'P420-kael-case-emergency-playbook-precedence'],
  mutation:
    'drop the shock context or residue guards and benign repair rows trigger emergencies; blank an actively sounding gas-leak alarm as a prevention product and the active-alarm rows miss gas routing while product/testing controls stay quiet',
} as const satisfies PillarManifest

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const WRITTEN_FORMS: ReadonlyArray<(value: string) => string> = [(value) => value, stripDiacritics, (value) => value.toUpperCase()]
const SERVICES = ['handyman', 'electrical', 'cleaning', 'upholstery', 'plumbing', 'hvac'] as const

const route = (text: string, service: (typeof SERVICES)[number]) => resolveReportedEmergencyGuidance(text, 'vi', { serviceType: service })?.route ?? 'none'

const PULLED_OBJECT = [
  'Ngăn kéo bị giật bung ray khi chạm vỏ tủ.',
  'Ngăn kéo bị giật bung ray khi chạm vào vỏ tủ.',
  'Ngăn kéo tủ lạnh bị giật bung ray, nhờ gắn lại.',
  'Cánh cửa tủ điện bị giật bung bản lề, nhờ lắp lại.',
  'Rèm cửa bị giật đứt móc treo, nhờ lắp lại.',
  'Mình bị giật túi ngoài chợ, nhờ lắp khóa cửa.',
  'Ngăn kéo bị giật mạnh nên hỏng ray, nhờ sửa.',
  'Cánh cửa tủ bị giật bung bản lề, nhờ gắn lại.',
  'Dây phơi bị giật đứt, nhờ thay dây mới.',
]

const BENIGN_REPORTS = [
  'Nha toi bi ngat ca dien va nuoc, nho kiem tra.',
  'Nha toi bi ngat het nuoc, nho kiem tra.',
  'Nha toi bi ngat dien, nho kiem tra.',
  'Nha toi bi ngat nuoc, nho kiem tra.',
  'Nha toi bi ngat nguon dien, nho kiem tra.',
  'Ben minh bi ngat nuoc, nho kiem tra.',
  'Dien nha toi bi ngat roi',
  'Nuoc nha toi bi ngat luon',
  'May lanh cua toi bi ngat roi',
  'Dien nha toi bi ngắt rồi',
  'Nuoc nha toi bi ngắt luôn',
  'Dien nha toi bi ngat, nho kiem tra.',
  'Nuoc nha toi bi ngat, nho kiem tra duong ong.',
  'May lanh bi ngat lien tuc, nho kiem tra.',
  'Binh nong lanh cua toi bi ngat, nho kiem tra.',
  'CB nha minh bi ngat, nho kiem tra.',
  'Can you install a gas leak detector in the kitchen?',
  'The gas leak alarm is not going off.',
  'The gas leak alarm has stopped sounding.',
  'We are testing the gas leak alarm and it is sounding.',
  'If the gas leak alarm is going off, who should I call?',
  'The gas leak alarm went off last night, but it has stopped.',
  'I want to buy a gas leak alarm for prevention.',
  'The gas leak alarm is in test mode and sounding.',
  'Bếp gas vẫn bốc lửa xanh đều, chỉ cần vệ sinh bếp.',
  'Bếp đang bốc lửa nhỏ đều để nấu ăn.',
  'No one was electrocuted. Please replace the outlet.',
  'Nobody is bleeding. Please clean the floor.',
  'Cần vệ sinh vết khói đen trên tường bếp.',
  'Cần giặt rèm bị ám khói đen.',
  'Nhờ tẩy vết khói đen bám ở trần nhà.',
  'Vệ sinh khói đen bám trên cửa kính giúp mình.',
  'Sofa dính khói đen từ lần cháy cũ, nhờ giặt giúp.',
]

const REAL_SHOCK = [
  'Vo toi bi ngat do dien giat',
  'Tho dien bi ngat khi dang sua',
  'Con toi bi ngat khi nha mat dien',
  'Vo toi bi ngat roi',
  'Con toi bi ngat khi dang choi',
  'Nguoi tho sua dien bi ngat khi dang sua o cam',
  'Dien nha toi bi ngat ma con toi cung bi ngat',
  'Aptomat chống giật vừa nhảy mà em vẫn bị giật khi chạm vòi',
  'Em chạm vỏ tủ lạnh thì bị giật',
  'Bình nóng lạnh rò nước, chạm vào vòi bị giật tê tay',
  'Chạm vào ổ cắm là bị giật',
  'Con tôi bị giật điện khi sờ vào dây sạc',
  'Thợ đang sửa cầu dao thì bị giật, ngã xuống không cử động',
]

const LIVE_SMOKE = [
  'Nobody noticed the house is on fire.',
  'No one noticed the house is on fire.',
  'Nobody can stop the smoke coming from the outlet.',
  'No one can stop the smoke coming from the outlet.',
  'Bếp gas vẫn bốc lửa lan sang tủ bếp.',
  'Bếp gas đang bốc lửa ra ngoài họng bếp.',
  'Đang vệ sinh thì khói đen dày đặc trong phòng.',
  'Khói đen dày đặc tràn vào phòng lúc tôi vệ sinh.',
  'Khói đen đang bốc ra từ ổ cắm',
  'Có khói đen dày đặc trong phòng',
  'Khói đen mù mịt, ai đó gọi giúp mình số cứu hỏa',
  'Nhà em đang cháy, khói đen dày đặc',
]

describe(`${PILLAR.id}: an ordinary event is not an emergency`, () => {
  it.each(PULLED_OBJECT.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write(text), service] as const))))(
    '%s stays quiet on the %s Case',
    (text, service) => {
      expect(route(text, service), pillarWhy(PILLAR, JSON.stringify(text))).toBe('none')
    },
  )

  it.each(BENIGN_REPORTS.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write(text), service] as const))))(
    '%s stays quiet on the %s Case',
    (text, service) => {
      expect(route(text, service), pillarWhy(PILLAR, JSON.stringify(text))).toBe('none')
    },
  )
})

const LIVE_GAS_ALARMS = [
  'The gas leak alarm sounds continuously.',
  'The gas leak detector beeps continuously.',
  'The gas leak alarm rings loudly.',
  'The gas leak alarm goes off again.',
  'The gas leak alarm blares continuously.',
  'The gas leak alarm has sounded continuously.',
  'The gas leak detector has rung for the last minute.',
  'The gas leak alarm started going off.',
  'The gas leak detector is loudly beeping.',
  'The gas leak alarm began rapidly ringing.',
  'The gas leak detector started to beep.',
  'The gas leak alarm has begun to sound.',
  'The gas leak alarm started very loudly beeping.',
  'The gas leak alarm is again beeping.',
  'My gas leak alarm is going off.',
  'The gas leak detector is sounding continuously.',
  'Our gas leak sensors are still beeping.',
  'The gas leak alarm that is ringing is in the hallway.',
  'The gas leak alarm was installed and now it is going off.',
]

describe(`${PILLAR.id}: sounding gas alarms remain hazards`, () => {
  it.each(LIVE_GAS_ALARMS.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.filter((service) => service !== 'hvac').map((service) => [write(text), service] as const))))(
    '%s retains gas routing on the %s Case',
    (text, service) => expect(route(text, service), pillarWhy(PILLAR, text)).toBe('gas'),
  )
  it.each(WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write('The kitchen gas leak alarm is going off.'), service] as const)))(
    '%s retains explicit kitchen-gas routing on the %s Case',
    (text, service) => expect(route(text, service), pillarWhy(PILLAR, text)).toBe('gas'),
  )
})

describe(`${PILLAR.id}: the real report still routes`, () => {
  it.each(REAL_SHOCK.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write(text), service] as const))))(
    '%s routes on the %s Case',
    (text, service) => {
      expect(route(text, service), pillarWhy(PILLAR, JSON.stringify(text))).not.toBe('none')
    },
  )

  it.each(LIVE_SMOKE.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write(text), service] as const))))(
    '%s routes on the %s Case',
    (text, service) => {
      expect(route(text, service), pillarWhy(PILLAR, JSON.stringify(text))).not.toBe('none')
    },
  )
})
