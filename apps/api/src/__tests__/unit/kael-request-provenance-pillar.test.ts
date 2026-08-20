import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { sanitizeHarnessMetadata } from '../../../../../supabase/functions/_shared/harness/trace'
import { buildKaelRequestProvenance } from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/prompt-fingerprint'
import { KAEL_CHARTER_VERSION } from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/system-prompt'
import type {
  AIMessage,
  AIRequest,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P32-kael-request-provenance',
  invariant:
    'provenance for a model call is derived from the request the seam is about to send, not from what a caller remembered to pass, so every purpose carries it; it is digests and counts only, and the whole record survives the harness metadata allowlist',
  authority: [
    'governance/RULES.md #2 (all AI API calls go through the centralized wrapper)',
    'governance/RULES.md #9 (logging must not expose PII or secrets)',
    'governance/RULES.md #8 (data honesty — no silent degradation)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/prompts/prompt-fingerprint.ts',
  layer: 'security-negative',
  siblings: ['P31-kael-prompt-fingerprint', 'P29-harness-metadata-allowlist', 'P16-ai-spend-envelope'],
  mutation:
    'digest only `request.messages[0]` instead of every message — the two-messages-differ case turns red, because a request whose user turn changed then reports the same prompt_digest as the one before it. Reading `charter_version` from a mutable field instead of the module constant turns the charter case red instead',
} as const satisfies PillarManifest

function requestWith(messages: AIMessage[], overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    purpose: 'price_synthesis',
    provider: 'deepseek',
    model: 'deepseek-chat',
    messages,
    ...overrides,
  }
}

const SYSTEM: AIMessage = { role: 'system', content: 'You are Kael.' }
const USER: AIMessage = { role: 'user', content: 'Breaker trips when the air conditioner starts.' }

describe('P32 request provenance — it describes the request, not the caller', () => {
  it('covers a request no charter prompt ever touched', async () => {
    const provenance = await buildKaelRequestProvenance(
      requestWith([{ role: 'user', content: 'Classify this intake.' }], { purpose: 'intent_classification' }),
    )
    expect(
      provenance.prompt_digest,
      pillarWhy(
        PILLAR,
        'the six builders in prompts.ts never call buildKaelSystemPrompt; a caller-supplied fingerprint would leave the whole tool path, price_synthesis included, with no record',
      ),
    ).toMatch(/^[0-9a-f]{64}$/)
    expect(
      provenance.prompt_section_digests.length,
      pillarWhy(PILLAR, 'one entry per message, whatever built them'),
    ).toBe(1)
  })

  it('reports the charter version from the deployed constant', async () => {
    const provenance = await buildKaelRequestProvenance(requestWith([SYSTEM, USER]))
    expect(
      provenance.charter_version,
      pillarWhy(PILLAR, 'the charter version names the prompt code that produced whatever was sent'),
    ).toBe(KAEL_CHARTER_VERSION)
  })

  it('names each message by role and position', async () => {
    const provenance = await buildKaelRequestProvenance(requestWith([SYSTEM, USER]))
    expect(
      provenance.prompt_section_digests.map((entry) => entry.split(':')[0]),
      pillarWhy(PILLAR, 'position matters: the same text in a different turn is a different request'),
    ).toEqual(['system0', 'user1'])
  })
})

describe('P32 request provenance — it moves when the request moves', () => {
  it('reports a different digest when any message changes', async () => {
    const before = await buildKaelRequestProvenance(requestWith([SYSTEM, USER]))
    const after = await buildKaelRequestProvenance(
      requestWith([SYSTEM, { role: 'user', content: 'Breaker trips when the washing machine starts.' }]),
    )
    expect(
      after.prompt_digest,
      pillarWhy(PILLAR, 'two different requests must never share one digest, or provenance proves nothing'),
    ).not.toBe(before.prompt_digest)
    expect(
      after.prompt_section_digests[0],
      pillarWhy(PILLAR, 'the untouched system turn must report the same digest, so the moving one is identifiable'),
    ).toBe(before.prompt_section_digests[0])
  })

  it('distinguishes the same text sent under a different role', async () => {
    const asUser = await buildKaelRequestProvenance(requestWith([{ role: 'user', content: 'same text' }]))
    const asSystem = await buildKaelRequestProvenance(requestWith([{ role: 'system', content: 'same text' }]))
    expect(
      asUser.prompt_digest,
      pillarWhy(PILLAR, 'role decides authority; a role swap is a different request even at identical text'),
    ).not.toBe(asSystem.prompt_digest)
  })

  it('distinguishes an image url from the same url sent as text', async () => {
    const asImage = await buildKaelRequestProvenance(
      requestWith([
        { role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://x.test/a.jpg' } }] },
      ]),
    )
    const asText = await buildKaelRequestProvenance(
      requestWith([{ role: 'user', content: [{ type: 'text', text: 'https://x.test/a.jpg' }] }]),
    )
    expect(
      asImage.prompt_digest,
      pillarWhy(PILLAR, 'a vision call and a text call are different requests even at identical characters'),
    ).not.toBe(asText.prompt_digest)
  })

  it('digests base64 image data without carrying it', async () => {
    const data = 'QUJDREVGRw'.repeat(64)
    const provenance = await buildKaelRequestProvenance(
      requestWith([
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }],
        },
      ]),
    )
    expect(
      JSON.stringify(provenance).includes(data.slice(0, 32)),
      pillarWhy(PILLAR, 'private evidence must never travel into an audit row — RULES Multimodal Evidence Privacy'),
    ).toBe(false)
  })
})

describe('P32 request provenance — it carries the effective config', () => {
  it('reports the output cap, temperature, and effort the request actually set', async () => {
    const provenance = await buildKaelRequestProvenance(
      requestWith([SYSTEM], { maxTokens: 900, temperature: 0.2, effort: 'low' }),
    )
    expect(
      { ...provenance },
      pillarWhy(PILLAR, 'reproducing a decision needs the sampling config, not only the text'),
    ).toMatchObject({ max_output_tokens: 900, temperature: 0.2, effort: 'low' })
  })

  it('omits an unset config field rather than inventing a default', async () => {
    const provenance = await buildKaelRequestProvenance(requestWith([SYSTEM]))
    expect(
      Object.keys(provenance).includes('temperature'),
      pillarWhy(PILLAR, 'a recorded 0 the caller never sent would be fabricated evidence — RULES #8'),
    ).toBe(false)
  })
})

describe('P32 request provenance — no message text crosses', () => {
  it('carries no fragment of a customer message', async () => {
    const provenance = await buildKaelRequestProvenance(requestWith([SYSTEM, USER]))
    const serialized = JSON.stringify(provenance)
    for (const word of ['Breaker', 'conditioner', 'starts']) {
      expect(
        serialized.includes(word),
        pillarWhy(PILLAR, `the word ${word} came from a customer message and must not reach harness_events`),
      ).toBe(false)
    }
  })

  it('survives the harness metadata allowlist whole', async () => {
    const provenance = await buildKaelRequestProvenance(
      requestWith([SYSTEM, USER], { maxTokens: 900, temperature: 0.2, effort: 'low' }),
    )
    expect(
      Object.keys(sanitizeHarnessMetadata({ ...provenance })).sort(),
      pillarWhy(PILLAR, 'a field the sanitizer drops is a field the audit row silently lacks'),
    ).toEqual(Object.keys(provenance).sort())
  })
})
