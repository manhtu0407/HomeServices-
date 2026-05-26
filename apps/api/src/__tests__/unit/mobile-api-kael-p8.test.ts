import { describe, expect, it, vi } from 'vitest'
import {
  buildKaelSystemPrompt,
  getPublicKaelCharter,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/system-prompt'
import {
  checkKaelResponse,
  runKaelSelfCheckPipeline,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/self-check'
import { runKaelPurposeStage } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'
import { createMobileApiHandler, type MobileApiServices } from '../../../../../supabase/functions/mobile-api/_shared/router'

describe('Kael P8 charter, prompt, and self-check', () => {
  it('T8-test-2: builds deterministic system prompt under 3000 tokens', () => {
    const prompt = buildKaelSystemPrompt({
      purpose: 'scope_change',
      actor: 'worker',
      contextSummary: 'Worker reports reasonable added scope with evidence photos.',
    })

    expect(prompt).toContain('Kael Identity')
    expect(prompt).toContain('Permission summary')
    expect(prompt).toContain('scope_change')
    expect(prompt.split(/\s+/).length).toBeLessThan(3000)
    expect(buildKaelSystemPrompt({
      purpose: 'scope_change',
      actor: 'worker',
      contextSummary: 'Worker reports reasonable added scope with evidence photos.',
    })).toBe(prompt)
  })

  it('T8-test-3: looks up tone guidance by purpose and actor', () => {
    const prompt = buildKaelSystemPrompt({
      purpose: 'worker_brief',
      actor: 'worker',
      contextSummary: 'Accepted plumbing job.',
    })

    expect(prompt).toContain('actor=worker')
    expect(prompt).toContain('one to three bullets')
  })

  it('T8-test-4/5/6/7/8/10: self-check catches forbidden output and passes valid VI copy', () => {
    expect(checkKaelResponse({ text: 'nguy hiem chet nguoi', actor: 'customer' }).allowed).toBe(false)
    expect(checkKaelResponse({ text: 'As an AI, I cannot help', actor: 'customer' }).allowed).toBe(false)
    expect(checkKaelResponse({ text: 'Gia la 500000 VND', actor: 'customer' }).allowed).toBe(false)
    expect(checkKaelResponse({ text: 'This answer is English only', actor: 'customer', language: 'vi' }).allowed).toBe(false)
    expect(checkKaelResponse({ text: 'Ban dang lua Kael', actor: 'customer' }).allowed).toBe(false)
    expect(checkKaelResponse({
      text: 'Kael ghi nhan thong tin va se dua ra buoc tiep theo ro rang.',
      actor: 'customer',
      language: 'vi',
    }).allowed).toBe(true)
  })

  it('T8-test-9: enforces short customer-facing sentences', () => {
    const longSentence = Array.from({ length: 24 }, (_, index) => `tu${index}`).join(' ')
    expect(checkKaelResponse({ text: longSentence, actor: 'customer' })).toMatchObject({
      allowed: false,
      reason: 'sentence_too_long',
    })
  })

  it('regenerates once then falls back when self-check fails', () => {
    const result = runKaelSelfCheckPipeline({
      text: 'As an AI, I cannot help',
      actor: 'customer',
      regenerate: () => 'Kael ghi nhan va se huong dan bang thong tin an toan.',
      fallbackText: 'Kael tam thoi chua the tra loi noi dung nay.',
    })

    expect(result.used_regeneration).toBe(true)
    expect(result.used_fallback).toBe(false)
    expect(result.text).toContain('Kael ghi nhan')
  })

  it('integrates self-check into the orchestrator output path', async () => {
    const result = await runKaelPurposeStage({
      label: 'style-check',
      purpose: 'educational_response',
      timeoutMs: 100,
      run: async () => 'As an AI, I cannot help',
      selfCheck: {
        actor: 'customer',
        fallbackText: 'Kael tam thoi chua the tra loi noi dung nay.',
      },
    })

    expect(result.success).toBe(true)
    expect(result.fallbackUsed).toBe(true)
    expect(result.failureReason).toBe('ai_self_reference')
    expect(result.value).toBe('Kael tam thoi chua the tra loi noi dung nay.')
  })

  it('T8-test-11: exposes public sanitized charter without auth', async () => {
    const services = makeServices()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => ({ success: false as const, error: 'should not auth public route', status: 401 as const })),
      services,
    })

    const response = await handler(new Request('https://example.test/kael/charter'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.charter_version).toBe('2026-05-25.p8')
    expect(body.locked_files).toEqual(['identity.md', 'persona.md', 'mission-values.md'])
    expect(JSON.stringify(body)).not.toContain('change_policy')
    expect(services.getKaelCharterCalls).toBe(1)
  })

  it('keeps public charter payload stable and sanitized', () => {
    const charter = getPublicKaelCharter()

    expect(charter.charter_version).toBe('2026-05-25.p8')
    expect(charter.identity_summary).toContain('Home Services')
    expect(charter.forbidden_categories).toContain('ai_self_reference')
    expect(JSON.stringify(charter)).not.toContain('owner')
  })
})

function makeServices(): MobileApiServices & { getKaelCharterCalls: number } {
  const services = {
    getKaelCharterCalls: 0,
    async getKaelCharter() {
      services.getKaelCharterCalls += 1
      return getPublicKaelCharter()
    },
  } as Partial<MobileApiServices> & { getKaelCharterCalls: number }

  return services as MobileApiServices & { getKaelCharterCalls: number }
}
