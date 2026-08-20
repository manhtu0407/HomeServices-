import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  HARNESS_METADATA_ALLOWLIST,
  sanitizeHarnessMetadata,
} from '../../../../../supabase/functions/_shared/harness/trace.ts'

export const PILLAR = {
  id: 'P29-harness-metadata-allowlist',
  invariant:
    'the provenance allowlist admits only one-way digests, opaque version labels, and finite counts; it never relaxes the value constraints, and every key outside it still answers to the PII denylist',
  authority: [
    'governance/RULES.md #9 (logging must not expose PII or secrets)',
    'governance/RULES.md Security Invariants — PII Handling (never log full phone numbers, IDs, exact addresses, or raw chat text)',
  ],
  target: 'supabase/functions/_shared/harness/trace.ts',
  layer: 'security-negative',
  siblings: [
    'P09-kael-pii-scrub',
    'P15-kael-inbound-safety',
    'P13-autonomy-decision-durability',
  ],
  mutation:
    'delete the `!HARNESS_METADATA_ALLOWLIST.has(normalized) &&` conjunct in sanitizeHarnessMetadata — five cases turn red here and nothing else in the suite moves, because every allowlisted digest and count key matches `prompt` or `token` in the denylist. Neutralising the whole condition to `false &&` instead is the wrong mutation: that short-circuits the denylist as well, so PII crosses and the pre-existing harness-trace cases fail instead of this pillar',
} as const satisfies PillarManifest

// The exact set the allowlist may hold. Widening the allowlist without widening
// this list is the defect this pillar exists to catch: every entry has to be a
// one-way digest, an opaque version label, or a finite count.
const EXPECTED_ALLOWLIST = [
  'cache_hit_tokens',
  'cache_miss_tokens',
  'charter_version',
  'effort',
  'input_tokens',
  'max_output_tokens',
  'output_tokens',
  'prefix_stable',
  'prompt_digest',
  'prompt_section_digests',
  'schema_digest',
  'schema_id',
  'temperature',
] as const

const DIGEST = 'a'.repeat(64)

describe('P29 harness metadata allowlist — the closed set', () => {
  it('holds exactly the declared keys', () => {
    expect(
      [...HARNESS_METADATA_ALLOWLIST].sort(),
      pillarWhy(
        PILLAR,
        'adding a key here must be a deliberate edit to this pillar, not a silent widening of what reaches harness_events',
      ),
    ).toEqual([...EXPECTED_ALLOWLIST])
  })

  it('names no key that could carry free text', () => {
    for (const key of HARNESS_METADATA_ALLOWLIST) {
      expect(
        /note|comment|reason|summary|excerpt|detail|body|label/u.test(key),
        pillarWhy(PILLAR, `allowlisted key ${key} reads as free text rather than a digest or a count`),
      ).toBe(false)
    }
  })
})

describe('P29 harness metadata allowlist — provenance survives', () => {
  it('keeps every allowlisted key when its value is well formed', () => {
    expect(
      sanitizeHarnessMetadata({
        charter_version: '2026-08-06.p11',
        prompt_digest: DIGEST,
        prompt_section_digests: ['identity:ab12cd34ef56', 'persona:0123456789ab'],
        schema_id: 'kael.intent.v1',
        schema_digest: DIGEST,
        prefix_stable: true,
        max_output_tokens: 900,
        temperature: 0.2,
        effort: 'low',
        input_tokens: 1234,
        output_tokens: 56,
        cache_hit_tokens: 1000,
        cache_miss_tokens: 234,
      }),
      pillarWhy(
        PILLAR,
        'a price decision is auditable only if the prompt version, schema version, and token counts all reach the event',
      ),
    ).toEqual({
      charter_version: '2026-08-06.p11',
      prompt_digest: DIGEST,
      prompt_section_digests: ['identity:ab12cd34ef56', 'persona:0123456789ab'],
      schema_id: 'kael.intent.v1',
      schema_digest: DIGEST,
      prefix_stable: true,
      max_output_tokens: 900,
      temperature: 0.2,
      effort: 'low',
      input_tokens: 1234,
      output_tokens: 56,
      cache_hit_tokens: 1000,
      cache_miss_tokens: 234,
    })
  })

  it('keeps a zero count rather than reading it as absent', () => {
    expect(
      sanitizeHarnessMetadata({ cache_hit_tokens: 0, cache_miss_tokens: 4096 }),
      pillarWhy(PILLAR, 'a measured zero-hit call is evidence; dropping it would read as unmeasured'),
    ).toEqual({ cache_hit_tokens: 0, cache_miss_tokens: 4096 })
  })
})

