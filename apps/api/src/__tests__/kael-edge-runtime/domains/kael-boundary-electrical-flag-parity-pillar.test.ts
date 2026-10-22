import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { evaluateMessageBoundary } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard'
import { getEnabledKaelPlaybook } from '../../../../../../supabase/functions/mobile-api/_shared/kael/learning/playbooks/registry'
import { OWNER, installEdgeRuntimeTestHooks } from '../harness'
import { activeWorld, type Service } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P422-kael-boundary-electrical-flag-parity',
  invariant:
    'turning the electrical playbook on never lets through a request the boundary refuses with it off: an unsupported appliance or connection request on an electrical Case is refused the same way with the flag off and on in every written form, a supported electrical request and a supported request that only mentions an appliance stay open the same way, the flagged routing policy only adds refusals and never removes one, a message that mixes a supported and an unsupported request is decided identically with the flag off and on, and a hazard reported beside an unsupported request is still answered with the shared gate numbers whichever way the flag is set',
  authority: [
    'governance/RULES.md #6 (Kael declines unsupported services politely and answers the six active services)',
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never advances money-impacting state)',
    'KAWA_01 six-service diagnostic DX-01 (the flagged electrical path returned ok before the keyword gate ran)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts',
  layer: 'integration',
  siblings: ['P421-kael-boundary-requested-work', 'P420-kael-case-emergency-playbook-precedence', 'P406-kael-case-emergency-intake'],
  mutation:
    'return ok from evaluateMessageBoundary as soon as the electrical playbook is enabled and the routing policy found nothing: every unsupported and mixed electrical row turns red with the flag on while the same rows stay green with it off, and the handler rows that expect the Case to close turn red with it on',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

afterEach(() => vi.unstubAllGlobals())

const SERVICES: readonly Service[] = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']
const FLAGS_ON = Object.fromEntries(SERVICES.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))
const FLAG_STATES = ['off', 'on'] as const
type Flags = (typeof FLAG_STATES)[number]

function decide(text: string, flags: Flags, language: 'vi' | 'en' = 'vi', service: Service = 'electrical') {
  const env: Record<string, string> = flags === 'on' ? FLAGS_ON : {}
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } })
  return evaluateMessageBoundary(text, service, {
    actorId: OWNER.id,
    semanticInjectionClassifierEnabled: true,
    language,
    electricalPlaybookEnabled: Boolean(getEnabledKaelPlaybook(service, OWNER.id)),
  })
}

