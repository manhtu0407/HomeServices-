import { afterEach, describe, expect, it, vi } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { evaluateMessageBoundary } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard'
import { hasUnsupportedRepairIntent } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/utils'
import { buildFallbackIntent } from '../../../../../../supabase/functions/mobile-api/_shared/kael/tools/intent'
import { OWNER, installEdgeRuntimeTestHooks } from '../harness'
import { activeWorld, type Service } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P429-kael-boundary-language-supply',
  invariant: 'English and Vietnamese unsupported appliance requests cannot hide behind a supported supply repair, while exclusions, finished work and incidental equipment stay open in both flag states and a genuine emergency speaks first',
  authority: ['governance/RULES.md #6', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/requested-work.ts',
  layer: 'integration',
  siblings: ['P421-kael-boundary-requested-work', 'P422-kael-boundary-electrical-flag-parity', 'P420-kael-case-emergency-playbook-precedence'],
  mutation: 'restore the whole-message electrical escape or remove English aliases: mixed requests or English repairs pass instead of being refused',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()
afterEach(() => vi.unstubAllGlobals())
const services: readonly Service[] = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']
const flagsOn = Object.fromEntries(services.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))
const unsupported = [
  'Nhờ sửa RCBO trong phòng tắm và sửa tủ lạnh bị hỏng.',
  'Please fix my washing machine.', 'Could you repair the refrigerator?', 'Please service our dishwasher.',
  'The microwave door is stuck.', 'Our dryer is broken.', 'Please check the induction hob.',
  'Can someone repair the wifi router?', 'Máy giặt kẹt cửa.', 'May giat ket cua.',
  'The outlet needs repair and please fix my fridge too.',
  'Ổ cắm bếp bị lỏng và tủ lạnh cũng không lạnh, nhờ thợ sửa cả hai.',
  'Nhờ thợ kiểm tra cầu dao, cả bếp từ nhà mình cũng không nóng nữa.',
  'Please repair my water heater and replace the outlet.',
  'Máy giặt không bấm được nút khởi động.',
]
const supported = [
  'CB nhà vệ sinh hay nhảy khi bật vòi nước nóng, nhờ kiểm tra.',
  'Nhờ sửa RCBO trong phòng tắm, cứ mở vòi nước là nhảy.',
  'My fridge is not broken. Please repair the outlet.',
  'My washing machine is not faulty, please repair the outlet.',
  'Repair the outlet behind the fridge.', 'Replace the faucet near the washing machine.',
  'Do not fix the fridge; just repair the outlet.', "Don't repair my washing machine, replace the light switch.",
  'The washing machine works fine. Please repair the outlet.',
  'We already repaired the dishwasher. Please clean the kitchen.',
  'Không cần sửa máy giặt, chỉ sửa ổ cắm.', 'Sửa ổ cắm, không bao gồm wifi.',
  'Đường ống nước nóng nối với bình nóng lạnh bị rò ở mối nối.',
  'Ổ cắm cấp nguồn cho máy giặt bị lỏng.',
  'Bếp từ mất nguồn, cần kiểm tra nguồn cấp.',
  'Bình nóng lạnh không lên nguồn, nhờ kiểm tra đường điện.',
  'The water heater has no power, inspect the supply circuit.',
]

function boundary(text: string, service: Service, enabled: boolean) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => enabled ? flagsOn[key] : undefined } })
  return evaluateMessageBoundary(text, service, { actorId: OWNER.id, language: 'en' })
}

describe(PILLAR.id, () => {
  it.each(unsupported)('refuses unsupported work: %s', (text) => {
    for (const service of services) for (const enabled of [false, true]) {
      const result = boundary(text, service, enabled)
      expect(result.ok, pillarWhy(PILLAR, `${service} flag=${enabled}: ${text}`)).toBe(false)
      if (!result.ok) expect(result.reason).toBe('out_of_scope')
    }
  })
  it.each(supported)('keeps supported work open: %s', (text) => {
    const service: Service = text === 'Đường ống nước nóng nối với bình nóng lạnh bị rò ở mối nối.' ? 'plumbing' : 'electrical'
    for (const enabled of [false, true]) expect(boundary(text, service, enabled).ok, pillarWhy(PILLAR, text)).toBe(true)
  })
  it.each(['Please fix my washing machine.', 'Can someone repair the wifi router?', 'Please service our dishwasher.'])('keeps the deterministic intent fallback consistent: %s', (text) => {
    expect(hasUnsupportedRepairIntent(text), pillarWhy(PILLAR, text)).toBe(true)
  })
  it.each([false, true])('the fallback refuses a mixed unsupported request without masking a fixed-appliance supply fault, flags=%s', (enabled) => {
    expect(buildFallbackIntent('electrical', [], 'Please repair the outlet and fix my washing machine.', enabled).service_type).toBe('unsupported')
    expect(buildFallbackIntent('electrical', [], 'Bếp từ mất nguồn, cần kiểm tra nguồn cấp.', enabled).service_type).toBe('electrical')
  })
  it.each([false, true])('fallback preserves explicit exclusions without ignoring requested work, flags=%s', (enabled) => {
    for (const text of [
      'Đèn không sáng, không bao gồm sửa wifi.',
      'Đèn không sáng, không bao gồm sửa máy sấy.',
      'Den khong sang, khong bao gom sua may say.',
      'The light is broken, not included repair the dryer.',
    ]) {
      expect(hasUnsupportedRepairIntent(text, 'electrical'), pillarWhy(PILLAR, text)).toBe(false)
      expect(buildFallbackIntent('electrical', [], text, enabled).service_type).toBe('electrical')
    }
    expect(buildFallbackIntent('electrical', [], 'Đèn không sáng và sửa wifi, không bao gồm máy sấy.', enabled).service_type).toBe('unsupported')
  })
  it.each([false, true])('delivers visible emergency guidance and metadata before the refusal, flags=%s', async (enabled) => {
    const world = activeWorld('electrical', { env: enabled ? flagsOn : {} })
    world.db.tables.jobs = []
    const before = world.db.tables.kael_chat_turns.length
    const result = await world.request('', { message: 'My fridge is broken and the outlet is sparking beside it. Please fix both.', language: 'en' })
    const replies = world.db.tables.kael_chat_turns.slice(before).filter((turn) => turn.role === 'kael')
    expect(result.status).toBe(200)
    expect(replies.length).toBe(2)
    expect(replies.filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route === 'electrical_water')).toHaveLength(1)
    expect(String(replies[0]?.text_content)).toContain('112')
    expect(String(replies[0]?.text_content)).toContain('114')
    expect(String(replies[0]?.text_content)).toContain('115')
    expect(replies[0]?.safe_metadata).toMatchObject({ emergency_route: 'electrical_water' })
    expect(world.db.tables.jobs).toHaveLength(0)
  })
})
