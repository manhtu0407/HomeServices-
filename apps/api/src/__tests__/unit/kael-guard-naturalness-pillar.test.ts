import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  checkKaelResponse,
  hasKaelLanguageMismatch,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/self-check'
import {
  buildKaelSystemPrompt,
  KAEL_CHARTER_VERSION,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/system-prompt'

export const PILLAR = {
  id: 'P383-kael-guard-naturalness',
  invariant:
    'the output guard rejects what is unsafe or run-on, not what is merely natural Vietnamese: sentences up to 35 syllables, everyday loanwords (app, chat, video, link, file, check-in) and reassuring "không bao giờ" pass, while English phrases, outcome guarantees and over-long sentences are still rejected',
  authority: [
    'governance/RULES.md #3 (AI output is validated before it reaches a user)',
    'governance/RULES.md #5 (a selected language mode is not mixed with English copy)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/self-check.ts',
  layer: 'unit',
  siblings: ['P17-adversarial-surface-matrix', 'P30-kael-prompt-assembly'],
  mutation:
    'set CUSTOMER_SENTENCE_WORD_CAP back to 20 — the 30-token case turns red; put "video" back in ENGLISH_REPLY_WORDS — the loanword case turns red; drop PHRASE_EXEMPTIONS so "khong bao gio" is unconditional — the reassurance case turns red; widen the exemption to any sentence — the guarantee cases turn red',
} as const satisfies PillarManifest

const sentence = (words: number) => `${Array.from({ length: words }, () => 'tốt').join(' ')}.`

describe(`${PILLAR.id}: natural Vietnamese is not a guard trip`, () => {
  it('allows a 30-token customer sentence and still rejects a run-on', () => {
    expect(checkKaelResponse({ text: sentence(30), actor: 'customer', language: 'vi' }).allowed,
      pillarWhy(PILLAR, '20 syllables is about ten English words; 30 is an ordinary Vietnamese sentence')).toBe(true)
    expect(checkKaelResponse({ text: sentence(35), actor: 'customer', language: 'vi' }).allowed).toBe(true)
    expect(checkKaelResponse({ text: sentence(36), actor: 'customer', language: 'vi' })).toMatchObject({
      allowed: false,
      reason: 'sentence_too_long',
    })
  })

  it('treats established loanwords as Vietnamese', () => {
    for (const text of [
      'Bạn gửi thêm ảnh hoặc video chỗ rò để Kael xem giúp nhé.',
      'Bạn mở app và gửi link cho Kael.',
      'Kael đã nhận file bạn gửi.',
      'Thợ sẽ check-in khi đến tòa nhà.',
      'Bạn chat với Kael bất cứ lúc nào.',
    ]) {
      expect(hasKaelLanguageMismatch(text, 'vi'), pillarWhy(PILLAR, text)).toBe(false)
    }
  })

  it('still rejects English phrases in Vietnamese mode', () => {
    for (const text of [
      'Please check the filter then book service in the app.',
      'Kael sẽ check payment status cho bạn.',
      'Mở panel điện để xem.',
      'This answer is English only and has no Vietnamese signal.',
    ]) {
      expect(hasKaelLanguageMismatch(text, 'vi'), pillarWhy(PILLAR, text)).toBe(true)
    }
  })

  it('narrows "không bao giờ" to outcome guarantees', () => {
    expect(checkKaelResponse({ text: 'Kael không bao giờ tự xác nhận thay bạn.', actor: 'customer', language: 'vi' }).allowed,
      pillarWhy(PILLAR, 'reassurance about who decides is not a guarantee')).toBe(true)
    expect(checkKaelResponse({ text: 'Không bao giờ tự mở tủ điện. Thợ sẽ kiểm tra giúp bạn.', actor: 'customer', language: 'vi' }).allowed).toBe(true)
    expect(checkKaelResponse({ text: 'Kael đảm bảo không bao giờ lỗi lại.', actor: 'customer', language: 'vi' })).toMatchObject({
      allowed: false,
      reason: 'absolute_claim',
    })
    for (const text of ['Máy sẽ không bao giờ cháy nữa.', 'Ống sẽ không bao giờ rò nước.']) {
      expect(checkKaelResponse({ text, actor: 'customer', language: 'vi' }), pillarWhy(PILLAR, text)).toMatchObject({
        allowed: false,
        reason: 'absolute_claim',
      })
    }
    expect(checkKaelResponse({ text: 'Tuyệt đối an toàn, chắc chắn 100%.', actor: 'customer', language: 'vi' })).toMatchObject({
      allowed: false,
      reason: 'absolute_claim',
    })
  })

  it('keeps the safety guards that were not relaxed', () => {
    expect(checkKaelResponse({ text: 'As an AI, I cannot help with that.', actor: 'customer', language: 'en' })).toMatchObject({
      allowed: false,
      reason: 'ai_self_reference',
    })
    expect(checkKaelResponse({ text: 'Giá khoảng 500.000 đồng cho việc này.', actor: 'customer', language: 'vi' })).toMatchObject({
      allowed: false,
      reason: 'exact_vnd',
    })
  })

  it('tells conversational prompts they are not a form and states the new ceiling', () => {
    const chat = buildKaelSystemPrompt({ purpose: 'normal_chat_response', actor: 'customer', language: 'vi' })
    const work = buildKaelSystemPrompt({ purpose: 'clarification', actor: 'customer', language: 'vi' })
    expect(chat, pillarWhy(PILLAR, 'free chat must not be told "one main idea, no markdown, 20 words"')).not.toContain('no markdown')
    expect(chat).toContain('up to 35 words')
    expect(work).toContain('up to 35 words')
    expect(`${chat}${work}`).not.toContain('<=20 words')
    expect(chat).toContain('loanwords')
    expect(KAEL_CHARTER_VERSION).toBe('2026-10-14.p12')
  })
})
