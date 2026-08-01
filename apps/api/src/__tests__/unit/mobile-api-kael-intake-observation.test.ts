import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { serializeKaelTurn } from '../../../../../supabase/functions/mobile-api/_shared/services/_shared'
import { intakeEvalObservationSchema, type SupabaseLike } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { runKaelPipeline } from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline'
import {
  buildClarificationExplanationQuestion,
  buildFocusedClarificationQuestion,
  isClarificationExplanationRequest,
  isGroundedClarificationAnswer,
  isUnknownClarificationAnswer,
  resolveIntakeFactCoverage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/intake-runtime'
import { isSingleFocusedClarificationQuestion } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { ELECTRICAL_PLAYBOOK_SEGMENT, ELECTRICAL_PLAYBOOK_VERSION } from '../../../../../supabase/functions/mobile-api/_shared/kael/playbooks/electrical'
import { buildIntakeDiagnosisMessages } from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts'

const validObservation = {
  scopeSignal: 'in_scope',
  suggestedService: null,
  problemSlug: 'breaker_trip',
  needsClarification: false,
  safetySignals: ['protective_device'],
  modelId: 'deepseek-chat',
  promptVersion: '2026-07-16.v2',
  playbookVersion: 'electrical-playbook-2026-07-16.v2',
} as const

function emptySupabase(): SupabaseLike {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected)
    },
  }
  return { from: () => query }
}

function stubElectricalIntake(intent: Record<string, unknown>) {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
    },
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(intent) } }],
    usage: { prompt_tokens: 50, completion_tokens: 20 },
  }))))
}

