import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveReportedEmergencyGuidance } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'

export const PILLAR = {
  id: 'P430-kael-emergency-context-guards',
  invariant:
    'a word that names a hazard in one sentence and an ordinary event in another needs its context before it stops the intake: "bị giật" is a medical emergency only beside electricity or a touched fixture, never for a curtain, a bag or a drawer that was pulled, and thick black smoke is a fire only when it is happening, never when it is soot to be cleaned from a wall or a curtain; the real shock, the live smoke and the dense-smoke report still route, with and without diacritics',
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
  'Rèm cửa bị giật đứt móc treo, nhờ lắp lại.',
  'Mình bị giật túi ngoài chợ, nhờ lắp khóa cửa.',
  'Ngăn kéo bị giật mạnh nên hỏng ray, nhờ sửa.',
  'Cánh cửa tủ bị giật bung bản lề, nhờ gắn lại.',
  'Dây phơi bị giật đứt, nhờ thay dây mới.',
]

const SOOT_TO_CLEAN = [
  'Cần vệ sinh vết khói đen trên tường bếp.',
  'Cần giặt rèm bị ám khói đen.',
  'Nhờ tẩy vết khói đen bám ở trần nhà.',
  'Vệ sinh khói đen bám trên cửa kính giúp mình.',
  'Sofa dính khói đen từ lần cháy cũ, nhờ giặt giúp.',
]

const REAL_SHOCK = [
  'Bình nóng lạnh rò nước, chạm vào vòi bị giật tê tay',
  'Chạm vào ổ cắm là bị giật',
  'Con tôi bị giật điện khi sờ vào dây sạc',
  'Thợ đang sửa cầu dao thì bị giật, ngã xuống không cử động',
]

const LIVE_SMOKE = [
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