const verdict = (text: string, flags: Flags, language: 'vi' | 'en' = 'vi', service: Service = 'electrical') => {
  const got = decide(text, flags, language, service)
  return got.ok ? 'ok' : got.reason
}

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const WRITTEN_FORMS: ReadonlyArray<(value: string) => string> = [(value) => value, stripDiacritics, (value) => value.toUpperCase()]
const cap = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`

type Appliance = { readonly name: string; readonly faults: readonly string[] }

const APPLIANCES: readonly Appliance[] = [
  { name: 'tủ lạnh', faults: ['không lạnh', 'bị đóng tuyết'] },
  { name: 'máy giặt', faults: ['không vắt được', 'không xả nước'] },
  { name: 'máy sấy', faults: ['không khô quần áo', 'kêu to'] },
  { name: 'máy rửa bát', faults: ['không xả nước', 'báo lỗi E24'] },
  { name: 'lò vi sóng', faults: ['quay nhưng không nóng', 'báo lỗi'] },
  { name: 'bếp ga', faults: ['không lên lửa', 'lửa rất yếu'] },
  { name: 'bếp từ', faults: ['không nhận nồi', 'không nóng'] },
  { name: 'wifi', faults: ['chập chờn', 'không kết nối được'] },
  { name: 'internet', faults: ['mất mạng', 'rất chậm'] },
]
const FAULT_CARRIERS: ReadonlyArray<(appliance: Appliance, fault: string) => string> = [
  (appliance, fault) => `${cap(appliance.name)} ${fault}.`,
  (appliance, fault) => `${cap(appliance.name)} nhà mình ${fault}, cần thợ đến xem.`,
  (appliance, fault) => `Nhờ thợ qua coi giúp, ${appliance.name} ${fault}.`,
  (appliance, fault) => `${cap(appliance.name)} ${fault}, ai sửa được không?`,
]
const REQUEST_CARRIERS: ReadonlyArray<(appliance: Appliance) => string> = [
  (appliance) => `Cần thợ đến xem ${appliance.name} giúp mình.`,
  (appliance) => `Nhờ thợ sửa ${appliance.name} giúp mình.`,
  (appliance) => `Bên bạn có sửa ${appliance.name} không?`,
  (appliance) => `Mình cần bảo trì ${appliance.name} định kỳ.`,
]

describe(`${PILLAR.id}: an unsupported request is refused the same way with the flag off and on`, () => {
  it.each(APPLIANCES)('$name: every fault wording and request wording, every written form', (appliance) => {
    const rows: string[] = []
    for (const fault of appliance.faults) for (const carrier of FAULT_CARRIERS) for (const write of WRITTEN_FORMS) rows.push(write(carrier(appliance, fault)))
    for (const carrier of REQUEST_CARRIERS) for (const write of WRITTEN_FORMS) rows.push(write(carrier(appliance)))
    const wrong = rows.flatMap((text) => FLAG_STATES.map((flags) => [flags, text, verdict(text, flags)] as const))
      .filter(([, , got]) => got !== 'out_of_scope')
      .map(([flags, text, got]) => `[${flags}] ${JSON.stringify(text)} -> ${got}`)
    expect(wrong, pillarWhy(PILLAR, `${rows.length * 2} decisions for ${appliance.name} on an electrical Case`)).toEqual([])
  })

  it.each([
    ['the exact request the flagged path used to wave through', 'Tủ lạnh nhà mình không lạnh, nhờ thợ sửa.'],
    ['a request with no fault word', 'Nhờ thợ sửa tủ lạnh giúp mình.'],
    ['a stuck door', 'Nhờ thợ sửa máy giặt bị kẹt cửa.'],
    ['a connection fault', 'Wifi nhà mình chập chờn, nhờ thợ xem.'],
    ['an induction hob that will not heat', 'Cần thợ sửa bếp từ không lên.'],
    ['a microwave', 'Nhờ thợ sửa lò vi sóng.'],
  ])('%s is refused with the flag on exactly as with it off', (label, text) => {
    expect([verdict(text, 'off'), verdict(text, 'on')], pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)}`)).toEqual(['out_of_scope', 'out_of_scope'])
  })
})

