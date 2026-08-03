import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  getKaelPerformanceProfile,
  KAEL_PERFORMANCE_PROFILES,
  listKaelPerformanceProfiles,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/performance-profiles'
import { buildIntakeDiagnosisMessages, kaelIntakeDiagnosisPromptVersion } from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/prompts'
import { intentResultSchema } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

describe('Kael six-service performance profiles', () => {
  it('exposes exactly one complete case-work profile for each launched service', () => {
    expect(listKaelPerformanceProfiles().map((profile) => [profile.service_type, profile.id])).toEqual([
      ['electrical', 'electric_diagnose'],
      ['plumbing', 'water_diagnose'],
      ['cleaning', 'clean_scope'],
      ['hvac', 'air_scope'],
      ['upholstery', 'fabric_scope'],
      ['handyman', 'task_scope'],
    ])

    expect(Object.keys(KAEL_PERFORMANCE_PROFILES)).toHaveLength(6)
    for (const profile of listKaelPerformanceProfiles()) {
      expect(profile.quote_drivers.length).toBeGreaterThan(0)
      expect(profile.safety_capability_gates.length).toBeGreaterThan(0)
      expect(profile.evidence_suggestions.length).toBeGreaterThan(0)
      expect(profile.completion_checklist.length).toBeGreaterThan(0)
      expect(profile.scope_change_triggers.length).toBeGreaterThan(0)
      expect(profile.worker_capabilities.length).toBeGreaterThan(0)
    }

    expect(getKaelPerformanceProfile('hvac')).toMatchObject({
      id: 'air_scope',
      supported_work_modes: ['cleaning', 'diagnosis', 'repair'],
    })
  })

  it('keeps pricing and static questionnaire data out of the profile registry', () => {
    const objectKeys = JSON.stringify(KAEL_PERFORMANCE_PROFILES, (key, value) => {
      if (/^(?:price|amount|cost)(?:_|$)|_(?:price|amount|cost)(?:_|$)/i.test(key)) {
        throw new Error(`pricing key found: ${key}`)
      }
      return value
    })

    expect(objectKeys.length).toBeGreaterThan(0)
    for (const profile of listKaelPerformanceProfiles()) {
      expect(profile).not.toHaveProperty('questions')
      expect(profile).not.toHaveProperty('answers')
      expect(profile).not.toHaveProperty('options')
    }
  })

  it('returns no profile for unsupported or prototype-like service input', () => {
    expect(getKaelPerformanceProfile('unsupported')).toBeNull()
    expect(getKaelPerformanceProfile('__proto__')).toBeNull()
    expect(getKaelPerformanceProfile('constructor')).toBeNull()
  })

  it('exports the registry through the canonical Edge Kael barrel', () => {
    const indexSource = readFileSync(
      resolve(process.cwd(), '../../supabase/functions/mobile-api/_shared/kael/index.ts'),
      'utf8',
    )

    expect(indexSource).toContain('export * from "./learning/performance-profiles.ts";')
  })

  it('feeds each profile quote drivers, safety gates, evidence, and work modes into intake diagnosis', () => {
    const prompt = String(buildIntakeDiagnosisMessages(
      'handyman',
      ['Khoan/lắp kệ'],
      'Tôi cần treo một kệ.',
    )[0]?.content)

    expect(prompt).toContain('task_scope')
    expect(prompt).toContain('task_types_and_total_count')
    expect(prompt).toContain('handyman_structural_or_concealed_service_risk')
    expect(prompt).toContain('safe_drilling_and_mounting')
    expect(prompt).toContain('photo: item, installation point, surface, and available hardware')
  })

  it('accepts profile-specific missing slots while rejecting invented slots', () => {
    const base = {
      service_type: 'hvac',
      problem_slug: 'routine_hvac_cleaning',
      confidence: 0.5,
      needs_clarification: true,
      clarification_question_vi: 'Bạn có bao nhiêu máy và mỗi máy thuộc loại nào?',
    }
    expect(intentResultSchema.safeParse({
      ...base,
      clarification_question_vi: 'Bạn có bao nhiêu máy cần xử lý?',
      missing_slots: ['unit_type_count_and_capacity'],
    }).success).toBe(true)
    expect(intentResultSchema.safeParse({
      ...base,
      missing_slots: ['unit_type_count_and_capacity'],
    }).success).toBe(false)
    expect(intentResultSchema.safeParse({
      ...base,
      missing_slots: ['invented_quote_driver'],
    }).success).toBe(false)
  })

  it('injects minimum electrical slots without requiring every quote driver', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      const prompt = String(buildIntakeDiagnosisMessages(
        'electrical',
        ['Lắp thêm thiết bị'],
        'Cần lắp thêm một ổ cắm.',
      )[0]?.content)

      expect(prompt).toContain('Electrical minimum-slot policy:')
      expect(prompt).toContain('install_device: minimum=[device_or_circuit_type, access_and_concealed_wiring, parts_or_new_device_requirement]')
      expect(prompt).toContain('Only missing minimum slots may block an estimate.')
      expect(prompt).not.toContain('Every selected-profile quote_driver must have a grounded value')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('preserves the non-treatment slot contract while versioning safer base copy', () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    try {
      const prompt = String(buildIntakeDiagnosisMessages(
        'electrical',
        ['Lắp thêm thiết bị'],
        'Cần lắp thêm một ổ cắm.',
      )[0]?.content)

      expect(prompt).not.toContain('Electrical minimum-slot policy:')
      expect(prompt).toContain('Every selected-profile quote_driver must have a grounded value')
      expect(kaelIntakeDiagnosisPromptVersion('electrical')).toBe('2026-07-16.v2-base-safety')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
