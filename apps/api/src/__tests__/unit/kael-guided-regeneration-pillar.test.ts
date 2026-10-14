import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import {
  regenerateOnce,
  regenerationHint,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/guided-regeneration'
import { guardOutput } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/output-gateway'

export const PILLAR = {
  id: 'P384-kael-guided-regeneration',
  invariant:
    'a guard trip on a customer answer costs one guided rewrite, not the whole answer: the model is asked once with the reason, the rewrite must pass the same guard, and only then does the canned text appear; secrets are never retried and a clean answer never triggers a second call',
  authority: [
    'governance/RULES.md #8 (a fallback is still the safe floor when the rewrite also fails)',
    'governance/RULES.md #10 (one bounded extra call, no retry loop)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/guided-regeneration.ts',
  layer: 'unit',
  siblings: ['P383-kael-guard-naturalness', 'P382-kael-turn-telemetry'],
  mutation:
    'make regenerateOnce return null — the rewrite case turns red; call rewrite twice — the single-call assertions turn red; skip the re-guard — the still-failing case returns the bad rewrite and turns red; drop the pii_or_secret exclusion — the secret case turns red',
} as const satisfies PillarManifest

const MIXED = 'Please keep the area dry and book service in the app today.'
const GOOD = 'Bạn giữ khu vực khô ráo và gửi thêm ảnh cho Kael nhé.'

function answer(text: string) {
  return {
    success: true as const,
    content: JSON.stringify({ answer: text, safety_notes: [], citations: [], suggested_actions: [], boundary: 'answered' }),
    latencyMs: 20,
    usage: { costUsd: 0.0001, inputTokens: 10, outputTokens: 12 },
    provider: 'deepseek' as const,
    model: 'deepseek-v4-pro',
  }
}

function ask(callAI: (request: AIRequest) => Promise<ReturnType<typeof answer>>) {
  return runCustomerAssistant({
    callAI,
    language: 'vi',
    message: 'Máy nước nóng nhà mình bị rò nước thì làm sao?',
    secrets: { knowledgeRetrievalEnabled: false },
    surface: 'customer_normal',
  })
}

afterEach(() => {
  KAEL_CIRCUIT_BREAKER.reset()
})

describe(`${PILLAR.id}: one guided rewrite before the canned text`, () => {
  it('replaces a rejected answer with a passing rewrite, asking exactly once', async () => {
    const seen: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      seen.push(request)
      return answer(seen.length === 1 ? MIXED : GOOD)
    })
    const result = await ask(callAI)
    expect(callAI, pillarWhy(PILLAR, 'one rewrite, not a loop')).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ answer: GOOD, fallback_used: false, regenerated: true })
    const retryPrompt = JSON.stringify(seen[1]?.messages.at(-1))
    expect(retryPrompt).toContain('Reviewer note')
    expect(retryPrompt).toContain('natural Vietnamese')
    expect(seen[1]).toMatchObject({ maxRetries: 0 })
  })

  it('falls back to the canned text when the rewrite is rejected too', async () => {
    const callAI = vi.fn(async () => answer(MIXED))
    const result = await ask(callAI)
    expect(callAI).toHaveBeenCalledTimes(2)
    expect(result, pillarWhy(PILLAR, 'the safe floor still holds')).toMatchObject({ fallback_used: true })
    expect(result.answer).not.toContain('Please')
  })

  it('does not call the model again when the first answer passes, loanwords included', async () => {
    const callAI = vi.fn(async () => answer('Bạn gửi thêm ảnh hoặc video chỗ rò qua app để Kael xem giúp nhé.'))
    const result = await ask(callAI)
    expect(callAI).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ fallback_used: false })
    expect(result.regenerated).toBeFalsy()
  })
})

describe(`${PILLAR.id}: reflow before rewrite`, () => {
  it('splits a run-on sentence over the ceiling instead of rewriting or replacing it', async () => {
    const runOn = `Bạn nên ngắt aptomat nhánh nếu có thể, ${Array.from({ length: 40 }, () => 'giữ').join(' ')} và chờ thợ kiểm tra.`
    const callAI = vi.fn(async () => answer(runOn))
    const result = await ask(callAI)
    expect(callAI, pillarWhy(PILLAR, 'reflow is free; a rewrite is not')).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ fallback_used: false })
    expect(result.answer).toContain('. ')
  })
})

describe(`${PILLAR.id}: the helper`, () => {
  const guard = (text: string) => guardOutput({ text, actor: 'customer', language: 'vi', surface: 'test', fallbackText: 'dự phòng' })

  it('never retries a secret or personal number', async () => {
    const rewrite = vi.fn(async () => GOOD)
    const retry = await regenerateOnce({ failure: { reason: 'semantic_guardrail', guardrailLabel: 'pii_or_secret' }, language: 'vi', rewrite, guard })
    expect(retry, pillarWhy(PILLAR, 'a secret is not sent back to a model')).toBeNull()
    expect(rewrite).not.toHaveBeenCalled()
  })

  it('returns the guard result of a passing rewrite and null for a failing one', async () => {
    const pass = await regenerateOnce({ failure: { reason: 'language_mismatch' }, language: 'vi', rewrite: async () => GOOD, guard })
    expect(pass).toMatchObject({ allowed: true, text: GOOD })
    const fail = await regenerateOnce({ failure: { reason: 'language_mismatch' }, language: 'vi', rewrite: async () => MIXED, guard })
    expect(fail).toBeNull()
  })

  it('treats a provider error as no rewrite but lets a cancellation through', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failing = await regenerateOnce({ failure: { reason: 'sentence_too_long' }, language: 'vi', rewrite: async () => { throw new Error('boom') }, guard })
    expect(failing).toBeNull()
    const cancelled = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    await expect(regenerateOnce({ failure: { reason: 'sentence_too_long' }, language: 'vi', rewrite: async () => { throw cancelled }, guard })).rejects.toBe(cancelled)
    warn.mockRestore()
  })

  it('writes a hint for every retryable reason and none for a missing one', () => {
    expect(regenerationHint({}, 'vi')).toBeNull()
    for (const reason of ['empty', 'fear_language', 'absolute_claim', 'ai_self_reference', 'casual_slang', 'buzzword', 'accusatory_in_dispute', 'aggressive_response', 'exact_vnd', 'language_mismatch', 'sentence_too_long', 'semantic_guardrail'] as const) {
      expect(regenerationHint({ reason }, 'vi'), reason).toEqual(expect.any(String))
    }
    expect(regenerationHint({ reason: 'language_mismatch' }, 'en')).toContain('English')
  })
})
