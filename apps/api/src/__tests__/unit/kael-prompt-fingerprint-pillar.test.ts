import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { sanitizeHarnessMetadata } from '../../../../../supabase/functions/_shared/harness/trace'
import {
  computeKaelPromptFingerprint,
  KAEL_PROMPT_SECTION_DIGEST_LENGTH,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/prompt-fingerprint'
import {
  buildKaelSystemPromptParts,
  KAEL_CHARTER_VERSION,
  type BuildKaelSystemPromptInput,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/system-prompt'

export const PILLAR = {
  id: 'P31-kael-prompt-fingerprint',
  invariant:
    'the prompt fingerprint changes exactly when the prompt changes and names which section moved, while carrying no prompt text of its own — and every field it emits survives the harness metadata allowlist unaltered',
  authority: [
    'governance/RULES.md #9 (logging must not expose PII or secrets)',
    'governance/RULES.md #8 (data honesty — no silent degradation)',
    'governance/protocols/ai-data-security.md',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/prompts/prompt-fingerprint.ts',
  layer: 'security-negative',
  siblings: ['P30-kael-prompt-assembly', 'P29-harness-metadata-allowlist', 'P09-kael-pii-scrub'],
  mutation:
    'digest `section.id` instead of `section.text` in computeKaelPromptFingerprint — exactly one case turns red, the isolation case, because the tone digest then stops moving when the purpose does. Emitting `section.text` in place of its digest turns three red instead: the width case, the no-text-crosses case, and the allowlist round-trip, since the raw summary breaks the sanitizer value charset. Both were observed',
} as const satisfies PillarManifest

const BASE_INPUT: BuildKaelSystemPromptInput = {
  purpose: 'price_synthesis',
  actor: 'customer',
  language: 'vi',
  contextSummary: 'Breaker trips when the air conditioner starts.',
  permissionSummary: 'Quote only; the server owns every state change.',
  memorySummary: 'One earlier electrical job.',
  knowledgeSummary: 'Breaker replacement baseline 180k-320k.',
}

// Changing only `purpose` moves only the tone section: identity, persona,
// mission, language, forbidden, and security are module constants, and the
// remaining four render the input summaries this case holds fixed.
const TONE_ONLY_INPUT: BuildKaelSystemPromptInput = { ...BASE_INPUT, purpose: 'clarification' }

function digestFor(entries: readonly string[], id: string): string | undefined {
  return entries.find((entry) => entry.startsWith(`${id}:`))
}

describe('P31 Kael prompt fingerprint — identity', () => {
  it('reports the charter version the prompt was built under', async () => {
    const fingerprint = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    expect(
      fingerprint.charter_version,
      pillarWhy(PILLAR, 'a disputed quote is only traceable if the charter version travels with the call'),
    ).toBe(KAEL_CHARTER_VERSION)
  })

  it('emits a full-width hex digest for the whole prompt', async () => {
    const fingerprint = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    expect(
      fingerprint.prompt_digest,
      pillarWhy(PILLAR, 'a truncated whole-prompt digest would collide across unrelated prompts'),
    ).toMatch(/^[0-9a-f]{64}$/)
  })

  it('emits one id-prefixed section digest of the declared width per section', async () => {
    const parts = buildKaelSystemPromptParts(BASE_INPUT)
    const fingerprint = await computeKaelPromptFingerprint(parts)
    expect(
      fingerprint.prompt_section_digests.length,
      pillarWhy(PILLAR, 'a missing entry would hide the section that changed'),
    ).toBe(parts.sections.length)
    for (const entry of fingerprint.prompt_section_digests) {
      expect(
        entry,
        pillarWhy(PILLAR, `entry ${entry} must read as id:digest at the declared width`),
      ).toMatch(new RegExp(`^[a-z]+:[0-9a-f]{${KAEL_PROMPT_SECTION_DIGEST_LENGTH}}$`))
    }
  })

  it('returns the same fingerprint for the same prompt', async () => {
    const first = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    const second = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    expect(
      second,
      pillarWhy(PILLAR, 'a fingerprint that drifted on its own could never prove which prompt ran'),
    ).toEqual(first)
  })
})

describe('P31 Kael prompt fingerprint — it isolates the change', () => {
  it('moves only the tone digest when only the purpose changes', async () => {
    const before = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    const after = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(TONE_ONLY_INPUT))

    expect(
      digestFor(after.prompt_section_digests, 'tone'),
      pillarWhy(PILLAR, 'the section whose text changed must report a different digest'),
    ).not.toBe(digestFor(before.prompt_section_digests, 'tone'))

    for (const id of ['identity', 'persona', 'mission', 'language', 'forbidden', 'security', 'context']) {
      expect(
        digestFor(after.prompt_section_digests, id),
        pillarWhy(PILLAR, `section ${id} did not change, so a moving digest here would be noise`),
      ).toBe(digestFor(before.prompt_section_digests, id))
    }

    expect(
      after.prompt_digest,
      pillarWhy(PILLAR, 'any section change must also move the whole-prompt digest'),
    ).not.toBe(before.prompt_digest)
  })

  it('gives two sections with different text different digests', async () => {
    const fingerprint = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    const digests = fingerprint.prompt_section_digests.map((entry) => entry.split(':')[1])
    expect(
      new Set(digests).size,
      pillarWhy(PILLAR, 'a collision here would report the wrong section as the one that moved'),
    ).toBe(digests.length)
  })
})

describe('P31 Kael prompt fingerprint — no prompt text crosses', () => {
  it('carries no fragment of the summaries it was computed over', async () => {
    const marker = 'Breaker trips when the air conditioner starts.'
    const fingerprint = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    const serialized = JSON.stringify(fingerprint)
    for (const word of marker.split(' ')) {
      expect(
        serialized.includes(word),
        pillarWhy(PILLAR, `the word ${word} came from a customer summary and must not survive into the fingerprint`),
      ).toBe(false)
    }
  })

  it('survives the harness metadata allowlist unaltered', async () => {
    const fingerprint = await computeKaelPromptFingerprint(buildKaelSystemPromptParts(BASE_INPUT))
    expect(
      sanitizeHarnessMetadata({ ...fingerprint }),
      pillarWhy(
        PILLAR,
        'the fingerprint is only provenance if it reaches harness_events whole; a dropped field is a silent gap',
      ),
    ).toEqual({
      charter_version: fingerprint.charter_version,
      prompt_digest: fingerprint.prompt_digest,
      prompt_section_digests: [...fingerprint.prompt_section_digests],
    })
  })
})
