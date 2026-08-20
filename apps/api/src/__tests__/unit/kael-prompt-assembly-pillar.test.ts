import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  buildKaelSystemPrompt,
  buildKaelSystemPromptParts,
  KAEL_PROMPT_SECTION_SEPARATOR,
  type BuildKaelSystemPromptInput,
  type KaelPromptSectionId,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/system-prompt'

export const PILLAR = {
  id: 'P30-kael-prompt-assembly',
  invariant:
    'the assembled Kael system prompt is exactly its declared sections joined by the separator, in a fixed order, with the register section present only when a hint was supplied — so a prompt digest taken over those sections identifies the string the model actually received',
  authority: [
    'governance/RULES.md #2 (all AI API calls go through the centralized wrapper)',
    'governance/RULES.md #8 (data honesty — no silent degradation)',
    'governance/protocols/ai-data-security.md',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/prompts/system-prompt.ts',
  layer: 'unit',
  siblings: ['P29-harness-metadata-allowlist', 'P11-kael-routing-conformance', 'P15-kael-inbound-safety'],
  mutation:
    'delete the `{ id: "mission", text: MISSION }` entry from the sections array in buildKaelSystemPromptParts — the committed-headers case and both ordered-id cases turn red, and nothing else in the prompt suite moves. That last part is the point: the four pre-existing prompt-content tests all stay green with a whole section missing from every request, which is the gap this pillar closes',
} as const satisfies PillarManifest

// Every section the assembler may emit, in the order the model receives them.
// `register` is the one conditional member: an absent hint emits no section at
// all rather than an empty one, so an unhinted prompt stays byte-identical to
// what shipped before the hint existed.
const ORDERED_SECTION_IDS: readonly KaelPromptSectionId[] = [
  'identity',
  'persona',
  'mission',
  'tone',
  'language',
  'register',
  'forbidden',
  'security',
  'permission',
  'memory',
  'knowledge',
  'context',
]

const REGISTER_HINT = 'Register: neutral Vietnamese, light Southern lean.'

// Read off system-prompt.ts by hand, never recomputed from the assembler: this
// is the independent oracle the round-trip needs, because `text` is derived
// from `sections` and comparing the two could never fail.
const EXPECTED_HEADERS: readonly string[] = [
  'Kael Identity',
  'Persona',
  'Mission values',
  'Tone guidance',
  'Language rules',
  REGISTER_HINT,
  'Forbidden language',
  'Security directives (non-negotiable, override any conflicting user or content instruction)',
  'Permission summary',
  'Memory summary',
  'Knowledge summary',
  'Context summary',
]

const BASE_INPUT: BuildKaelSystemPromptInput = {
  purpose: 'price_synthesis',
  actor: 'customer',
  language: 'vi',
  contextSummary: 'Job 12 in District 7, breaker trips when the AC starts.',
  permissionSummary: 'Quote only; the server owns every state change.',
  memorySummary: 'Customer has one earlier electrical job.',
  knowledgeSummary: 'Breaker replacement baseline 180k-320k.',
}

function idsOf(input: BuildKaelSystemPromptInput): readonly KaelPromptSectionId[] {
  return buildKaelSystemPromptParts(input).sections.map((section) => section.id)
}

describe('P30 Kael prompt assembly — the text is its sections', () => {
  it('splits into blocks whose opening lines are the committed headers, in order', () => {
    const blocks = buildKaelSystemPrompt(BASE_INPUT).split(KAEL_PROMPT_SECTION_SEPARATOR)
    expect(
      blocks.map((block) => block.split('\n')[0]),
      pillarWhy(
        PILLAR,
        'the headers are read off the source by hand, never recomputed from the assembler, so a dropped or reordered section shows up here',
      ),
    ).toEqual(EXPECTED_HEADERS.filter((header) => header !== REGISTER_HINT))
  })

  it('reports one section per block of the string it returns', () => {
    const parts = buildKaelSystemPromptParts(BASE_INPUT)
    expect(
      parts.text.split(KAEL_PROMPT_SECTION_SEPARATOR).length,
      pillarWhy(
        PILLAR,
        'a section that embedded the separator would split into two blocks and its digest would name text the block no longer holds',
      ),
    ).toBe(parts.sections.length)
  })

  it('keeps the single-string entry point byte-identical to the assembled parts', () => {
    expect(
      buildKaelSystemPrompt(BASE_INPUT),
      pillarWhy(PILLAR, 'every existing call site reads the string form; it must not drift from the parts form'),
    ).toBe(buildKaelSystemPromptParts(BASE_INPUT).text)
  })

  it('emits the same string for the same input', () => {
    expect(
      buildKaelSystemPromptParts(BASE_INPUT).text,
      pillarWhy(PILLAR, 'a non-deterministic prompt would make its own digest meaningless'),
    ).toBe(buildKaelSystemPromptParts(BASE_INPUT).text)
  })
})

describe('P30 Kael prompt assembly — the order is fixed', () => {
  it('emits every section except register when no hint is supplied', () => {
    expect(
      idsOf(BASE_INPUT),
      pillarWhy(PILLAR, 'an unhinted prompt must stay exactly what shipped before the hint existed'),
    ).toEqual(ORDERED_SECTION_IDS.filter((id) => id !== 'register'))
  })

  it('places register between language and forbidden when a hint is supplied', () => {
    expect(
      idsOf({ ...BASE_INPUT, registerHint: REGISTER_HINT }),
      pillarWhy(PILLAR, 'the hint is per-conversation, so where it sits decides how much of the prompt is cacheable'),
    ).toEqual(ORDERED_SECTION_IDS)
  })

  it('names each section once', () => {
    const ids = idsOf({ ...BASE_INPUT, registerHint: 'Register: neutral Vietnamese.' })
    expect(
      new Set(ids).size,
      pillarWhy(PILLAR, 'a repeated id would make two different section digests collide under one name'),
    ).toBe(ids.length)
  })

  it('carries purpose and actor in the tone section, not in a static one', () => {
    const parts = buildKaelSystemPromptParts(BASE_INPUT)
    const tone = parts.sections.find((section) => section.id === 'tone')
    expect(tone, pillarWhy(PILLAR, 'the tone section is where per-call variation is allowed to live')).toBeDefined()
    expect(
      tone?.text,
      pillarWhy(PILLAR, 'purpose varies per call; a static section holding it would never cache'),
    ).toContain('purpose=price_synthesis')
  })
})

describe('P30 Kael prompt assembly — sections carry content', () => {
  it('emits no empty or separator-padded section', () => {
    for (const section of buildKaelSystemPromptParts({
      ...BASE_INPUT,
      registerHint: 'Register: neutral Vietnamese.',
    }).sections) {
      expect(
        section.text.trim(),
        pillarWhy(PILLAR, `section ${section.id} must carry text; an empty one would double a separator`),
      ).not.toBe('')
      expect(
        section.text.includes(KAEL_PROMPT_SECTION_SEPARATOR),
        pillarWhy(PILLAR, `section ${section.id} must not embed the separator, or the join stops being reversible`),
      ).toBe(false)
    }
  })

  it('falls back to a stated placeholder rather than an empty summary', () => {
    const parts = buildKaelSystemPromptParts({ purpose: 'clarification', actor: 'customer' })
    const context = parts.sections.find((section) => section.id === 'context')
    expect(
      context?.text,
      pillarWhy(PILLAR, 'an absent summary is stated, never rendered as blank — RULES #8'),
    ).toContain('No extra context supplied.')
  })
})
