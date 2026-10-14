import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import {
  canonicalReplyComposer,
  createReplyComposer,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/reply-composer'

export const PILLAR = {
  id: 'P387-kael-reply-composer',
  invariant:
    'a reply whose content the server decided may be reworded by the model, but only into text that keeps its facts: no new number, no new question, no link, the required confirm instruction still present and the language guard passed; anything else, and any provider failure, leaves the canned sentence the customer would have read anyway',
  authority: [
    'governance/RULES.md #4 (no invented price or figure reaches the customer)',
    'governance/RULES.md #7 (a reworded reply never confirms, never changes a gate)',
    'governance/RULES.md #8 (the canned text is the safe floor when the model fails)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/reply-composer.ts',
  layer: 'unit',
  siblings: ['P384-kael-guided-regeneration', 'P363-kael-turn-intent-router'],
  mutation:
    'remove the numbersIn check — the invented-number case turns red; remove the mustKeep check — the dropped-confirm case turns red; return the first reply without guard — the English-mixed case turns red; swallow AbortError — the cancellation case turns red',
} as const satisfies PillarManifest

const CANONICAL = 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.'
const GOOD = 'Mình đã ghi nhận việc lắp kệ rồi; bạn cho Kael biết căn hộ ở quận nào để tìm thợ gần nhất nhé?'

function reply(text: string) {
  return {
    success: true as const,
    content: JSON.stringify({ text }),
    latencyMs: 700,
    usage: { costUsd: 0.0003, inputTokens: 40, outputTokens: 30 },
    provider: 'deepseek' as const,
    model: 'deepseek-v4-flash',
  }
}

function composer(invoke: (...args: never[]) => Promise<unknown>) {
  return createReplyComposer({
    client: memoryDb().client as never,
    actorId: 'customer-1',
    secrets: {} as never,
    language: 'vi',
    invoke: invoke as never,
  })
}

const ask = (c: ReturnType<typeof composer>, extra: Record<string, unknown> = {}) =>
  c({ kind: 'ask_detail', canonical: CANONICAL, customerSaid: 'Mình cần lắp kệ gỗ', ...extra } as never)

afterEach(() => {
  KAEL_CIRCUIT_BREAKER.reset()
  vi.restoreAllMocks()
})

describe(`${PILLAR.id}: reworded, never rewritten`, () => {
  it('uses a reworded reply that keeps the facts and records how it was made', async () => {
    const invoke = vi.fn(async () => reply(GOOD))
    const result = await ask(composer(invoke))
    expect(result.text).toBe(GOOD)
    expect(result.telemetry).toMatchObject({ replySource: 'ai', provider: 'deepseek', model: 'deepseek-v4-flash', latencyMs: 700 })
    const sent = JSON.stringify((invoke.mock.calls[0] as unknown[])[0])
    expect(sent).toContain('Mình cần lắp kệ gỗ')
    expect(sent).toContain(CANONICAL)
  })

  it('scrubs the customer’s words before the model sees them', async () => {
    const invoke = vi.fn(async () => reply(GOOD))
    await ask(composer(invoke), { customerSaid: 'gọi mình 0901234567 nhé' })
    expect(JSON.stringify((invoke.mock.calls[0] as unknown[])[0]), pillarWhy(PILLAR, 'phone numbers never reach the provider')).not.toContain('0901234567')
  })

  it('rejects an invented number, rewrites once, and falls back to the canned text', async () => {
    const invoke = vi.fn(async () => reply('Thợ sẽ đến trong vòng 2 giờ nữa, bạn cho Kael biết quận nhé?'))
    const result = await ask(composer(invoke))
    expect(invoke, pillarWhy(PILLAR, 'one rewrite, then the floor')).toHaveBeenCalledTimes(2)
    expect(result.text).toBe(CANONICAL)
    expect(result.telemetry.replySource).toBe('fallback')
  })

  it('accepts the rewrite when the second attempt is clean', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce(reply('Please tell Kael the district of the apartment today.'))
      .mockResolvedValueOnce(reply(GOOD))
    const result = await ask(composer(invoke))
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ text: GOOD, telemetry: { replySource: 'guard_regenerated' } })
  })

  it('refuses a second question and a link', async () => {
    const twoQuestions = vi.fn(async () => reply('Bạn ở quận nào? Còn bao giờ thợ đến thì tiện?'))
    expect((await ask(composer(twoQuestions))).text).toBe(CANONICAL)
    const withLink = vi.fn(async () => reply('Bạn xem thêm tại https://example.com rồi cho Kael biết quận nhé.'))
    expect((await ask(composer(withLink))).text).toBe(CANONICAL)
  })

  it('keeps the confirm instruction a notice must carry', async () => {
    const notice = 'Để Kael bắt đầu tìm thợ, bạn bấm nút xác nhận trên thẻ đề xuất.'
    const dropped = vi.fn(async () => reply('Kael sẽ lo phần còn lại cho bạn ngay bây giờ nhé.'))
    const result = await composer(dropped)({ kind: 'notice', canonical: notice, mustKeep: ['xác nhận'] })
    expect(result.text, pillarWhy(PILLAR, 'the customer must still be told how to confirm')).toBe(notice)
    const kept = vi.fn(async () => reply('Khi sẵn sàng, bạn chỉ cần bấm nút xác nhận trên thẻ đề xuất là Kael bắt đầu tìm thợ.'))
    expect((await composer(kept)({ kind: 'notice', canonical: notice, mustKeep: ['xác nhận'] })).text).toContain('xác nhận')
  })
})

describe(`${PILLAR.id}: when the model is not available`, () => {
  it('returns the canned text for a provider failure without retrying', async () => {
    const invoke = vi.fn(async () => ({ success: false as const, provider: 'deepseek' as const, code: 'TIMEOUT', error: 'timeout' }))
    const result = await ask(composer(invoke))
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ text: CANONICAL, telemetry: { replySource: 'fallback' } })
  })

  it('returns the canned text when the call throws, but lets a cancellation through', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect((await ask(composer(async () => { throw new Error('network down') }))).text).toBe(CANONICAL)
    const cancelled = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    await expect(ask(composer(async () => { throw cancelled }))).rejects.toBe(cancelled)
  })

  it('offers a composer that never calls a model', async () => {
    expect(await canonicalReplyComposer({ kind: 'notice', canonical: CANONICAL })).toEqual({
      text: CANONICAL,
      telemetry: { replySource: 'template' },
    })
  })
})