describe(`${PILLAR.id}: coverage the detector does not have yet is the same with the flag off and on`, () => {
  it.each([
    ['a stuck washing-machine door named without a request verb', 'Máy giặt kẹt cửa.', 'vi'],
    ['an English request for an unsupported appliance', 'Please fix my washing machine.', 'en'],
    ['an English connection fault', 'Can someone repair the wifi router?', 'en'],
  ] as const)('pinned gap, not an endorsement: %s is accepted with the flag off and on', (label, text, language) => {
    expect([verdict(text, 'off', language), verdict(text, 'on', language)], pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)}`)).toEqual(['ok', 'ok'])
  })
})

const SUPPORTED: ReadonlyArray<readonly [string, 'vi' | 'en']> = [
  ['Ổ cắm phòng khách bị lỏng, nhờ thợ sửa.', 'vi'],
  ['Đèn phòng ngủ chập chờn, nhờ thợ kiểm tra.', 'vi'],
  ['Nhờ thợ thay công tắc đèn hành lang.', 'vi'],
  ['Aptomat trong nhà hay nhảy, nhờ thợ kiểm tra tủ điện.', 'vi'],
  ['Cần đi lại dây điện cho phòng bếp mới.', 'vi'],
  ['The outlet in the living room is loose, please repair it.', 'en'],
  ['The breaker keeps tripping, please inspect the panel.', 'en'],
  ['Điện nhà mình lúc có lúc không, không biết do tủ điện hay do máy giặt, thợ trước nói một đằng giờ mình cũng rối.', 'vi'],
  ['Ổ cắm bếp bị lỏng, máy giặt và tủ lạnh vẫn chạy bình thường.', 'vi'],
  ['Ổ cắm gần bếp từ hay bị nóng, nhờ thợ kiểm tra.', 'vi'],
  ['Không cần sửa máy giặt, chỉ cần thay công tắc đèn.', 'vi'],
  ['Mình đã sửa xong máy giặt rồi, giờ nhờ thay ổ cắm bị lỏng.', 'vi'],
]

describe(`${PILLAR.id}: a supported request stays open the same way with the flag off and on`, () => {
  it.each(SUPPORTED.flatMap(([text, language]) => WRITTEN_FORMS.map((write) => [write(text), language] as const)))(
    '%s (%s) is accepted with the flag off and on',
    (text, language) => {
      expect([verdict(text, 'off', language), verdict(text, 'on', language)], pillarWhy(PILLAR, JSON.stringify(text))).toEqual(['ok', 'ok'])
    },
  )
})

const MIXED_REFUSED = [
  'Công tắc đèn hỏng, tiện thể sửa luôn máy giặt giúp mình.',
  'Nhờ thợ thay ổ cắm phòng ngủ và sửa tủ lạnh.',
  'Thay giúp mình ổ cắm, tiện thể kiểm tra tủ lạnh có hỏng không.',
  'Cần lắp thêm đèn hành lang và nhờ thợ xem giúp cái máy giặt luôn.',
  'Ổ cắm hỏng, nhờ thợ sửa luôn cả cái máy giặt.',
] as const

const MIXED_PASSED_BY_THE_INFRASTRUCTURE_ESCAPE = [
  'Ổ cắm bếp bị lỏng và tủ lạnh cũng không lạnh, nhờ thợ sửa cả hai.',
  'Nhờ thợ kiểm tra cầu dao, cả bếp từ nhà mình cũng không nóng nữa.',
] as const

describe(`${PILLAR.id}: a message that mixes supported and unsupported work is decided identically`, () => {
  it.each(MIXED_REFUSED.flatMap((text) => WRITTEN_FORMS.map((write) => write(text))))('%s is refused as a whole with the flag off and on', (text) => {
    expect([verdict(text, 'off'), verdict(text, 'on')], pillarWhy(PILLAR, JSON.stringify(text))).toEqual(['out_of_scope', 'out_of_scope'])
  })

  it.each(MIXED_PASSED_BY_THE_INFRASTRUCTURE_ESCAPE)(
    'pinned reading, not an endorsement: %s names a fault on a fixed electrical component, so the infrastructure escape lets it through with the flag off and on',
    (text) => {
      expect([verdict(text, 'off'), verdict(text, 'on')], pillarWhy(PILLAR, JSON.stringify(text))).toEqual(['ok', 'ok'])
    },
  )
})

describe(`${PILLAR.id}: the flagged routing policy only adds refusals`, () => {
  it.each([
    ['a building-wide outage', 'Cả tòa nhà mất điện từ sáng, nhờ thợ qua xem.', 'out_of_scope'],
    ['a vehicle charger', 'Cần lắp trạm sạc xe hơi điện ở bãi đỗ xe.', 'out_of_scope'],
    ['an industrial three-phase supply', 'Cần sửa điện 3 pha cho xưởng sản xuất.', 'out_of_scope'],
    ['a television mount', 'Nhờ thợ treo tivi lên tường phòng khách.', 'service_mismatch'],
  ] as const)('%s is refused with the flag on and is not made worse by turning it on', (label, text, reason) => {
    const off = verdict(text, 'off')
    const on = verdict(text, 'on')
    expect(on, pillarWhy(PILLAR, `${label}: ${JSON.stringify(text)} off=${off} on=${on}`)).toBe(reason)
    if (off !== 'ok') expect(off, pillarWhy(PILLAR, `${label}: the legacy gate agrees when it refuses`)).toBe(reason)
  })

  it('keeps every other service decision unchanged by the flag', () => {
    const rows: ReadonlyArray<readonly [Service, string]> = [
      ['plumbing', 'Nhờ thợ sửa máy giặt bị kẹt cửa.'],
      ['handyman', 'Tủ lạnh nhà mình không lạnh, nhờ thợ sửa.'],
      ['cleaning', 'Dọn nhà tổng thể và lau tủ lạnh bên trong.'],
      ['hvac', 'Máy lạnh phòng ngủ chạy ồn, máy giặt để gần đó.'],
      ['upholstery', 'Giặt giúp mình bộ sofa đặt cạnh tivi.'],
    ]
    const wrong = rows.filter(([service, text]) => verdict(text, 'off', 'vi', service) !== verdict(text, 'on', 'vi', service))
    expect(wrong, pillarWhy(PILLAR, 'non-electrical decisions with the flag off and on')).toEqual([])
  })
})

describe(`${PILLAR.id}: a refusal never carries less safety guidance with the flag on`, () => {
  it.each([
    'Máy giặt bốc khói bên trong, nhờ thợ sửa.',
    'Tủ lạnh nhà mình hỏng và có mùi khét.',
    'Ổ cắm bốc khói, tiện thể sửa luôn tủ lạnh nhà mình.',
  ])('%s: the refusal text with the flag on carries every number the flag-off refusal carries', (text) => {
    const off = decide(text, 'off')
    const on = decide(text, 'on')
    const numbers = (value: typeof off) => (value.ok ? [] : [...new Set([...value.declineText.matchAll(/(?<!\d)(11[2-5])(?!\d)/g)].map((match) => match[1]))])
    expect(off.ok, pillarWhy(PILLAR, text)).toBe(false)
    expect(on.ok, pillarWhy(PILLAR, text)).toBe(false)
    for (const number of numbers(off)) expect(numbers(on), pillarWhy(PILLAR, `${text} (flag on drops ${number})`)).toContain(number)
  })
})

async function turn(service: Service, flags: Flags, message: string, language: 'vi' | 'en' = 'vi') {
  const world = activeWorld(service, { env: flags === 'on' ? FLAGS_ON : {} })
  const before = world.db.tables.kael_chat_turns.length
  const result = await world.request('', { message, language })
  const fresh = world.db.tables.kael_chat_turns.slice(before).filter((row) => row.role === 'kael')
  const errorText = typeof result.body.error === 'string' ? result.body.error : ''
  const visible = [...fresh.map((row) => String(row.text_content ?? '')), errorText].join('\n')
  const numbers = [...new Set([...visible.matchAll(/(?<!\d)(11[2-5])(?!\d)/g)].map((match) => match[1] as string))].sort()
  const reasons = world.db.tables.kael_chat_turns
    .map((row) => (row.safe_metadata as Record<string, unknown>).boundary_reason)
    .filter((reason): reason is string => typeof reason === 'string')
  const routes = fresh
    .map((row) => (row.safe_metadata as Record<string, unknown>).emergency_route)
    .filter((route): route is string => typeof route === 'string')
  return { world, result, visible, numbers, reasons, routes }
}

describe(`${PILLAR.id}: the electrical Case closes on an unsupported request through the real handler`, () => {
  it.each(FLAG_STATES)('a genuine fridge request closes the Case as unsupported and writes nothing else (flag %s)', async (flags) => {
    const got = await turn('electrical', flags, 'Tủ lạnh nhà mình không lạnh, nhờ thợ sửa.')
    const why = pillarWhy(PILLAR, `flag=${flags} status=${got.result.status} session=${String(got.world.session().status)} reasons=${got.reasons.join(',')}`)
    expect(got.result.status, why).toBe(200)
    expect(got.world.session().status, why).toBe('unsupported')
    expect(got.reasons, why).toEqual(['out_of_scope'])
    expect(got.world.session().job_id, why).toBeNull()
    expect(got.world.unexpectedWrites(), why).toEqual([])
  })

  it.each(FLAG_STATES)('a supported outlet request keeps the Case active (flag %s)', async (flags) => {
    const got = await turn('electrical', flags, 'Ổ cắm phòng khách bị lỏng, nhờ thợ sửa.')
    const why = pillarWhy(PILLAR, `flag=${flags} status=${got.result.status} session=${String(got.world.session().status)}`)
    expect(got.result.status, why).toBe(200)
    expect(got.world.session().status, why).toBe('active')
    expect(got.reasons, why).toEqual([])
  })

  it.each(FLAG_STATES)('a mixed message closes the Case as a whole (flag %s)', async (flags) => {
    const got = await turn('electrical', flags, 'Công tắc đèn hỏng, tiện thể sửa luôn máy giặt giúp mình.')
    const why = pillarWhy(PILLAR, `flag=${flags} status=${got.result.status} session=${String(got.world.session().status)}`)
    expect(got.world.session().status, why).toBe('unsupported')
    expect(got.reasons, why).toEqual(['out_of_scope'])
  })
})

const HAZARD_BESIDE_UNSUPPORTED: ReadonlyArray<{ readonly id: string; readonly message: string; readonly language: 'vi' | 'en'; readonly required: readonly string[] }> = [
  { id: 'smoke inside the appliance being refused', message: 'Máy giặt bốc khói đen bên trong, nhờ thợ sửa máy giặt giúp mình.', language: 'vi', required: ['114'] },
  { id: 'burning smell beside a dead fridge', message: 'Tủ lạnh nhà mình hỏng rồi, nhờ thợ sửa, và có mùi khét từ ổ cắm cạnh đó.', language: 'vi', required: [] },
  { id: 'a spark at the outlet beside a request for the fridge', message: 'Nhờ thợ sửa tủ lạnh, và ổ cắm phía sau vừa có tia lửa xẹt ra.', language: 'vi', required: ['112', '114', '115'] },
  { id: 'English: black smoke from a washing machine', message: 'My washing machine is pouring black smoke, please repair it.', language: 'en', required: ['114'] },
]

describe(`${PILLAR.id}: a hazard reported beside an unsupported request is answered with the shared gate numbers`, () => {
  it.each(HAZARD_BESIDE_UNSUPPORTED)('$id: the numbers match and the flag never removes one', async (hazard) => {
    const off = await turn('electrical', 'off', hazard.message, hazard.language)
    const on = await turn('electrical', 'on', hazard.message, hazard.language)
    const why = pillarWhy(PILLAR, `${hazard.id}: off=${off.result.status}/${off.numbers.join(',')}/${off.routes.join(',')}/${String(off.world.session().status)} on=${on.result.status}/${on.numbers.join(',')}/${on.routes.join(',')}/${String(on.world.session().status)}`)
    for (const number of hazard.required) {
      expect(off.numbers, `${why} (flag off names ${number})`).toContain(number)
      expect(on.numbers, `${why} (flag on names ${number})`).toContain(number)
    }
    for (const number of off.numbers) expect(on.numbers, `${why} (flag on never drops ${number})`).toContain(number)
    expect(on.world.unexpectedWrites().filter((write) => !write.startsWith('kael_voice_transcript=')), why).toEqual([])
    expect(on.world.session().job_id, why).toBeNull()
  })
})
