import { describe, expect, it } from 'vitest'

import { SERVICE_TYPES } from '../constants'
import {
  CUSTOMER_SERVICE_IDS,
  KAEL_PERFORMANCE_PROFILE_IDS,
  LAUNCH_SERVICE_LINE_IDS,
  applyPerformanceAnswer,
  buildServiceScopeCard,
  createInitialPerformanceIntake,
  getServicePerformancePlaybook,
  productionServiceTypeForCustomerService,
  runKaelAgenticPerformanceStep,
  setPerformanceMediaCount,
  type ServiceIntakeState,
} from '../service-intake'

describe('Kael service scope intake', () => {
  it('maps the six customer services to six production service types and profiles', () => {
    expect(SERVICE_TYPES).toEqual([
      'electrical',
      'plumbing',
      'cleaning',
      'hvac',
      'upholstery',
      'handyman',
    ])
    expect(LAUNCH_SERVICE_LINE_IDS).toEqual([
      'home_cleaning',
      'hvac_basic_maintenance',
      'upholstery_care',
      'handyman_minor_installation',
    ])
    expect(CUSTOMER_SERVICE_IDS).toHaveLength(6)
    expect(KAEL_PERFORMANCE_PROFILE_IDS).toEqual([
      'electric_diagnose',
      'water_diagnose',
      'clean_scope',
      'air_scope',
      'fabric_scope',
      'task_scope',
    ])
    expect(CUSTOMER_SERVICE_IDS.map(productionServiceTypeForCustomerService)).toEqual([
      'electrical',
      'plumbing',
      'cleaning',
      'hvac',
      'upholstery',
      'handyman',
    ])
  })

  it('builds a cleaning production handoff after the customer locks scope', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'home_cleaning',
      mediaCount: 2,
      answers: {
        cleaning_type: 'deep',
        property_layout: 'two_bedroom',
        area_sqm: 72,
        bathroom_count: 2,
        condition_level: 'level_3',
        priority_zones: ['kitchen', 'bathroom'],
        addons: ['interior_window_cleaning'],
      },
    }

    const decision = runKaelAgenticPerformanceStep({
      state,
      addressDistrict: 'q7',
      customerAcceptedScope: true,
      photoUrls: ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
    })

    expect(decision.kind).toBe('create_job_handoff')
    if (decision.kind !== 'create_job_handoff') throw new Error('Expected create_job_handoff')
    expect(decision.jobPayload.service_type).toBe('cleaning')
    expect(decision.scopeCard.problemChips).toContain('Tổng vệ sinh')
    expect(decision.jobPayload.description).toContain('Kael CleanScope')
    expect(decision.jobPayload.address_district).toBe('q7')
    expect('scheduled_at' in decision.jobPayload).toBe(false)
    expect('address_building' in decision.jobPayload).toBe(false)
  })

  it('routes HVAC safety signals to human review', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'hvac_basic_maintenance',
      mediaCount: 2,
      answers: {
        hvac_goal: 'weak_cooling',
        unit_count: 1,
        unit_type: 'wall_mounted',
        access_level: 'easy',
        hvac_safety_notes: ['electric_smell'],
      },
    }

    const decision = runKaelAgenticPerformanceStep({ state })
    expect(decision.kind).toBe('needs_human_review')
    expect(buildServiceScopeCard(state).canCreateProductionJob).toBe(true)
  })

  it('requests upholstery photos for stains before showing scope', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'upholstery_care',
      mediaCount: 0,
      answers: {
        fabric_items: ['sofa'],
        fabric_quantity_size: 'Sofa chữ L 3 chỗ',
        fabric_material: 'unknown',
        fabric_issue: ['stain'],
      },
    }

    expect(runKaelAgenticPerformanceStep({ state }).kind).toBe('request_media')
  })

  it('keeps Vietnamese handyman intake copy free of leaked English task labels', () => {
    const playbook = getServicePerformancePlaybook('handyman_minor_installation')
    const visibleVietnameseCopy = [
      playbook.performanceGoalVi,
      ...playbook.questions.flatMap((question) => [question.labelVi, question.helperVi ?? '', question.placeholderVi ?? '']),
      ...playbook.completionChecklistVi,
      ...playbook.mediaRequirement.promptsVi,
    ].join(' ')

    expect(visibleVietnameseCopy).not.toMatch(/\btask(?:s| bundle)?\b/i)
  })

  it('requires actual handoff photo refs instead of trusting a stale media count', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'upholstery_care',
      mediaCount: 1,
      answers: {
        fabric_items: ['sofa'],
        fabric_quantity_size: 'Sofa chữ L 3 chỗ',
        fabric_material: 'unknown',
        fabric_issue: ['stain'],
      },
    }

    const decision = runKaelAgenticPerformanceStep({
      state,
      addressDistrict: 'q7',
      customerAcceptedScope: true,
      photoUrls: [],
    })

    expect(decision.kind).toBe('request_media')
  })

  it('fails closed when the final job handoff violates the canonical create-job boundary', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'home_cleaning',
      mediaCount: 0,
      answers: {
        cleaning_type: 'standard',
        property_layout: 'one_bedroom',
        bathroom_count: 1,
        condition_level: 'level_2',
      },
    }

    expect(runKaelAgenticPerformanceStep({
      state,
      addressDistrict: 'q'.repeat(101),
      customerAcceptedScope: true,
    }).kind).toBe('show_scope_card')
    expect(runKaelAgenticPerformanceStep({
      state,
      addressDistrict: 'q7',
      customerAcceptedScope: true,
      photoUrls: ['not-a-url'],
    }).kind).toBe('show_scope_card')
    expect(runKaelAgenticPerformanceStep({
      state,
      addressDistrict: 'q7',
      customerAcceptedScope: true,
      scheduledAt: 'tomorrow morning',
    }).kind).toBe('show_scope_card')
  })

  it('requires handyman media and then reviews risky drilling', () => {
    const state: ServiceIntakeState = {
      serviceLineId: 'handyman_minor_installation',
      mediaCount: 0,
      answers: {
        task_bundle_type: 'multiple',
        task_types: ['drill_shelf'],
        task_count: 1,
        materials_ready: 'partial',
        wall_surface: 'unknown',
        requires_drilling: 'yes',
        task_risk_flags: ['hidden_wire_pipe'],
      },
    }

    expect(runKaelAgenticPerformanceStep({ state }).kind).toBe('request_media')
    expect(runKaelAgenticPerformanceStep({ state: { ...state, mediaCount: 1 } }).kind).toBe('needs_human_review')
  })

  it('asks one required question at a time', () => {
    const decision = runKaelAgenticPerformanceStep({
      state: {
        serviceLineId: 'home_cleaning',
        mediaCount: 0,
        answers: { cleaning_type: 'standard' },
      },
    })

    expect(decision.kind).toBe('ask_question')
    if (decision.kind !== 'ask_question') throw new Error('Expected ask_question')
    expect(decision.question.id).toBe('property_layout')
  })

  it('fails closed when a malformed media count reaches a media-required service', () => {
    const initial = createInitialPerformanceIntake('handyman_minor_installation')

    expect(setPerformanceMediaCount(initial, Number.NaN).mediaCount).toBe(0)
    expect(setPerformanceMediaCount(initial, Number.POSITIVE_INFINITY).mediaCount).toBe(0)

    const decision = runKaelAgenticPerformanceStep({
      state: {
        serviceLineId: 'handyman_minor_installation',
        mediaCount: Number.NaN,
        answers: {
          task_bundle_type: 'single',
          task_types: ['drill_shelf'],
          task_count: 1,
          materials_ready: 'yes',
          requires_drilling: 'yes',
        },
      },
    })

    expect(decision.kind).toBe('request_media')
  })

  it('rejects unknown, out-of-range, and contradictory answer updates', () => {
    const initial = createInitialPerformanceIntake('home_cleaning')

    expect(() => applyPerformanceAnswer(initial, 'unknown_question', 'value')).toThrow()
    expect(() => applyPerformanceAnswer(initial, 'cleaning_type', 'unsupported')).toThrow()
    expect(() => applyPerformanceAnswer(initial, 'bathroom_count', Number.NaN)).toThrow()
    expect(() => applyPerformanceAnswer(initial, 'bathroom_count', 9)).toThrow()
    expect(() => applyPerformanceAnswer(initial, 'addons', ['none', 'fridge_interior'])).toThrow()
  })

  it('rejects fractional item counts and oversized free-text answers', () => {
    expect(() => applyPerformanceAnswer(
      createInitialPerformanceIntake('home_cleaning'),
      'bathroom_count',
      1.5,
    )).toThrow()
    expect(() => applyPerformanceAnswer(
      createInitialPerformanceIntake('hvac_basic_maintenance'),
      'unit_count',
      1.5,
    )).toThrow()
    expect(() => applyPerformanceAnswer(
      createInitialPerformanceIntake('handyman_minor_installation'),
      'task_count',
      2.25,
    )).toThrow()
    expect(() => applyPerformanceAnswer(
      createInitialPerformanceIntake('upholstery_care'),
      'fabric_quantity_size',
      'x'.repeat(201),
    )).toThrow()
  })

  it('treats fractional required counts in restored state as missing', () => {
    const decision = runKaelAgenticPerformanceStep({
      state: {
        serviceLineId: 'home_cleaning',
        mediaCount: 0,
        answers: {
          cleaning_type: 'standard',
          property_layout: 'two_bedroom',
          bathroom_count: 1.5,
          condition_level: 'level_2',
        },
      },
    })

    expect(decision.kind).toBe('ask_question')
    if (decision.kind !== 'ask_question') throw new Error('Expected ask_question')
    expect(decision.question.id).toBe('bathroom_count')
  })

  it('rejects an unknown service-line id at runtime', () => {
    expect(() => createInitialPerformanceIntake(
      'unsupported_service' as ServiceIntakeState['serviceLineId'],
    )).toThrow()
  })

  it('treats malformed required answers as missing instead of advancing the workflow', () => {
    const decision = runKaelAgenticPerformanceStep({
      state: {
        serviceLineId: 'home_cleaning',
        mediaCount: 0,
        answers: {
          cleaning_type: false,
          property_layout: 'two_bedroom',
          bathroom_count: Number.POSITIVE_INFINITY,
          condition_level: 'level_2',
        },
      },
    })

    expect(decision.kind).toBe('ask_question')
    if (decision.kind !== 'ask_question') throw new Error('Expected ask_question')
    expect(decision.question.id).toBe('cleaning_type')
  })
})
