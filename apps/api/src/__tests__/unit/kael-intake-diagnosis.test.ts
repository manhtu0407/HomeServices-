import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIResponse, AIError } from '@home-services/shared'

vi.mock('@/lib/env', () => ({
  env: {
    anthropicApiKey: 'test-key',
    perplexityApiKey: 'test-key',
    deepseekApiKey: 'test-key',
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}))

import { callAI } from '@/lib/ai/client'
import { diagnoseIntake } from '@/lib/kael/intent'

const mockCallAI = callAI as ReturnType<typeof vi.fn>

function mockAISuccess(content: string): AIResponse {
  return {
    content,
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    latencyMs: 200,
    success: true,
  }
}

function mockAIFailure(): AIError {
  return {
    provider: 'deepseek',
    error: 'timeout',
    code: 'TIMEOUT',
    retryable: false,
    success: false,
  }
}

describe('kael intake-diagnosis — diagnoseIntake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a contextual clarification question for vague input', async () => {
    mockCallAI.mockResolvedValue(
      mockAISuccess(
        JSON.stringify({
          service_type: 'electrical',
          problem_slug: 'other_electrical',
          confidence: 0.35,
          needs_clarification: true,
          missing_slots: ['symptom', 'location'],
          clarification_question_vi: 'Cầu dao có tự nhảy lại sau khi bạn bật lên không?',
          scope_signal: 'in_scope',
          suggested_service: null,
          customer_sentiment: 'neutral',
        }),
      ),
    )

    const result = await diagnoseIntake('electrical', [], 'nhà bị hư cái đó rồi')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.needs_clarification).toBe(true)
      expect(result.intent.clarification_question_vi).toContain('Cầu dao')
      // Must be specific, not the banned generic phrasing (STRUCTURES.md A4).
      expect(result.intent.clarification_question_vi ?? '').not.toMatch(/cung cấp thêm thông tin/i)
      expect(result.intent.missing_slots).toEqual(['symptom', 'location'])
    }
  })

  it('skips clarification when context is sufficient', async () => {
    mockCallAI.mockResolvedValue(
      mockAISuccess(
        JSON.stringify({
          service_type: 'plumbing',
          problem_slug: 'pipe_leak',
          confidence: 0.9,
          needs_clarification: false,
          missing_slots: [],
          clarification_question_vi: null,
          scope_signal: 'in_scope',
          suggested_service: null,
          customer_sentiment: 'neutral',
        }),
      ),
    )

    const result = await diagnoseIntake(
      'plumbing',
      ['Ống rò rỉ'],
      'Ống nước dưới bồn rửa bát rò rỉ liên tục từ sáng',
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.needs_clarification).toBe(false)
      expect(result.intent.clarification_question_vi).toBeNull()
    }
  })

  it('accepts legacy AI responses without the new fields (backward compatible)', async () => {
    mockCallAI.mockResolvedValue(
      mockAISuccess(
        JSON.stringify({
          service_type: 'cleaning',
          problem_slug: 'standard_home_cleaning',
          confidence: 0.8,
          needs_clarification: false,
        }),
      ),
    )

    const result = await diagnoseIntake('cleaning', ['Dọn dẹp nhà'], 'Dọn căn hộ 2 phòng ngủ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.service_type).toBe('cleaning')
      expect(result.intent.missing_slots).toBeUndefined()
      expect(result.intent.scope_signal).toBeUndefined()
    }
  })

  it('surfaces scope_signal for service mismatch', async () => {
    mockCallAI.mockResolvedValue(
      mockAISuccess(
        JSON.stringify({
          service_type: 'electrical',
          problem_slug: 'other_electrical',
          confidence: 0.7,
          needs_clarification: false,
          missing_slots: [],
          clarification_question_vi: null,
          scope_signal: 'service_mismatch',
          suggested_service: 'electrical',
          customer_sentiment: 'neutral',
        }),
      ),
    )

    const result = await diagnoseIntake('cleaning', [], 'Ổ cắm trong bếp bị cháy đen')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.scope_signal).toBe('service_mismatch')
      expect(result.intent.suggested_service).toBe('electrical')
    }
  })

  it('passes recent conversation context into the prompt', async () => {
    mockCallAI.mockResolvedValue(
      mockAISuccess(
        JSON.stringify({
          service_type: 'electrical',
          problem_slug: 'breaker_trip',
          confidence: 0.82,
          needs_clarification: false,
          missing_slots: [],
          clarification_question_vi: null,
          scope_signal: 'in_scope',
          suggested_service: null,
          customer_sentiment: 'neutral',
        }),
      ),
    )

    await diagnoseIntake(
      'electrical',
      [],
      'vẫn bị vậy',
      'customer: cầu dao nhà em hay nhảy\nkael: Cầu dao có nhảy lại sau khi bật không?',
    )

    const call = mockCallAI.mock.calls[0]?.[0]
    const serialized = JSON.stringify(call?.messages ?? [])
    expect(serialized).toContain('Recent conversation')
    expect(serialized).toContain('cầu dao nhà em hay nhảy')
  })

  it('falls back deterministically when every provider fails', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await diagnoseIntake('electrical', ['Cầu dao trip'], 'Cầu dao bị trip')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fallback.service_type).toBe('electrical')
      expect(result.fallback.problem_slug).toBe('breaker_trip')
      expect(result.fallback.needs_clarification).toBe(false)
      expect(result.fallback.confidence).toBeLessThan(0.5)
    }
  })

  it('uses the Anthropic fallback provider before the deterministic fallback', async () => {
    mockCallAI
      .mockResolvedValueOnce(mockAIFailure())
      .mockResolvedValueOnce(
        mockAISuccess(
          JSON.stringify({
            service_type: 'plumbing',
            problem_slug: 'pipe_leak',
            confidence: 0.85,
            needs_clarification: false,
            missing_slots: [],
            clarification_question_vi: null,
            scope_signal: 'in_scope',
            suggested_service: null,
            customer_sentiment: 'neutral',
          }),
        ),
      )

    const result = await diagnoseIntake('plumbing', ['Ống rò rỉ'], 'Ống nước rò rỉ')
    expect(result.success).toBe(true)
    expect(mockCallAI).toHaveBeenNthCalledWith(1, expect.objectContaining({ provider: 'deepseek' }))
    expect(mockCallAI).toHaveBeenNthCalledWith(2, expect.objectContaining({ provider: 'anthropic' }))
  })
})
