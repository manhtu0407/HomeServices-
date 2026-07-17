import { describe, expect, it, vi } from 'vitest'
import {
  applyHardRoutingPolicy,
  buildSafetyFirstElectricalEstimate,
  deterministicSafetyGuidance,
  getRequiredSlotPolicy,
  hasElectricalInfrastructureContext,
  prependDeterministicSafetyGuidance,
  resolveRequiredSlotCoverage,
  scanIntakeSafetySignals,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/electrical-intake-policy'
import { getKaelPerformanceProfile } from '../../../../../supabase/functions/mobile-api/_shared/kael/performance-profiles'
import { evaluateMessageBoundary } from '../../../../../supabase/functions/mobile-api/_shared/kael/boundary-guard'
import { buildFallbackIntent } from '../../../../../supabase/functions/mobile-api/_shared/kael/intent'
import { resolveElectricalIntakeRuntime } from '../../../../../supabase/functions/mobile-api/_shared/kael/intake-runtime'
import { buildSafetyFirstKaelClarification, mergeBoundarySafetyGuidance, persistentKaelSafetySignals, requiresImmediateKaelSafetyPath, resolveKaelResponseSafetySignals } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-intake-safety'
import { maybeApplyKaelBoundaryGuard, maybeHandleDemandingCustomerKaelChatTurn } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-core'
import { buildEstimateCardOutput } from '../../../../../supabase/functions/mobile-api/_shared/kael/output-pipeline'
import { buildInitialDiagnosisScopeArtifact, buildKaelMissingInfoArtifactProposal } from '../../../../../supabase/functions/mobile-api/_shared/kael/artifact-contract'
import { diagnosisScopeWithQuestion } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-case-work'
import { formatKaelEstimateText, serializeKaelTurn } from '../../../../../supabase/functions/mobile-api/_shared/services/_shared'

describe('Kael electrical minimum-slot policy', () => {
  it('gates an installation estimate on device, wiring path, and parts only', () => {
    const policy = getRequiredSlotPolicy('electrical', 'install_device')

    expect(policy).toEqual({
      serviceType: 'electrical',
      problemSlug: 'install_device',
      minimumSlots: [
        'device_or_circuit_type',
        'access_and_concealed_wiring',
        'parts_or_new_device_requirement',
      ],
      optionalSlots: [
        'affected_area_and_power_state',
        'symptom_and_duration',
        'urgency_and_repeat_fault',
      ],
      estimateWithoutPhoto: true,
    })
  })

  it('does not treat absent optional installation facts as clarification blockers', () => {
    const profile = getKaelPerformanceProfile('electrical')
    expect(profile).not.toBeNull()
    if (!profile) throw new Error('electrical profile is required')

    expect(resolveRequiredSlotCoverage(profile, 'install_device', {
      device_or_circuit_type: 'quạt trần',
      access_and_concealed_wiring: 'đi dây nổi từ điểm điện hiện có',
      parts_or_new_device_requirement: 'khách đã có quạt',
    })).toEqual({
      facts: {
        device_or_circuit_type: 'quạt trần',
        access_and_concealed_wiring: 'đi dây nổi từ điểm điện hiện có',
        parts_or_new_device_requirement: 'khách đã có quạt',
      },
      missing: [],
    })
  })

  it('reports only the missing minimum slot for an installation branch', () => {
    const profile = getKaelPerformanceProfile('electrical')
    expect(profile).not.toBeNull()
    if (!profile) throw new Error('electrical profile is required')

    expect(resolveRequiredSlotCoverage(profile, 'install_device', {
      device_or_circuit_type: 'bếp từ',
      access_and_concealed_wiring: 'cần đi đường dây mới',
      symptom_and_duration: 'lắp mới',
    })).toEqual({
      facts: {
        device_or_circuit_type: 'bếp từ',
        symptom_and_duration: 'lắp mới',
        access_and_concealed_wiring: 'cần đi đường dây mới',
      },
      missing: ['parts_or_new_device_requirement'],
    })
  })

  it('does not close breaker or room-outage intake before branch-CB state is grounded', () => {
    const profile = getKaelPerformanceProfile('electrical')
    expect(profile).not.toBeNull()
    if (!profile) throw new Error('electrical profile is required')

    const baseFacts = {
      affected_area_and_power_state: 'phòng khách mất điện, đèn vẫn sáng',
      device_or_circuit_type: 'toàn bộ ổ cắm phòng khách',
    }
    expect(resolveRequiredSlotCoverage(profile, 'power_outage_one_room', baseFacts)).toMatchObject({
      missing: ['breaker_state'],
    })
    expect(resolveRequiredSlotCoverage(profile, 'breaker_trip', baseFacts)).toMatchObject({
      missing: ['breaker_state'],
    })
    expect(resolveRequiredSlotCoverage(profile, 'power_outage_one_room', {
      ...baseFacts,
      breaker_state: 'aptomat nhánh chưa nhảy và chưa được bật lại',
    })).toMatchObject({
      missing: [],
      facts: { breaker_state: 'aptomat nhánh chưa nhảy và chưa được bật lại' },
    })
  })

  it('falls back to full quote-driver coverage outside approved electrical slugs', () => {
    const profile = getKaelPerformanceProfile('electrical')
    expect(profile).not.toBeNull()
    if (!profile) throw new Error('electrical profile is required')

    const coverage = resolveRequiredSlotCoverage(profile, 'unapproved_electrical_slug', {
      affected_area_and_power_state: 'một phòng vẫn có điện yếu',
    })

    expect(getRequiredSlotPolicy('electrical', 'unapproved_electrical_slug')).toBeNull()
    expect(coverage.facts).toEqual({
      affected_area_and_power_state: 'một phòng vẫn có điện yếu',
    })
    expect(coverage.missing).toEqual(profile.quote_drivers.slice(1))
  })

  it('preserves full quote-driver coverage for every non-electrical service', () => {
    for (const serviceType of ['plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const) {
      const profile = getKaelPerformanceProfile(serviceType)
      expect(profile).not.toBeNull()
      if (!profile) throw new Error(`${serviceType} profile is required`)

      const firstDriver = profile.quote_drivers[0]
      expect(firstDriver).toBeDefined()
      if (!firstDriver) throw new Error(`${serviceType} quote driver is required`)

      expect(getRequiredSlotPolicy(serviceType, 'any_slug')).toBeNull()
      expect(resolveRequiredSlotCoverage(profile, 'any_slug', {
        [firstDriver]: 'confirmed',
        invented_driver: 'must not cross the contract',
      })).toEqual({
        facts: { [firstDriver]: 'confirmed' },
        missing: profile.quote_drivers.slice(1),
      })
    }
  })
})

describe('Kael electrical hard routing policy', () => {
  it.each([
    {
      name: 'building common-area power loss',
      text: 'Cả tầng và hành lang chung đều mất điện.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'building_common_area_power',
      },
    },
    {
      name: 'unaccented building common-area power loss',
      text: 'Ca tang va hanh lang chung deu mat dien.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'building_common_area_power',
      },
    },
    {
      name: 'EV charger installation',
      text: 'Cần lắp trạm sạc ô tô điện ở chỗ đậu xe.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'unsupported_ev_charger',
      },
    },
    {
      name: 'Vietnamese electric-vehicle charging-station repair',
      text: 'Cần sửa trạm sạc xe điện.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'unsupported_ev_charger',
      },
    },
    {
      name: 'Vietnamese electric-vehicle charging-station installation',
      text: 'Cần lắp hệ thống sạc xe điện ở hầm.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'unsupported_ev_charger',
      },
    },
    {
      name: 'industrial three-phase supply',
      text: 'Xưởng cần nguồn điện ba pha 380V cho máy công nghiệp.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'unsupported_industrial_three_phase',
      },
    },
    {
      name: 'pure TV mounting',
      text: 'Chỉ treo TV lên tường, không đi dây hay đấu nguồn.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'handyman',
        reasonCode: 'pure_mounting_handyman',
      },
    },
    {
      name: 'air-conditioner device fault',
      text: 'Máy lạnh vẫn có điện nhưng không lạnh và chảy nước.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'hvac',
        reasonCode: 'hvac_device_fault',
      },
    },
    {
      name: 'water-only heater leak',
      text: 'Bình nóng lạnh rò nước, phần điện vẫn hoạt động bình thường.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'plumbing',
        reasonCode: 'water_only_heater_leak',
      },
    },
    {
      name: 'English air-conditioner device leak',
      text: 'The air conditioner is leaking water.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'hvac',
        reasonCode: 'hvac_device_fault',
      },
    },
    {
      name: 'English heater leak with unrelated normal HVAC',
      text: 'The air conditioner is working normally, but the water heater is leaking and its electrical side is working normally.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'plumbing',
        reasonCode: 'water_only_heater_leak',
      },
    },
    {
      name: 'English building outage',
      text: 'The whole floor has no power.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'building_common_area_power',
      },
    },
    {
      name: 'ongoing Vietnamese building outage since yesterday',
      text: 'Cả tầng mất điện từ hôm qua và đến giờ vẫn chưa có điện.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'building_common_area_power',
      },
    },
    {
      name: 'ongoing English building outage since yesterday',
      text: 'The whole floor has had a power outage since yesterday and is still out.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'building_common_area_power',
      },
    },
    {
      name: 'English EV charger',
      text: 'Install an EV charging station for my car.',
      expected: {
        scopeSignal: 'out_of_scope',
        suggestedService: null,
        reasonCode: 'unsupported_ev_charger',
      },
    },
    {
      name: 'English TV mount',
      text: 'Mount the TV on the wall only; no electrical wiring is needed.',
      expected: {
        scopeSignal: 'service_mismatch',
        suggestedService: 'handyman',
        reasonCode: 'pure_mounting_handyman',
      },
    },
  ])('returns a deterministic decision for $name', ({ text, expected }) => {
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text,
    })).toEqual(expected)
  })

  it.each([
    ['unit outage with common-area power intact', 'Cả căn hộ mất điện nhưng hành lang vẫn có điện.'],
    ['TV work with an electrical connection', 'Treo TV và đi thêm ổ cắm âm tường phía sau TV.'],
    ['air-conditioner feeder fault', 'Máy lạnh bình thường nhưng CB cấp nguồn cho máy lạnh nhảy liên tục.'],
    ['water-heater power fault', 'Bình nóng lạnh không lên nguồn và CB chống giật bị nhảy.'],
    ['ordinary outlet quantity', 'Cần lắp thêm ba ổ cắm trong phòng ngủ.'],
    ['phone charging', 'Ổ cắm dùng sạc điện thoại bị lỏng.'],
    ['electric scooter charging', 'Ổ cắm bị lỏng khi cắm bộ sạc xe điện, cần sửa ổ cắm.'],
    ['unknown electrical symptom', 'Ổ cắm trong phòng chập chờn từ sáng nay.'],
    ['unit outage while building has power', 'Cả tầng vẫn có điện, riêng căn hộ của tôi bị mất điện.'],
    ['unit outage after contrast', 'Toàn bộ tầng vẫn có điện nhưng căn hộ tôi mất điện.'],
    ['current floor outage with valid powered-unit repair', 'Cả tầng đang mất điện nhưng căn hộ tôi vẫn có điện; tôi chỉ cần sửa ổ cắm bị lỏng.'],
    ['current floor outage while the customer home has power', 'Cả tầng đang mất điện nhưng nhà em vẫn có điện; em chỉ cần sửa ổ cắm bị lỏng.'],
    ['current floor outage while the customer apartment has power', 'Cả tầng đang mất điện nhưng căn hộ em vẫn có điện; em chỉ cần sửa ổ cắm bị lỏng.'],
    ['English floor outage with valid powered-unit repair', 'The whole floor has a power outage, but my apartment still has power; I only need the loose outlet repaired.'],
    ['English floor outage while our apartment has power', 'The whole floor has a power outage, but our apartment still has power; we only need the loose outlet repaired.'],
    ['normal car charger mention', 'Bộ sạc ô tô vẫn bình thường, chỉ ổ cắm bếp bị hỏng.'],
    ['unrelated industrial system', 'Hệ thống 3 pha của nhà máy ở nơi khác, căn hộ chỉ hỏng công tắc.'],
    ['resolved Vietnamese building outage', 'Hôm qua cả tầng mất điện, nhưng hôm nay chỉ ổ cắm nhà tôi bị hỏng.'],
    ['resolved English building outage', 'The whole floor had a power outage yesterday, but today only my outlet is broken.'],
    ['resolved Vietnamese outage with current-time contrast', 'Hôm qua cả tầng mất điện, nhưng bây giờ chỉ ổ cắm nhà tôi bị hỏng.'],
    ['resolved English outage with current-time contrast', 'Yesterday the whole floor had a power outage, but now only my outlet is broken.'],
    ['historical Vietnamese building outage with current unit outage', 'Hôm qua cả tầng mất điện, nhưng căn hộ tôi vẫn mất điện.'],
    ['historical English building outage with current unit outage', 'Yesterday the whole floor had a power outage, but my apartment still has no power.'],
    ['negated appliance fault with valid outlet work', "The washing machine isn't broken; only the outlet is loose."],
    ['negated refrigerator fault with valid outlet work', "The refrigerator isn't broken; I only need the loose outlet fixed."],
    ['negated microwave fault', "The microwave isn't broken."],
    ['unrelated English sink leak beside normal HVAC', 'The air conditioner works normally; the sink is leaking.'],
    ['unrelated Vietnamese sink leak beside normal HVAC', 'Máy lạnh vẫn bình thường; bồn rửa đang rò nước.'],
    ['unrelated English sink leak beside normal heater', 'The water heater works normally; the sink is leaking.'],
    ['unrelated Vietnamese sink leak beside normal heater', 'Bình nóng lạnh vẫn bình thường; bồn rửa đang rò nước.'],
    ['bare Vietnamese water-heater leak', 'Bình nóng lạnh rò nước.'],
    ['bare English water-heater leak', 'The water heater is leaking.'],
    ['unrelated English pipe drilling beside normal TV', 'The TV works normally; drill the wall to access a leaking water pipe.'],
    ['unrelated Vietnamese pipe drilling beside normal TV', 'TV vẫn bình thường; cần khoan tường để kiểm tra ống nước bị rò.'],
  ])('leaves $0 for the model', (_name, text) => {
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text,
    })).toBeNull()
  })

  it.each([
    ['Không phải cả tầng mất điện; chỉ một ổ cắm trong căn hộ bị hỏng.'],
    ['Không lắp trạm sạc xe điện; chỉ sửa ổ cắm dùng sạc điện thoại.'],
    ['Nhà không dùng điện ba pha công nghiệp, chỉ cần thêm ba ổ cắm.'],
    ['Không cần treo TV, cần sửa ổ cắm phía sau TV.'],
    ['Máy lạnh bình thường; chỉ CB cấp nguồn cho máy lạnh nhảy.'],
    ['Bình nóng lạnh không rò nước, chỉ bị mất nguồn.'],
  ])('does not route a negated boundary signal: %s', (text) => {
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text,
    })).toBeNull()
  })

  it('does not apply electrical hard routes to another selected service', () => {
    expect(applyHardRoutingPolicy({
      selectedService: 'plumbing',
      text: 'Chỉ treo TV lên tường, không đấu điện.',
    })).toBeNull()
  })
})

