import { describe, expect, it } from 'vitest'

import { SERVICE_TYPES } from '../constants'
import {
  LAUNCH_SERVICE_LINE_IDS,
  buildServiceScopeCard,
  runKaelAgenticPerformanceStep,
  type ServiceIntakeState,
} from '../service-intake'

describe('Kael service scope intake', () => {
  it('keeps production service types unchanged while exposing four scope playbooks', () => {
    expect(SERVICE_TYPES).toEqual(['electrical', 'plumbing', 'cleaning'])
    expect(LAUNCH_SERVICE_LINE_IDS).toEqual([
      'home_cleaning',
      'hvac_basic_maintenance',
      'upholstery_care',
      'handyman_minor_installation',
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
    expect(buildServiceScopeCard(state).canCreateProductionJob).toBe(false)
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
})
