import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P430-kael-emergency-context-guards',
  invariant:
    'shock cues require electrical or faucet context rather than furniture contact; ordinary pulling, soot, steady cooking flames and directly denied injury stay quiet, while active smoke, spreading flames and hazards nobody notices or can stop retain emergency routing across written forms and all six services',
  authority: [
    'governance/RULES.md #6 (Kael answers the six active services and does not stop a supported request on a false alarm)',
    'governance/RULES.md #8 (an emergency reply is explicit and never a silent drop)',
    'PR 406 review (Codex P2 on the "bị giật" and dense-smoke cues)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts',
  layer: 'unit',
  siblings: ['P410-kael-emergency-phrase-sets', 'P427-kael-emergency-standard-remediation', 'P420-kael-case-emergency-playbook-precedence'],
  mutation:
    'drop the electricity requirement from the bị giật cue: the curtain, bag and drawer rows route to medical; drop the residue lookbehind and the cleaning exemption from the dense-smoke cue: the wall and curtain soot rows route to fire while the live-smoke rows stay green',
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

const SOOT_TO_CLEAN = [
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

  it.each(SOOT_TO_CLEAN.flatMap((text) => WRITTEN_FORMS.flatMap((write) => SERVICES.map((service) => [write(text), service] as const))))(
    '%s stays quiet on the %s Case',
    (text, service) => {
      expect(route(text, service), pillarWhy(PILLAR, JSON.stringify(text))).toBe('none')
    },
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