describe('Kael electrical deterministic safety pre-scan', () => {
  it.each([
    ['burning or smoke', 'Ổ cắm bốc khói và có mùi khét.', 'smoke_or_burning'],
    ['sparking', 'Ổ cắm tóe lửa mỗi khi cắm phích.', 'sparking'],
    ['Vietnamese short circuit', 'Ổ cắm bị chập điện.', 'sparking'],
    ['English short circuit', 'There is a short circuit at the outlet.', 'sparking'],
    ['exposed conductor', 'Dây điện lòi lõi đồng cạnh công tắc.', 'exposed_live_parts'],
    ['water near power', 'Nước dột ngay cạnh tủ điện.', 'water_near_power'],
    ['water flowing into outlet', 'Nước đang rò và chảy vào ổ cắm.', 'water_near_power'],
    ['flooded outlet', 'Ổ cắm bị ngập nước.', 'water_near_power'],
    ['water from outlet', 'Nước rò ra từ ổ cắm.', 'water_near_power'],
    ['wet breaker', 'Aptomat bị ướt.', 'water_near_power'],
    ['roof leak above light', 'Nước dột lên đèn trần.', 'water_near_power'],
    ['rain entering outlet', 'Mưa tạt vào ổ cắm ban công.', 'water_near_power'],
    ['damp near outlet', 'Ẩm gần ổ cắm phòng tắm.', 'water_near_power'],
    ['protective device', 'Aptomat nhảy liên tục dù đã rút thiết bị.', 'protective_device'],
    ['distribution board', 'Tủ điện trong căn hộ phát tiếng rè.', 'distribution_board'],
    ['fixed wiring', 'Cần kiểm tra đường dây âm tường bị chập chờn.', 'fixed_wiring'],
    ['new circuit', 'Cần lắp một mạch điện mới riêng cho bếp từ.', 'new_circuit'],
    ['unaccented hazard', 'O cam toe lua va co mui khet.', 'sparking'],
    ['English smoke', 'The outlet is smoking and smells burnt.', 'smoke_or_burning'],
    ['English sparking', 'The outlet is sparking.', 'sparking'],
    ['English exposed wire', 'An exposed wire is visible by the switch.', 'exposed_live_parts'],
    ['Vietnamese component before exposed state', 'Ổ cắm không bị cháy nhưng dây điện bị hở.', 'exposed_live_parts'],
    ['English component before exposed state', 'The outlet is not burned but the wire is bare.', 'exposed_live_parts'],
    ['English wet outlet', 'Water is leaking into the outlet beside the breaker.', 'water_near_power'],
    ['English water from outlet', 'Water is leaking from the outlet.', 'water_near_power'],
    ['English flooded outlet', 'The outlet is flooded.', 'water_near_power'],
    ['Vietnamese wet switch', 'Công tắc bị ướt.', 'water_near_power'],
    ['English wet switch', 'The switch is wet.', 'water_near_power'],
    ['Vietnamese water into switch', 'Nước đang chảy vào công tắc.', 'water_near_power'],
    ['English water into switch', 'Water is leaking into the switch.', 'water_near_power'],
    ['English breaker', 'The breaker keeps tripping.', 'protective_device'],
    ['burned outlet', 'Ổ cắm bị cháy đen.', 'smoke_or_burning'],
    ['melted outlet shell', 'Vỏ ổ cắm bị nóng chảy.', 'smoke_or_burning'],
    ['scorched switch', 'Công tắc bị xém đen.', 'smoke_or_burning'],
    ['burned wire', 'Dây điện bị cháy.', 'smoke_or_burning'],
  ])('detects the exact supported signal for $0', (_name, text, signal) => {
    const signals = scanIntakeSafetySignals('electrical', text)

    expect(signals).toContain(signal)
    expect(new Set(signals).size).toBe(signals.length)
  })

  it.each([
    ['The electrical panel is buzzing.', 'distribution_board'],
    ['I need a new dedicated circuit for the induction cooktop.', 'new_circuit'],
    ['The concealed wiring inside the wall is damaged.', 'fixed_wiring'],
  ])('maps the English electrical capability in %s', (text, signal) => {
    expect(scanIntakeSafetySignals('electrical', text)).toEqual([signal])
  })

  it.each([
    ['Hệ thống điện vẫn bình thường, chỉ thay bóng đèn.'],
    ['Dây âm tường còn tốt, chỉ thay ổ cắm.'],
    ['Đã có đường điện riêng và CB, chỉ lắp vào mạch sẵn có.'],
    ['Em mới nhận nhà, nhờ thợ kiểm tra lại toàn bộ hệ thống điện căn hộ.'],
    ['The electrical panel is working normally and the outlet is broken.'],
    ['The apartment already has a dedicated circuit and I need a new outlet.'],
    ['The concealed wiring inside the wall is intact and the outlet is damaged.'],
  ])('does not infer a capability from a normal infrastructure mention: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).toEqual([])
  })

  it.each([
    ['Không có mùi khét, không khói, không tia lửa và dây điện không hở.'],
    ['Ổ cắm hơi lỏng nhưng không phát tia lửa.'],
    ['Nước rò dưới bồn rửa, xa mọi ổ điện.'],
    ['Nước rò trong phòng tắm. Tủ điện ở phòng khách vẫn khô ráo.'],
    ['Aptomat vẫn bật bình thường, không nhảy và tủ điện vẫn khô ráo.'],
    ['Aptomat không nhảy và tủ điện không lỗi, không nóng.'],
    ['Không thấy tia lửa hay mùi khét ở ổ cắm.'],
    ['Ổ cắm không còn khói và không còn tia lửa.'],
    ['Tường không còn ẩm gần ổ cắm.'],
    ['Ổ cắm không thấy có khói.'],
    ['Ổ cắm không bị chập điện.'],
    ['Không dột lên đèn và không mưa tạt vào ổ cắm.'],
    ['There is no sparking or burning smell; the outlet is loose.'],
    ['There is no short circuit at the outlet.'],
    ['There is no longer smoke or sparking at the outlet.'],
    ['I no longer see any smoke at the outlet.'],
    ['The outlet is no longer wet.'],
    ['The electrical panel is working normally.'],
    ['The apartment already has a dedicated circuit for the cooktop.'],
    ['The concealed wiring inside the wall is intact.'],
    ['Bếp có mùi khét từ món ăn; ổ cắm vẫn khô ráo và hoạt động bình thường.'],
    ['Đồ ăn đang bốc khói trên bếp; ổ cắm chỉ bị lỏng.'],
    ['Đồ ăn bốc khói và có mùi khét; ổ cắm chỉ bị lỏng.'],
    ['Food is smoking on the stove; the outlet is loose.'],
    ['The food has a burning smell; the outlet is loose.'],
    ['Cần sạc điện thoại bằng ổ cắm thường.'],
  ])('does not emit a negated or unrelated safety signal: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).toEqual([])
  })

  it.each([
    'Bồn rửa bị rò nước và ổ cắm phòng ngủ vẫn bình thường.',
    'Bồn rửa bị rò nước và tủ điện vẫn bình thường.',
    'The sink is leaking and the outlet across the room works normally.',
    'Water is leaking far away from the outlet.',
    'Nước rò vào bồn rửa và ổ cắm ở phòng khác vẫn khô.',
    'Water is leaking into the sink and the outlet in another room remains dry.',
  ])('does not infer water-near-power from unrelated water and normal power mentions: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).not.toContain('water_near_power')
  })

  it.each([
    'Ổ cắm có khói.',
    'Tủ điện có khói.',
    'Khói bốc ra từ ổ cắm.',
  ])('detects component-relative Vietnamese smoke: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).toContain('smoke_or_burning')
  })

  it('does not detect negated component-relative Vietnamese smoke', () => {
    expect(scanIntakeSafetySignals('electrical', 'Ổ cắm không có khói.')).not.toContain('smoke_or_burning')
  })

  it.each([
    ['Ổ cắm không ướt, không ngập, không cháy và không nóng chảy.'],
    ['Công tắc không cháy đen, không xém đen; vỏ ổ cắm không bị cháy.'],
    ['The outlet is not wet, not flooded, not burned, not burnt, not scorched, and not melted.'],
    ["The wire isn't bare, the outlet isn't smoking, and the panel isn't damp."],
    ['Dây điện không bị hở và ổ cắm không cháy.'],
    ['The wire is not exposed and the outlet is not burned.'],
  ])('removes every negated critical lexical form while preserving the positive vocabulary: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).toEqual([])
  })

  it.each([
    ['Bình nóng lạnh vẫn có nước nóng bình thường.'],
    ['Nước nóng đang chảy bình thường từ bình nóng lạnh.'],
    ['The water heater is producing hot water normally.'],
    ['Hot water is flowing normally from the water heater.'],
    ['Bình nóng lạnh không rò nước, nước nóng vẫn bình thường.'],
    ['The water heater is not leaking and its hot water is normal.'],
    ['Bình nóng lạnh bị rò nước nhỏ giọt dưới đáy bình.'],
    ['The water heater is dripping from its tank.'],
  ])('does not treat normal water-heater operation as water near power: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).not.toContain('water_near_power')
  })

  it.each([
    ['Ổ cắm bị ngập nước và vỏ bị nóng chảy.'],
    ['The flooded outlet has a scorched, melted cover.'],
    ['Nước đang chảy vào phần điện của bình nóng lạnh.'],
    ['Water is entering the electrical parts of the water heater.'],
  ])('retains an affirmative critical water or burn hazard: %s', (text) => {
    expect(scanIntakeSafetySignals('electrical', text)).toEqual(expect.arrayContaining(
      text.toLowerCase().includes('nóng chảy') || text.toLowerCase().includes('melted')
        ? ['water_near_power', 'smoke_or_burning']
        : ['water_near_power'],
    ))
  })

  it('keeps a later critical hazard after unrelated uncertainty', () => {
    expect(scanIntakeSafetySignals(
      'electrical',
      'Không rõ nguyên nhân nhưng ổ cắm đang bốc khói.',
    )).toContain('smoke_or_burning')
  })

  it('runs before routing so a water-heater mismatch retains its electrical hazard', () => {
    const text = 'Bình nóng lạnh rò nước vào hộp đấu điện, phần điện vẫn hoạt động bình thường.'

    expect(scanIntakeSafetySignals('electrical', text)).toContain('water_near_power')
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text,
    })).toMatchObject({
      scopeSignal: 'service_mismatch',
      suggestedService: 'plumbing',
    })
  })

  it('uses conservative combined-hazard guidance before any touch or unplug action', () => {
    const signals = scanIntakeSafetySignals(
      'electrical',
      'Nước đang chảy vào ổ cắm và ổ cắm bốc khói.',
    )
    const guidance = deterministicSafetyGuidance(signals, 'vi')

    expect(signals).toEqual(expect.arrayContaining(['water_near_power', 'smoke_or_burning']))
    expect(guidance).toContain('ngắt aptomat tổng')
    expect(guidance).not.toContain('Rút phích')
  })

  it.each(['smoke_or_burning', 'sparking', 'exposed_live_parts', 'water_near_power'])(
    'uses the same conservative VI and EN invariant for %s',
    (signal) => {
      const viGuidance = deterministicSafetyGuidance([signal], 'vi')
      const enGuidance = deterministicSafetyGuidance([signal], 'en')

      expect(viGuidance).toContain('bảng điện khô ráo')
      expect(viGuidance).toContain('Không chạm, rút phích, lau dọn hoặc lại gần')
      expect(viGuidance).toContain('cứu hỏa 114')
      expect(enGuidance).toContain('panel is dry and safely reachable')
      expect(enGuidance).toContain('Do not touch, unplug, clean, or approach')
      expect(enGuidance).toContain('fire emergency 114')
    },
  )

  it('does not prepend current-turn boundary safety guidance twice', () => {
    const guidance = deterministicSafetyGuidance(['smoke_or_burning'], 'en')
    if (!guidance) throw new Error('expected safety guidance')
    const text = mergeBoundarySafetyGuidance(
      `${guidance} This request is outside the supported scope.`,
      ['smoke_or_burning'],
      ['smoke_or_burning'],
      'en',
    )

    expect(text.match(/Switch off the main breaker/g)).toHaveLength(1)
    expect(mergeBoundarySafetyGuidance(
      'This request is outside the supported scope.',
      [],
      ['smoke_or_burning'],
      'en',
    )).toMatch(/^Switch off the main breaker/)
  })

  it.each([
    {
      language: 'vi' as const,
      providerText: 'Rút phích các thiết bị quanh ổ cắm. Sau đó lại gần để lau nước. Dấu hiệu bắt đầu khi nào?',
    },
    {
      language: 'en' as const,
      providerText: 'Unplug the devices beside the outlet. Then approach it and wipe the water. When did this start?',
    },
    {
      language: 'vi' as const,
      providerText: 'Tháo thiết bị khỏi ổ cắm đang cháy. Dùng khăn thấm nước.',
    },
    {
      language: 'en' as const,
      providerText: 'Remove the plug from the smoking outlet. Dry it with a cloth. Handle the plug carefully and inspect it closely.',
    },
  ])('replaces untrusted provider copy after a critical signal: $language', ({
    language,
    providerText,
  }) => {
    const text = prependDeterministicSafetyGuidance(
      providerText,
      ['water_near_power'],
      language,
      { trustedText: false },
    )

    expect(text).toBe(deterministicSafetyGuidance(['water_near_power'], language))
    expect(text).not.toContain(providerText)
  })

  it('preserves trusted formatted amounts without sentence re-tokenization', () => {
    const estimate = 'Ước tính 150.000-300.000 VND.'
    const guidance = deterministicSafetyGuidance(['smoke_or_burning'], 'vi')

    expect(prependDeterministicSafetyGuidance(
      estimate,
      ['smoke_or_burning'],
      'vi',
    )).toBe(`${guidance} ${estimate}`)
  })

  it('uses deterministic safety even when the provider observation is structurally unavailable', () => {
    const signals = resolveKaelResponseSafetySignals({
      electricalPlaybookEnabled: true,
      earlySafetySignals: ['water_near_power'],
      pipelineSafetySignals: [],
      intakeObservation: undefined,
    })

    expect(signals).toEqual(['water_near_power'])
    expect(prependDeterministicSafetyGuidance(
      'The selected service does not match.',
      signals,
      'en',
    )).toMatch(/^Switch off the main breaker/)
  })

  it('replaces a critical provider question once across visible and structured sinks', () => {
    const unsafeProviderText = 'Unplug the smoking outlet, then tell Kael when this began?'
    const safe = buildSafetyFirstKaelClarification({
      providerText: unsafeProviderText,
      focusedFallback: 'When did the visible symptom begin?',
      safetySignals: ['smoke_or_burning'],
      language: 'en',
    })
    const proposal = buildKaelMissingInfoArtifactProposal({
      missingFields: ['symptom_and_duration'],
      question: safe.question,
      artifactType: 'ai_notes',
    })
    const artifact = diagnosisScopeWithQuestion(
      buildInitialDiagnosisScopeArtifact({
        serviceType: 'electrical',
        customerGoal: 'smoking outlet',
      }),
      ['symptom_and_duration'],
      safe.question,
      0.4,
    )
    const serialized = serializeKaelTurn({
      id: 'turn-1',
      session_id: 'session-1',
      turn_index: 1,
      role: 'kael',
      content_type: 'clarification',
      text_content: safe.visibleText,
      media_refs: [],
      safe_metadata: { artifact_proposal: proposal, diagnosis_scope: artifact },
      created_at: '2026-07-16T00:00:00.000Z',
    })

    expect(safe.safetyFallbackUsed).toBe(true)
    expect(safe.question).toBe('When did the visible symptom begin?')
    expect(safe.visibleText).toContain(safe.question)
    expect(safe.visibleText).not.toContain(unsafeProviderText)
    expect(artifact.next_action).toEqual({ kind: 'ask_question', question: safe.question })
    expect(serialized.clarification?.question).toBe(safe.question)
    expect(JSON.stringify(serialized)).not.toContain(unsafeProviderText)
  })

  it('replaces critical estimate copy in text and both structured advisory surfaces', () => {
    const unsafeSummary = 'Approach the outlet and unplug it for inspection.'
    const unsafeAdvisory = 'Switch off the affected circuit and handle the plug.'
    const estimate = buildSafetyFirstElectricalEstimate({
      service_type: 'electrical',
      problem_category: 'outlet_or_switch_broken',
      problem_summary: unsafeSummary,
      complexity: 'medium',
      price_min: 150_000,
      price_max: 300_000,
      confidence: 0.85,
      advisory: unsafeAdvisory,
      disclaimer: 'Final price requires customer review.',
    }, ['water_near_power'], 'en')
    const card = buildEstimateCardOutput({
      estimate,
      language: 'en',
      priceSource: 'inspection_required',
      baselineUsed: 'electrical:outlet_or_switch_broken:medium',
      needsInspectionReason: estimate.needs_inspection_reason,
    })
    const text = prependDeterministicSafetyGuidance(
      formatKaelEstimateText(estimate, 'en'),
      ['water_near_power'],
      'en',
    )
    const serialized = serializeKaelTurn({
      id: 'turn-2',
      session_id: 'session-1',
      turn_index: 2,
      role: 'kael',
      content_type: 'estimate',
      text_content: text,
      media_refs: [],
      safe_metadata: { estimate, estimate_card_v3: card },
      created_at: '2026-07-16T00:00:01.000Z',
    })

    expect(estimate.problem_summary).not.toContain(unsafeSummary)
    expect(estimate.advisory).not.toContain(unsafeAdvisory)
    expect(estimate.advisory).toContain('Do not approach or touch')
    expect(estimate.needs_inspection).toBe(true)
    expect(estimate.price_min).toBe(150_000)
    expect(estimate.price_max).toBe(300_000)
    expect(card.card.advisory).toBe(estimate.advisory)
    expect(serialized.estimate?.advisory).toBe(estimate.advisory)
    expect(text).toContain('150,000-300,000 VND')
    expect(JSON.stringify({ text, estimate, card, serialized })).not.toContain(unsafeSummary)
    expect(JSON.stringify({ text, estimate, card, serialized })).not.toContain(unsafeAdvisory)
  })

  it('does not scan another selected service with electrical-only policy', () => {
    expect(scanIntakeSafetySignals('plumbing', 'Ổ cắm đang tóe lửa.')).toEqual([])
  })

  it('lets the emergency kill-switch bypass chat boundary and demanding-customer early exits', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => [
          'KAEL_AI_KILL_SWITCH',
          'KAEL_PLAYBOOK_ELECTRICAL_ENABLED',
        ].includes(key) ? 'true' : undefined,
      },
    })
    try {
      await expect(maybeApplyKaelBoundaryGuard(
        {} as never,
        'session-1',
        'Cần lắp trạm sạc xe điện ngay, nếu không tôi sẽ khiếu nại.',
        'electrical',
        { actorId: 'customer-1', jobId: null },
      )).resolves.toBe(false)
      await expect(maybeHandleDemandingCustomerKaelChatTurn({} as never, {
        sessionId: 'session-1',
        actorId: 'customer-1',
        jobId: null,
        status: 'active',
        metadata: {},
        message: 'Làm ngay nếu không tôi sẽ khiếu nại.',
        qaCount: 4,
      })).resolves.toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('bypasses demanding-customer handling only for a flag-enabled critical hazard', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      expect(requiresImmediateKaelSafetyPath('Ổ cắm đang bốc khói.', 'electrical')).toBe(true)
      expect(requiresImmediateKaelSafetyPath(
        'Quận 7.',
        'electrical',
        ['smoke_or_burning'],
      )).toBe(true)
      expect(persistentKaelSafetySignals(
        'Quận 7.',
        'electrical',
        ['smoke_or_burning', 'invented_hazard'],
      )).toEqual(['smoke_or_burning'])
      expect(resolveElectricalIntakeRuntime({
        intakeDiagnosisEnabled: true,
        serviceType: 'electrical',
        problemChips: [],
        description: 'Quận 7.',
        priorSafetySignals: ['smoke_or_burning'],
      }).safetySignals).toEqual(['smoke_or_burning'])
      expect(requiresImmediateKaelSafetyPath('Aptomat nhảy liên tục.', 'electrical')).toBe(false)
      expect(requiresImmediateKaelSafetyPath('Ổ cắm đang bốc khói.', 'plumbing')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Kael electrical policy wiring regressions', () => {
  it('preserves legacy and non-electrical fallback behavior for appliance wording', () => {
    expect(buildFallbackIntent(
      'plumbing',
      [],
      'Bình nóng lạnh bị rò nước dưới đáy bình.',
    ).service_type).toBe('plumbing')
    expect(buildFallbackIntent(
      'electrical',
      [],
      'Tivi hỏng và không lên hình.',
      false,
    ).service_type).toBe('electrical')
  })

  it.each([
    'Sờ vào vỏ tủ lạnh thấy tê tê như bị giật nhẹ.',
    'Dây điện máy giặt bị chuột cắn lòi cả lõi đồng ra.',
    'Lắp bình nóng lạnh mới, cần đường điện riêng và CB chống giật.',
    'CB cấp nguồn cho bếp từ cứ nhảy khi bật bếp.',
    'Cầu dao tổng cứ sập dù đã rút tủ lạnh và máy giặt.',
    'Nhiều đèn sáng tối khi máy lạnh hoặc bình nóng lạnh khởi động.',
  ])('keeps an external electrical fault inside the electrical boundary: %s', (text) => {
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toEqual({ ok: true })
  })

  it.each([
    'Lắp bình nóng lạnh mới tại vị trí đã có đường điện.',
    'Bình nóng lạnh bị rò nước nhỏ giọt dưới đáy bình.',
    'Bình nóng lạnh có vấn đề nhưng chưa rõ là phần nước hay phần điện.',
  ])('leaves an ambiguous flagged electrical heater case to the structured model: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toEqual({ ok: true })
  })

  it('keeps a valid switch repair after a negated appliance mention', () => {
    expect(evaluateMessageBoundary(
      'Tủ lạnh không hỏng; chỉ công tắc bị lỏng.',
      'electrical',
      { electricalPlaybookEnabled: true },
    )).toEqual({ ok: true })
  })

  it('routes the exact natural-language corpus TV mounting phrase to handyman', () => {
    const text = 'Nhờ thợ qua khoan tường treo cái tivi 55 inch.'

    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'handyman',
      reasonCode: 'pure_mounting_handyman',
    })
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toMatchObject({ ok: false, reason: 'service_mismatch', suggestedService: 'handyman' })
  })

  it.each([
    'Sờ vào vỏ tủ lạnh thấy tê tê như bị giật nhẹ.',
    'Dây điện máy giặt bị chuột cắn lòi cả lõi đồng ra.',
  ])('keeps an external electrical fault in fallback intent: %s', (text) => {
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'electrical',
      problem_slug: 'other_electrical',
    })
  })

  it('still rejects a washing-machine internal error in fallback intent', () => {
    expect(buildFallbackIntent('electrical', [], 'Máy giặt báo lỗi E03 và không vắt.', true)).toMatchObject({
      service_type: 'unsupported',
      problem_slug: 'unsupported',
    })
  })

  it('does not let an explicitly normal outlet mask a broken television', () => {
    const text = 'TV hỏng hoàn toàn nhưng ổ điện vẫn hoạt động bình thường.'

    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toEqual({
      scopeSignal: 'out_of_scope',
      suggestedService: null,
      reasonCode: 'unsupported_internal_appliance_fault',
    })
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'unsupported',
    })
  })

  it.each([
    'Bếp từ không nóng.',
    'TV không lên hình.',
    'The induction cooktop is not heating.',
    'The TV does not show a picture.',
    'The washing machine is not working.',
    'The refrigerator does not work.',
    "The microwave doesn't turn on.",
  ])('preserves a bare internal-appliance fault through negation normalization: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toMatchObject({
      scopeSignal: 'out_of_scope',
      reasonCode: 'unsupported_internal_appliance_fault',
    })
  })

  it('routes a natural English HVAC contraction to the HVAC service', () => {
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text: "The air conditioner isn't cooling.",
    })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'hvac',
      reasonCode: 'hvac_device_fault',
    })
  })

  it.each([
    'Máy lạnh bị hỏng phần máy.',
    'Máy lạnh bị hỏng.',
    'The air conditioner is broken.',
    'HVAC unit is broken.',
  ])('routes a canonical HVAC device fault to the HVAC service: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'hvac',
      reasonCode: 'hvac_device_fault',
    })
  })

  it.each([
    'The washing machine shows error E03.',
    'The refrigerator is broken.',
    'The microwave has an internal fault.',
  ])('hard-declines a high-precision English internal-appliance fault only when flagged: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toMatchObject({
      scopeSignal: 'out_of_scope',
      reasonCode: 'unsupported_internal_appliance_fault',
    })
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
      language: 'en',
    })).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(buildFallbackIntent('electrical', [], text, true).service_type).toBe('unsupported')
    expect(buildFallbackIntent('electrical', [], text, false).service_type).toBe('electrical')
  })

  it.each([
    'Bếp từ không nóng và CB cứ nhảy.',
    'The TV shows no picture, but the outlet behind it is sparking.',
  ])('does not let an internal symptom hide a supply-side electrical fault: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
    expect(buildFallbackIntent('electrical', [], text, true).service_type).toBe('electrical')
  })

  it.each([
    'Bếp từ không lên nguồn.',
    'Bình nóng lạnh không lên nguồn.',
    'The induction cooktop has no power.',
    'The water heater has no power.',
  ])('keeps a fixed-appliance supply fault in electrical scope: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
    expect(hasElectricalInfrastructureContext(text)).toBe(true)
  })

  it('routes an English water-side heater leak to plumbing', () => {
    const text = 'The water heater is leaking; the electrical side still works normally.'

    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'plumbing',
      reasonCode: 'water_only_heater_leak',
    })
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toMatchObject({ ok: false, reason: 'service_mismatch', suggestedService: 'plumbing' })
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'plumbing',
      scope_signal: 'service_mismatch',
    })
  })

  it('routes an explicit heater water-valve leak to plumbing without inventing an electrical hazard', () => {
    const text = 'Bình nóng lạnh bị hỏng van nước và rò nước, phần điện vẫn bình thường.'

    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'plumbing',
      reasonCode: 'water_only_heater_leak',
    })
    expect(scanIntakeSafetySignals('electrical', text)).not.toContain('water_near_power')
  })

  it.each([
    'Bình nóng lạnh rò nước, phần điện vẫn nóng.',
    'Bình nóng lạnh rò nước, phần điện nóng bất thường.',
    'Bình nóng lạnh chỉ bị rò nước thôi, phần điện không hoạt động bình thường.',
    'The water heater is leaking and its electrical side is overheating.',
    'The water heater only has a water leak, but its electrical side is not working normally.',
    'Bình nóng lạnh phần điện vẫn bình thường nhưng máy giặt bị rò nước.',
    'The water heater electrical side works normally but the washing machine is leaking.',
  ])('does not infer a normal heater electrical side from heat or negated-operation wording: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
  })

  it('accepts explicitly normal heater operation when routing a water-only leak', () => {
    expect(applyHardRoutingPolicy({
      selectedService: 'electrical',
      text: 'Bình nóng lạnh rò nước, phần điện vẫn nóng bình thường.',
    })).toEqual({
      scopeSignal: 'service_mismatch',
      suggestedService: 'plumbing',
      reasonCode: 'water_only_heater_leak',
    })
  })

  it.each([
    'Máy lạnh ở trong phòng nhưng bồn rửa đang rò nước.',
    'There is an air conditioner in the room but the sink is leaking.',
    'Máy lạnh ở trong phòng và bồn rửa đang rò nước.',
    'There is an air conditioner in the room and the sink is leaking.',
  ])('does not bind an unrelated plumbing leak to an HVAC device mention: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
  })

  it('leaves a generic heater electrical-side fault to the structured model', () => {
    const text = 'Bình nóng lạnh bị hỏng phần điện.'

    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toEqual({ ok: true })
  })

  it.each([
    'The water heater is leaking and the breaker keeps tripping.',
    'The water heater is leaking and has no power.',
  ])('keeps a heater leak with an electrical supply fault in electrical scope: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
  })

  it.each([
    'The air conditioner is leaking.',
    'The air conditioner is not cooling.',
    'The HVAC unit is making a loud noise.',
  ])('routes an English internal HVAC fault to HVAC: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toMatchObject({
      scopeSignal: 'service_mismatch',
      suggestedService: 'hvac',
      reasonCode: 'hvac_device_fault',
    })
  })

  it.each([
    'The air conditioner is not cooling and the breaker keeps tripping.',
    'The HVAC unit is leaking and the supply wire is damaged.',
  ])('keeps an HVAC symptom with a supply-side fault in electrical scope: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toBeNull()
  })

  it.each([
    'The air conditioner is not cooling, but the nearby outlet works normally.',
    'Máy lạnh không mát nhưng ổ cắm bên cạnh vẫn bình thường.',
  ])('does not let a normal nearby outlet suppress the HVAC mismatch: %s', (text) => {
    expect(applyHardRoutingPolicy({ selectedService: 'electrical', text })).toMatchObject({
      scopeSignal: 'service_mismatch',
      suggestedService: 'hvac',
    })
  })

  it('does not let normal nearby wiring mask an internal washing-machine error', () => {
    const text = 'Máy giặt lỗi E03 và dây điện bên cạnh vẫn bình thường.'

    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'unsupported',
    })
  })

  it('keeps a negated appliance fault and affirmative outlet fault in electrical scope', () => {
    const text = 'Không phải TV hỏng mà ổ cắm phía sau bị cháy.'

    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toEqual({ ok: true })
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'electrical',
    })
  })

  it.each([
    ['Máy giặt bốc khói từ bên trong lồng máy.'],
    ['Tủ lạnh tóe lửa từ bo mạch bên trong.'],
    ['Bếp từ báo lỗi E5 và không nóng.'],
    ['Bình nóng lạnh bị hỏng bo mạch điều khiển.'],
  ])('keeps an internal appliance hazard out of scope while retaining safety handling: %s', (text) => {
    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: true,
    })).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
      service_type: 'unsupported',
    })
  })

  it('does not broaden the default fallback merely because the environment flag is on', () => {
    vi.stubGlobal('Deno', { env: { get: () => 'true' } })
    try {
      const text = 'Dây điện máy giặt bị chuột cắn lòi cả lõi đồng ra.'

      expect(buildFallbackIntent('electrical', [], text)).toMatchObject({
        service_type: 'unsupported',
      })
      expect(buildFallbackIntent('electrical', [], text, true)).toMatchObject({
        service_type: 'electrical',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('restores legacy boundary and fallback behavior when the playbook flag is off', () => {
    const text = 'Dây điện máy giặt bị chuột cắn lòi cả lõi đồng ra.'

    expect(evaluateMessageBoundary(text, 'electrical', {
      electricalPlaybookEnabled: false,
    })).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(buildFallbackIntent('electrical', [], text, false)).toMatchObject({
      service_type: 'unsupported',
    })
  })

  it('places deterministic safety guidance before a hard-route decline', () => {
    const result = evaluateMessageBoundary(
      'Bình nóng lạnh rò nước vào hộp đấu điện, phần điện vẫn hoạt động bình thường.',
      'electrical',
      { electricalPlaybookEnabled: true },
    )

    expect(result).toMatchObject({
      ok: false,
      reason: 'service_mismatch',
      suggestedService: 'plumbing',
      policyReasonCode: 'water_only_heater_leak',
      safetySignals: expect.arrayContaining(['water_near_power']),
    })
    if (!result.ok) {
      expect(result.declineText).toContain('ngắt aptomat tổng')
      expect(result.declineText.indexOf('ngắt aptomat tổng')).toBeLessThan(
        result.declineText.indexOf('dịch vụ'),
      )
    }
  })
})