describe('Kael intake eval observation boundary', () => {
  it('explains a pending profile slot without treating the request as its answer', () => {
    expect(isClarificationExplanationRequest('Nghĩa là sao? Giải thích đi.')).toBe(true)
    expect(isClarificationExplanationRequest('Là như nào?')).toBe(true)
    expect(isGroundedClarificationAnswer('Nghĩa là sao? Giải thích đi.')).toBe(false)
    expect(isGroundedClarificationAnswer('Tôi cũng chưa rõ')).toBe(false)
    expect(isUnknownClarificationAnswer('Tôi cũng chưa rõ')).toBe(true)
    expect(isUnknownClarificationAnswer('Aptomat vẫn đang bật.')).toBe(false)
    expect(isGroundedClarificationAnswer('Chỉ có một hạng mục: khoan một vị trí.')).toBe(true)

    const question = buildClarificationExplanationQuestion(
      'task_types_and_total_count',
      'vi',
    )
    expect(question).toContain('ước lượng')
    expect(question).not.toBe('Có bao nhiêu hạng mục cần được xử lý?')
    expect(isSingleFocusedClarificationQuestion(question)).toBe(true)
  })

  it('does not invent mandatory quote-driver questions when provider inference falls back', async () => {
    const result = await runKaelPipeline({
      serviceType: 'handyman',
      problemChips: ['Khoan/lắp kệ'],
      description: 'Tôi chỉ cần khoan một vị trí.',
      district: 'Thủ Đức',
      intakeDiagnosisEnabled: true,
      priorProfileFacts: {
        task_types_and_total_count: 'Một hạng mục, một vị trí khoan',
      },
      language: 'vi',
    }, emptySupabase(), {})

    expect(result).toMatchObject({
      success: false,
      code: 'NO_BASELINE',
    })
    expect(result).not.toHaveProperty('clarification')
  })

  it('does not reuse a provider question for a profile slot already answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        service_type: 'handyman',
        problem_slug: 'drill_or_mount_shelf',
        confidence: 0.86,
        needs_clarification: true,
        missing_slots: ['item_dimensions_weight_and_quantity'],
        profile_facts: {},
        safety_signals: [],
        clarification_question: 'Có bao nhiêu hạng mục cần được xử lý?',
        scope_signal: 'in_scope',
      }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    }))))
    try {
      const result = await runKaelPipeline({
        serviceType: 'handyman',
        problemChips: ['Khoan/lắp kệ'],
        description: 'Chỉ có một hạng mục, khoan một vị trí.',
        district: 'Thủ Đức',
        intakeDiagnosisEnabled: true,
        priorProfileFacts: {
          task_types_and_total_count: 'Một hạng mục, một vị trí khoan',
        },
        language: 'vi',
      }, emptySupabase(), { deepseekApiKey: 'deepseek-test' })

      expect(result).toMatchObject({
        success: false,
        code: 'NEEDS_CLARIFICATION',
        clarification: {
          missingSlots: ['item_dimensions_weight_and_quantity'],
        },
      })
      expect(!result.success && result.clarification?.question)
        .toBe('Vật cần treo có kích thước, trọng lượng ước chừng bao nhiêu?')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([
    ['affected_area_and_power_state', 'vi', 'Tình trạng cấp điện hiện tại tại khu vực bị ảnh hưởng là gì?'],
    ['affected_area_and_power_state', 'en', 'What is the current power state in the affected area?'],
    ['symptom_and_duration', 'vi', 'Bạn đang thấy dấu hiệu gì, bắt đầu từ khi nào?'],
    ['symptom_and_duration', 'en', 'What symptom appeared, starting when?'],
    ['access_and_concealed_wiring', 'vi', 'Đường dây cần xử lý đang đi nổi hay âm tường, có dễ tiếp cận không?'],
    ['access_and_concealed_wiring', 'en', 'How accessible is the exposed or concealed wiring route?'],
    ['parts_or_new_device_requirement', 'vi', 'Thiết bị hoặc vật tư cần lắp đã có sẵn chưa?'],
    ['parts_or_new_device_requirement', 'en', 'Is the required device or part already available?'],
    ['breaker_state', 'vi', 'Aptomat hiện đang bật/tắt/đã nhảy, hay đã nhảy lại sau lần bật lại trước đó?'],
    ['breaker_state', 'en', 'Is the breaker currently on/off/tripped, or did it re-trip after a reset already attempted?'],
    ['safety_water_proximity', 'vi', 'Khu vực công tắc có đang ẩm ướt hoặc gần nguồn nước không?'],
    ['safety_water_proximity', 'en', 'Is the switch area wet or near a water source?'],
    ['safety_spark_marks', 'vi', 'Ổ cắm có vết cháy hoặc tia lửa lặp lại không?'],
    ['safety_spark_marks', 'en', 'Are there scorch marks or repeated sparks at the outlet?'],
  ] as const)('asks the composite minimum slot directly: %s/%s', (slot, language, expected) => {
    const question = buildFocusedClarificationQuestion(slot, language)

    expect(question).toBe(expected)
    expect(isSingleFocusedClarificationQuestion(question)).toBe(true)
  })

  it('retains a safety branch question while ignoring optional access and parts slots', () => {
    const coverage = resolveIntakeFactCoverage({
      serviceType: 'electrical',
      problemSlug: 'outlet_or_switch_broken',
      profileFacts: {
        affected_area_and_power_state: 'công tắc nhà tắm không lên',
        device_or_circuit_type: 'công tắc đèn',
        symptom_and_duration: 'bấm nhiều lần nhưng đèn không sáng',
      },
      providerMissingSlots: [
        'safety_water_proximity',
        'access_and_concealed_wiring',
        'parts_or_new_device_requirement',
      ],
      providerNeedsClarification: true,
      electricalPlaybookEnabled: true,
    })

    expect(coverage.missing).toEqual(['safety_water_proximity'])
    expect(coverage.needsClarification).toBe(true)
  })

  it('persists a grounded breaker answer and does not repeat a stale provider request', () => {
    const coverage = resolveIntakeFactCoverage({
      serviceType: 'electrical',
      problemSlug: 'power_outage_one_room',
      profileFacts: {
        affected_area_and_power_state: 'một phòng ngủ mất điện',
        device_or_circuit_type: 'mạch điện phòng ngủ',
        breaker_state: 'aptomat nhánh hiện vẫn bật và chưa nhảy',
      },
      providerMissingSlots: ['breaker_state'],
      providerNeedsClarification: true,
      electricalPlaybookEnabled: true,
    })

    expect(coverage.facts.breaker_state).toBe('aptomat nhánh hiện vẫn bật và chưa nhảy')
    expect(coverage.missing).toEqual([])
    expect(coverage.needsClarification).toBe(false)
  })

  it('does not turn every plumbing quote driver into a mandatory intake question', () => {
    const coverage = resolveIntakeFactCoverage({
      serviceType: 'plumbing',
      problemSlug: 'fixture_leak',
      profileFacts: {
        fixture_pipe_or_drain_type: 'khớp ống mềm dưới lavabo',
        leak_or_blockage_severity: 'chỉ rò khi mở vòi',
        water_isolation_availability: 'van khóa vẫn hoạt động',
      },
      providerMissingSlots: [],
      providerNeedsClarification: false,
      electricalPlaybookEnabled: false,
    })

    expect(coverage.facts).toMatchObject({
      fixture_pipe_or_drain_type: 'khớp ống mềm dưới lavabo',
      leak_or_blockage_severity: 'chỉ rò khi mở vòi',
      water_isolation_availability: 'van khóa vẫn hoạt động',
    })
    expect(coverage.missing).toEqual([])
    expect(coverage.needsClarification).toBe(false)
  })

  it('asks only the provider-selected plumbing clarification instead of every unfilled driver', () => {
    const coverage = resolveIntakeFactCoverage({
      serviceType: 'plumbing',
      problemSlug: 'fixture_leak',
      profileFacts: {
        fixture_pipe_or_drain_type: 'khớp ống mềm dưới lavabo',
      },
      providerMissingSlots: ['leak_or_blockage_severity'],
      providerNeedsClarification: true,
      electricalPlaybookEnabled: false,
    })

    expect(coverage.missing).toEqual(['leak_or_blockage_severity'])
    expect(coverage.needsClarification).toBe(true)
  })

  it('does not turn a slotless provider clarification into a generic repeat question', () => {
    const coverage = resolveIntakeFactCoverage({
      serviceType: 'hvac',
      problemSlug: 'no_cooling',
      profileFacts: {
        service_scope: 'Kiểm tra nguyên nhân máy không mát và vệ sinh khi phù hợp.',
      },
      providerMissingSlots: [],
      providerNeedsClarification: true,
      electricalPlaybookEnabled: false,
    })

    expect(coverage.missing).toEqual([])
    expect(coverage.needsClarification).toBe(false)
  })

  it('tells the enabled intake model how to persist breaker state without changing the legacy schema', () => {
    vi.stubGlobal('Deno', {
      env: { get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined },
    })
    try {
      const enabledSystem = buildIntakeDiagnosisMessages(
        'electrical',
        ['Mất điện một phòng'],
        'Phòng ngủ bị mất điện.',
      )[0]?.content ?? ''
      expect(enabledSystem).toContain('exact_quote_driver_key_or_breaker_state')
      expect(enabledSystem).toContain('plus breaker_state when explicitly grounded')
      expect(enabledSystem).toContain('safety_water_proximity and safety_spark_marks are missing-slot branch markers')
      expect(enabledSystem).toContain('a minimum slot for the selected electrical slug is missing')
      expect(enabledSystem).not.toContain('description is too vague/empty')
    } finally {
      vi.unstubAllGlobals()
    }

    const legacySystem = buildIntakeDiagnosisMessages(
      'electrical',
      ['Mất điện một phòng'],
      'Phòng ngủ bị mất điện.',
    )[0]?.content ?? ''
    expect(legacySystem).toContain('"exact_quote_driver_key": "short fact grounded in the conversation"')
    expect(legacySystem).toContain('description is too vague/empty')
    expect(legacySystem).not.toContain('exact_quote_driver_key_or_breaker_state')
  })

  it('accepts only a coherent sanitized observation', () => {
    expect(intakeEvalObservationSchema.parse(validObservation)).toEqual(validObservation)

    expect(intakeEvalObservationSchema.safeParse({
      ...validObservation,
      customerText: 'raw customer detail',
    }).success).toBe(false)
    expect(intakeEvalObservationSchema.safeParse({
      ...validObservation,
      scopeSignal: 'service_mismatch',
      suggestedService: null,
      problemSlug: null,
    }).success).toBe(false)
    expect(intakeEvalObservationSchema.safeParse({
      ...validObservation,
      safetySignals: ['invented_signal'],
    }).success).toBe(false)
  })

  it('serializes a direct snake-case whitelist without nested metadata leakage', () => {
    const invalidRow = {
      id: 'turn-1',
      session_id: 'session-1',
      turn_index: 2,
      role: 'kael',
      content_type: 'estimate',
      text_content: 'safe customer copy',
      media_refs: [],
      safe_metadata: {
        intake_observation: {
          ...validObservation,
          customerEmail: 'must-not-leak@example.com',
        },
      },
      created_at: '2026-07-16T00:00:00.000Z',
    }

    expect(serializeKaelTurn(invalidRow)).not.toHaveProperty('intake_observation')

    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      expect(serializeKaelTurn(invalidRow).intake_observation).toBeNull()

      const validTurn = serializeKaelTurn({
        ...invalidRow,
        id: 'turn-2',
        turn_index: 3,
        safe_metadata: { intake_observation: validObservation },
        created_at: '2026-07-16T00:00:01.000Z',
      })

      expect(validTurn.intake_observation).toEqual({
        scope_signal: 'in_scope',
        suggested_service: null,
        problem_slug: 'breaker_trip',
        needs_clarification: false,
        safety_signals: ['protective_device'],
        model_id: 'deepseek-chat',
        prompt_version: '2026-07-16.v2',
        playbook_version: 'electrical-playbook-2026-07-16.v2',
      })
      expect(JSON.stringify(validTurn.intake_observation)).not.toContain('customer')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns a structured deterministic observation before provider or database work', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    const supabase = {
      from: vi.fn(() => {
        throw new Error('database must not run for a hard route')
      }),
    } as unknown as SupabaseLike
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: [],
        description: 'Cần lắp trạm sạc ô tô điện dưới hầm xe.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, supabase, {})

      expect(result).toMatchObject({
        success: false,
        code: 'UNSUPPORTED',
        stageLogs: [],
        intakeObservation: {
          scopeSignal: 'out_of_scope',
          suggestedService: null,
          problemSlug: null,
          needsClarification: false,
          modelId: 'deterministic',
          promptVersion: '2026-07-16.v2',
          playbookVersion: 'electrical-playbook-2026-07-16.v2',
        },
      })
      expect(supabase.from).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('lets the emergency AI kill-switch override a deterministic hard route', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => [
          'KAEL_PLAYBOOK_ELECTRICAL_ENABLED',
          'KAEL_AI_KILL_SWITCH',
        ].includes(key) ? 'true' : undefined,
      },
    })
    const supabase = {
      from: vi.fn(() => {
        throw new Error('database must not run while Kael is disabled')
      }),
    } as unknown as SupabaseLike
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: [],
        description: 'Cần lắp trạm sạc ô tô điện dưới hầm xe.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, supabase, {})

      expect(result).toMatchObject({
        success: false,
        code: 'AI_DISABLED',
        stageLogs: [],
      })
      expect(result.intakeObservation).toBeUndefined()
      expect(supabase.from).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not emit the additive observation contract when the playbook flag is off', async () => {
    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách bị chập chờn.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), {})

      expect(result.intakeObservation).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('emits a legacy baseline observation only when eval exposure is on', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED'
          ? 'true'
          : undefined,
      },
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách bị chập chờn.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), {})

      expect(result.intakeObservation).toMatchObject({
        scopeSignal: 'in_scope',
        safetySignals: [],
        promptVersion: '2026-07-16.v2-base-safety',
        playbookVersion: null,
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('attributes a provider failure to the deterministic fallback, not the failed model', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('provider unavailable')
    }))
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách bị chập chờn.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        intakeObservation: { modelId: 'deterministic-fallback' },
      })
      expect(result.stageLogs.find((stage) => stage.stage === 'intent')?.trace?.prompt_version)
        .toBe('2026-07-16.v2')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps an outlet supply fault in scope on production-style provider failure', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('provider unavailable')
    }))
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Ổ cắm'],
        description: 'Ổ cắm cấp điện cho máy giặt bị mất điện.',
        district: 'q7',
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({ success: false, code: 'NO_BASELINE' })
      expect(result.intakeObservation).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps deterministic safety guidance on a production-style fallback failure', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('provider unavailable')
    }))
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Dây điện'],
        description: 'Dây nguồn tủ lạnh bị chuột cắn lòi lõi đồng.',
        district: 'q7',
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({ success: false, code: 'NO_BASELINE' })
      if (result.success) throw new Error('provider failure must not return an estimate')
      expect(result.error).toMatch(/^Anh\/chị chỉ ngắt aptomat tổng/)
      expect(result.error).toContain('Không chạm, rút phích, lau dọn hoặc lại gần')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps deterministic safety guidance when the production intent model declines', async () => {
    stubElectricalIntake({
      service_type: 'unsupported',
      problem_slug: 'unsupported',
      confidence: 0.9,
      needs_clarification: false,
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Dây điện'],
        description: 'Dây nguồn tủ lạnh bị chuột cắn lòi lõi đồng.',
        district: 'q7',
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({ success: false, code: 'UNSUPPORTED' })
      if (result.success) throw new Error('unsupported intent must return a failure')
      expect(result.error).toMatch(/^Anh\/chị chỉ ngắt aptomat tổng/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('applies a hard route when the decisive evidence is in a selected chip', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Lắp trạm sạc ô tô điện'],
        description: 'Cần khảo sát vị trí trong hầm xe.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), {})

      expect(result).toMatchObject({
        success: false,
        code: 'UNSUPPORTED',
        intakeObservation: { modelId: 'deterministic' },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('runs hard routing on the production-style pipeline without exposing an eval observation', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    const supabase = {
      from: vi.fn(() => {
        throw new Error('database must not run for a production hard route')
      }),
    } as unknown as SupabaseLike
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Ổ cắm'],
        description: 'Máy lạnh bị hỏng cần sửa.',
        district: 'q7',
      }, supabase, {})

      expect(result).toMatchObject({
        success: false,
        code: 'SERVICE_MISMATCH',
        suggestedService: 'hvac',
        policyReasonCode: 'hvac_device_fault',
      })
      expect(result.intakeObservation).toBeUndefined()
      expect(supabase.from).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps deterministic safety first on a production-style hard-route response', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => key === 'KAEL_PLAYBOOK_ELECTRICAL_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Lắp trạm sạc ô tô điện'],
        description: 'Nước đang chảy vào ổ cắm gần đó.',
        district: 'q7',
      }, emptySupabase(), {})

      expect(result).toMatchObject({
        success: false,
        code: 'UNSUPPORTED',
        policyReasonCode: 'unsupported_ev_charger',
      })
      if (result.success) throw new Error('hard route must return a failure result')
      expect(result.error).toMatch(/^Anh\/chị chỉ ngắt aptomat tổng/)
      expect(result.error).toContain('Không chạm, rút phích, lau dọn hoặc lại gần')
      expect(result.intakeObservation).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('retains selected-service safety signals when the model suggests another service', async () => {
    stubElectricalIntake({
      service_type: 'plumbing',
      problem_slug: 'pipe_leak',
      confidence: 0.88,
      needs_clarification: false,
      missing_slots: [],
      profile_facts: {},
      safety_signals: [],
      clarification_question: null,
      scope_signal: 'service_mismatch',
      suggested_service: 'plumbing',
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: [],
        description: 'Nước đang chảy vào ổ cắm nhưng nguyên nhân là đường ống.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'SERVICE_MISMATCH',
        suggestedService: 'plumbing',
        intakeObservation: {
          safetySignals: expect.arrayContaining(['water_near_power']),
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('repairs a cross-service in-scope provider tuple into a coherent safety-first mismatch', async () => {
    stubElectricalIntake({
      service_type: 'plumbing',
      problem_slug: 'pipe_leak',
      confidence: 0.9,
      needs_clarification: false,
      missing_slots: [],
      profile_facts: {},
      safety_signals: [],
      clarification_question: null,
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: [],
        description: 'Nước đang chảy vào ổ cắm nhưng nguyên nhân có thể là đường ống.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'SERVICE_MISMATCH',
        suggestedService: 'plumbing',
        intakeObservation: {
          scopeSignal: 'service_mismatch',
          suggestedService: 'plumbing',
          safetySignals: expect.arrayContaining(['water_near_power']),
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('repairs a mismatch without a valid target to out-of-scope while retaining safety', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'outlet_or_switch_broken',
      confidence: 0.75,
      needs_clarification: false,
      missing_slots: [],
      profile_facts: {},
      safety_signals: [],
      clarification_question: null,
      scope_signal: 'service_mismatch',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: [],
        description: 'Ổ cắm đang bốc khói.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'UNSUPPORTED',
        intakeObservation: {
          scopeSignal: 'out_of_scope',
          suggestedService: null,
          safetySignals: expect.arrayContaining(['smoke_or_burning']),
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('wires validated observation persistence and minimum-slot quote readiness', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      '../../supabase/functions/mobile-api/_shared/services/kael-chat-core.ts',
    ), 'utf8')

    expect(source).toContain('intakeEvalObservationSchema.parse(observation)')
    expect(source).toContain('...intakeObservationMetadata(pipeline.intakeObservation)')
    expect(source).toContain('resolveIntakeFactCoverage({')
    expect(source).toContain('electricalPlaybookEnabled,')
    const runner = readFileSync(resolve(
      process.cwd(),
      'scripts/kael-playbook-eval.mjs',
    ), 'utf8')
    expect(runner).toContain("'supabase/functions/mobile-api/_shared/services/_shared.ts'")
    expect(runner).toContain("'supabase/functions/mobile-api/_shared/services/kael-chat-intake-safety.ts'")
    expect(runner).toContain("'supabase/functions/mobile-api/_shared/kael/performance-profiles.ts'")
  })

  it('keeps the injected playbook byte-aligned with Appendix A and free of old unsafe advice', () => {
    const textbook = readFileSync(resolve(
      process.cwd(),
      '../../docs/playbooks/services/electrical.md',
    ), 'utf8')
    const appendix = textbook.match(/```text\r?\n(ELECTRICAL DIAGNOSIS PLAYBOOK[\s\S]*?)\r?\n```/)?.[1]

    expect(appendix?.replace(/\r\n/g, '\n')).toBe(ELECTRICAL_PLAYBOOK_SEGMENT)
    expect(ELECTRICAL_PLAYBOOK_VERSION).toBe('electrical-playbook-2026-07-16.v2')
    expect(ELECTRICAL_PLAYBOOK_SEGMENT).not.toContain('Rút phích các thiết bị quanh')
    expect(ELECTRICAL_PLAYBOOK_SEGMENT).not.toContain('ngắt aptomat tổng trước khi lại gần')
    expect(ELECTRICAL_PLAYBOOK_SEGMENT).toContain('Không chạm, rút phích, lau dọn hoặc lại gần')
  })

  it('keeps a bathroom-switch safety branch open after the minimum quote facts are present', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'outlet_or_switch_broken',
      confidence: 0.88,
      needs_clarification: true,
      missing_slots: ['safety_water_proximity'],
      profile_facts: {
        affected_area_and_power_state: 'công tắc đèn nhà tắm không lên',
        device_or_circuit_type: 'công tắc đèn',
        symptom_and_duration: 'bấm nhiều lần nhưng đèn không sáng',
      },
      safety_signals: [],
      clarification_question: 'Khu vực công tắc có đang ẩm ướt hoặc gần nguồn nước không?',
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Công tắc hỏng'],
        description: 'Công tắc đèn nhà tắm bấm hoài không lên.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'NEEDS_CLARIFICATION',
        clarification: {
          missingSlots: ['safety_water_proximity'],
          question: 'Khu vực công tắc có đang ẩm ướt hoặc gần nguồn nước không?',
        },
        intakeObservation: { needsClarification: true },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('requires breaker state before closing a one-room outage intake', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'power_outage_one_room',
      confidence: 0.9,
      needs_clarification: false,
      missing_slots: [],
      profile_facts: {
        affected_area_and_power_state: 'một phòng ngủ mất điện',
        device_or_circuit_type: 'mạch điện phòng ngủ',
      },
      safety_signals: ['protective_device'],
      clarification_question: null,
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Mất điện một phòng'],
        description: 'Một phòng ngủ bị mất điện, các phòng khác vẫn có điện.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'NEEDS_CLARIFICATION',
        clarification: {
          missingSlots: ['breaker_state'],
          question: 'Aptomat hiện đang bật/tắt/đã nhảy, hay đã nhảy lại sau lần bật lại trước đó?',
        },
        intakeObservation: { needsClarification: true },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ignores optional electrical slots when all minimum slots are grounded', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'flickering_light',
      confidence: 0.84,
      needs_clarification: false,
      missing_slots: [
        'access_and_concealed_wiring',
        'parts_or_new_device_requirement',
        'urgency_and_repeat_fault',
      ],
      profile_facts: {
        affected_area_and_power_state: 'một đèn bị ảnh hưởng',
        device_or_circuit_type: 'đèn trần phòng khách',
        symptom_and_duration: 'nhấp nháy dù đã thay bóng',
      },
      safety_signals: [],
      clarification_question: null,
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách nhấp nháy dù đã thay bóng.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'NO_BASELINE',
        intakeObservation: {
          scopeSignal: 'in_scope',
          problemSlug: 'flickering_light',
          needsClarification: false,
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ignores a provider clarification request that names only optional electrical slots', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'flickering_light',
      confidence: 0.84,
      needs_clarification: true,
      missing_slots: [
        'access_and_concealed_wiring',
        'parts_or_new_device_requirement',
        'symptom_and_duration',
      ],
      profile_facts: {
        affected_area_and_power_state: 'một đèn bị ảnh hưởng',
        device_or_circuit_type: 'đèn trần phòng khách',
        symptom_and_duration: 'nhấp nháy dù đã thay bóng',
      },
      safety_signals: [],
      clarification_question: 'Dây điện đang đi âm tường hay nổi?',
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách nhấp nháy dù đã thay bóng.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'NO_BASELINE',
        intakeObservation: { needsClarification: false },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('forces one clarification when a minimum electrical slot is missing', async () => {
    stubElectricalIntake({
      service_type: 'electrical',
      problem_slug: 'flickering_light',
      confidence: 0.84,
      needs_clarification: false,
      missing_slots: [],
      profile_facts: {
        affected_area_and_power_state: 'một đèn bị ảnh hưởng',
        device_or_circuit_type: 'đèn trần phòng khách',
      },
      safety_signals: [],
      clarification_question: null,
      scope_signal: 'in_scope',
      suggested_service: null,
      customer_sentiment: 'neutral',
    })
    try {
      const result = await runKaelPipeline({
        serviceType: 'electrical',
        problemChips: ['Đèn chập chờn'],
        description: 'Một đèn phòng khách có vấn đề.',
        district: 'q7',
        intakeDiagnosisEnabled: true,
      }, emptySupabase(), { deepseekApiKey: 'test-key' })

      expect(result).toMatchObject({
        success: false,
        code: 'NEEDS_CLARIFICATION',
        clarification: {
          missingSlots: ['symptom_and_duration'],
          question: 'Bạn đang thấy dấu hiệu gì, bắt đầu từ khi nào?',
        },
        intakeObservation: {
          scopeSignal: 'in_scope',
          problemSlug: 'flickering_light',
          needsClarification: true,
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