describe('P29 harness metadata allowlist — the denylist still holds', () => {
  it('drops contact, identity, and free-text keys alongside allowlisted ones', () => {
    expect(
      sanitizeHarnessMetadata({
        prompt_digest: DIGEST,
        email: 'user@example.test',
        phone: '0901234567',
        name: 'Nguyen Van A',
        address: '12 Nguyen Hue',
        description: 'customer said the breaker keeps tripping',
        content: 'raw assistant text',
        message: 'raw customer message',
        transcript: 'voice transcript',
      }),
      pillarWhy(
        PILLAR,
        'the allowlist is a narrow door, not a hole: keys beside it must answer to the denylist exactly as before',
      ),
    ).toEqual({ prompt_digest: DIGEST })
  })

  it('drops a raw prompt body even though its key extends an allowlisted name', () => {
    expect(
      sanitizeHarnessMetadata({ prompt_digest_text: 'system: you are Kael...' }),
      pillarWhy(PILLAR, 'allowlist membership is the whole key, never a prefix'),
    ).toEqual({})
  })
})

describe('P29 harness metadata allowlist — value constraints are not bypassed', () => {
  it('drops an allowlisted key whose value carries whitespace', () => {
    expect(
      sanitizeHarnessMetadata({ prompt_digest: 'sha256 of the prompt' }),
      pillarWhy(PILLAR, 'a digest never contains spaces; a value that does is prose wearing a digest key'),
    ).toEqual({})
  })

  it('drops an allowlisted key whose value is longer than the string bound', () => {
    expect(
      sanitizeHarnessMetadata({ charter_version: 'x'.repeat(121) }),
      pillarWhy(PILLAR, 'the 120-character bound applies to allowlisted values too'),
    ).toEqual({})
  })

  it('drops an allowlisted key holding a nested object', () => {
    expect(
      sanitizeHarnessMetadata({ prompt_section_digests: { identity: DIGEST } }),
      pillarWhy(PILLAR, 'only scalars and arrays cross; an object could nest anything'),
    ).toEqual({})
  })

  it('caps an allowlisted array at twenty entries', () => {
    const digests = Array.from({ length: 25 }, (_, index) => `s${index}:ab12cd34ef56`)
    const result = sanitizeHarnessMetadata({ prompt_section_digests: digests })
    expect(
      (result.prompt_section_digests as readonly string[]).length,
      pillarWhy(PILLAR, 'a 25-section prompt must not push the event past the 8192-byte metadata bound'),
    ).toBe(20)
  })

  it('drops a free-text entry inside an allowlisted array while keeping the digests', () => {
    expect(
      sanitizeHarnessMetadata({
        prompt_section_digests: ['identity:ab12cd34ef56', 'customer said hello', 'persona:0123456789ab'],
      }),
      pillarWhy(PILLAR, 'an array is not a bag: each entry answers to the same value constraints'),
    ).toEqual({ prompt_section_digests: ['identity:ab12cd34ef56', 'persona:0123456789ab'] })
  })
})

describe('P29 harness metadata allowlist — the payload fits the durable bound', () => {
  it('stays far below the 8192-byte harness_events metadata constraint', () => {
    const sanitized = sanitizeHarnessMetadata({
      charter_version: '2026-08-06.p11',
      prompt_digest: DIGEST,
      prompt_section_digests: Array.from({ length: 12 }, (_, index) => `section${index}:ab12cd34ef56`),
      schema_id: 'kael.price_synthesis.v1',
      schema_digest: DIGEST,
      prefix_stable: true,
      max_output_tokens: 900,
      temperature: 0.2,
      effort: 'medium',
      input_tokens: 12_345,
      output_tokens: 678,
      cache_hit_tokens: 11_000,
      cache_miss_tokens: 1_345,
    })
    const bytes = new TextEncoder().encode(JSON.stringify(sanitized)).byteLength
    expect(
      bytes,
      pillarWhy(
        PILLAR,
        `measured ${bytes} bytes against the harness_events_metadata_bound check of 8192; a regression here fails the insert, not the test`,
      ),
    ).toBeLessThan(2048)
  })
})
