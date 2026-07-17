import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  accumulateRegionalScores,
  buildRegisterHint,
  DEFAULT_REGION,
  detectRegionalRegister,
  resolveRegionalRegister,
  scoreRegionalMarkers,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/charter/regional-register'
import { REGIONAL_LEXICON } from '../../../../../supabase/functions/mobile-api/_shared/kael/charter/regional-lexicon'
import { buildKaelSystemPrompt } from '../../../../../supabase/functions/mobile-api/_shared/kael/charter/system-prompt'

const ROOT = resolve(__dirname, '../../../../../')
const readEdge = (rel: string) =>
  readFileSync(resolve(ROOT, `supabase/functions/mobile-api/_shared/kael/${rel}`), 'utf8')

type CharterLexicon = {
  regions: string[]
  default_region: string
  scoring: {
    weights: Record<'A' | 'B' | 'C', number>
    guess_threshold: number
    recognize_threshold: number
    conflict_penalty: number
    recognize_requires_tier_a_or_two_b: boolean
  }
  tiers: Record<'A' | 'B' | 'C', {
    mirror_eligible: boolean
    markers: Array<{ term: string; region: string; mirror?: boolean }>
  }>
}

const charterLexicon = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/shared/kael/charter/regional-lexicon.json'), 'utf8'),
) as CharterLexicon

const normalizeMarkers = (markers: Array<{ term: string; region: string; mirror?: boolean }>) =>
  markers.map((m) => `${m.term}|${m.region}|${m.mirror ?? ''}`).toSorted()

describe('KC2 Edge regional register — detector', () => {
  it('defaults unknown to a neutral South lean (HCMC)', () => {
    expect(DEFAULT_REGION).toBe('nam')
  })

  it('recognizes a Southern message from its own everyday words (Nam first)', () => {
    const r = detectRegionalRegister('Bồn rửa chén nghẹt, muỗng với đồ rớt xuống, anh qua coi giùm nha.')
    expect(r.region).toBe('nam')
    expect(r.level).toBe('recognize')
    expect(r.adapt.mirrorTerms).toContain('chén')
    expect(r.adapt.mirrorTerms).toContain('muỗng')
  })

  it('treats a single Southern marker as a low-confidence guess', () => {
    const r = detectRegionalRegister('Vòi bị hư, hổng biết sao luôn nha.')
    expect(r.region).toBe('nam')
    expect(r.level).toBe('guess')
  })

  it('recognizes Northern and Central messages', () => {
    expect(detectRegionalRegister('Bát với thìa trong bồn rửa bị bám bẩn, anh sang xem giúp nhé.').region).toBe('bac')
    expect(detectRegionalRegister('Cái vòi ni hư rồi, làm răng chừ rứa.').region).toBe('trung')
  })

  it('stays neutral when there are no markers or markers conflict', () => {
    expect(detectRegionalRegister('Vòi nước bị hư, nhờ thợ qua kiểm tra giúp em.').region).toBe('unknown')
    expect(detectRegionalRegister('Nhà mình dùng bát, anh kia nói rứa.').region).toBe('unknown')
  })

  it('never mirrors strong tier-A dialect back to the customer', () => {
    const r = detectRegionalRegister('Cái vòi ni hư rồi, làm răng chừ rứa.')
    expect(r.region).toBe('trung')
    expect(r.adapt.mirrorTerms).not.toContain('rứa')
    expect(r.adapt.mirrorTerms).not.toContain('ni')
  })

  it('is deterministic for the same input', () => {
    const input = 'Bồn rửa chén nghẹt, muỗng rớt, anh coi giùm nha.'
    expect(detectRegionalRegister(input)).toEqual(detectRegionalRegister(input))
  })

  it('scores each distinct marker once instead of amplifying repeated particles', () => {
    const scored = scoreRegionalMarkers('nha nha nha nha')

    expect(scored.scores.nam).toBe(1)
    expect(scored.hits).toHaveLength(1)
    expect(detectRegionalRegister('nha nha nha nha').region).toBe('unknown')
  })

  it('canonicalizes runtime hits and saturates malformed accumulated scores', () => {
    const resolved = resolveRegionalRegister(
      { bac: 0, trung: 0, nam: 5 },
      [
        { term: 'send-money', tier: 'B', region: 'nam', mirrorEligible: true },
        { term: 'chén', tier: 'B', region: 'nam', mirrorEligible: true },
        { term: 'chén', tier: 'B', region: 'nam', mirrorEligible: true },
      ],
    )

    expect(resolved.level).toBe('guess')
    expect(resolved.hits.map((hit) => hit.term)).toEqual(['chén'])
    expect(resolved.adapt.mirrorTerms).toEqual(['chén'])
    expect(accumulateRegionalScores(
      { bac: Number.MAX_SAFE_INTEGER, trung: Number.NaN, nam: -1 },
      { bac: 10, trung: 2, nam: Number.POSITIVE_INFINITY },
    )).toEqual({ bac: Number.MAX_SAFE_INTEGER, trung: 2, nam: 0 })
  })
})

describe('KC2 Edge regional register — lexicon stays in sync with the charter', () => {
  it('matches default region, the region set, and the whole scoring object', () => {
    expect(REGIONAL_LEXICON.default_region).toBe(charterLexicon.default_region)
    expect([...REGIONAL_LEXICON.regions]).toEqual(charterLexicon.regions)
    // whole-object equality catches drift in ANY scoring field (including
    // recognize_requires_tier_a_or_two_b), not just the ones named explicitly
    expect(REGIONAL_LEXICON.scoring).toEqual(charterLexicon.scoring)
  })

  it('matches every tier marker (term, region, mirror flag) with no drift', () => {
    for (const tier of ['A', 'B', 'C'] as const) {
      expect(REGIONAL_LEXICON.tiers[tier].mirror_eligible).toBe(charterLexicon.tiers[tier].mirror_eligible)
      expect(normalizeMarkers([...REGIONAL_LEXICON.tiers[tier].markers])).toEqual(
        normalizeMarkers(charterLexicon.tiers[tier].markers),
      )
    }
  })
})

describe('KC2 Edge regional register — mirror-lite prompt hint (no stereotype vector)', () => {
  it('returns null for a neutral (unknown) register', () => {
    expect(buildRegisterHint(detectRegionalRegister('Vòi nước bị hư, nhờ thợ kiểm tra giúp.'))).toBeNull()
  })

  it('surfaces only the customer own words, never the region label or tier-A dialect', () => {
    const hint = buildRegisterHint(
      detectRegionalRegister('Bồn rửa chén nghẹt, muỗng với đồ rớt, anh coi giùm nha.'),
    )
    expect(hint).toBeTruthy()
    expect(hint).toContain('chén')
    expect(hint).toContain('muỗng')
    // internal region code never leaks into the prompt (\\b avoids "VietNAMese")
    expect(hint).not.toMatch(/\b(nam|bac|trung)\b/i)
    // carries the anti-mimicry / anti-stereotype guardrail
    expect(hint).toMatch(/never mimic a regional accent/i)
    expect(hint).toMatch(/never mention, ask, or infer/i)
  })

  it('gives a term-free warm hint when only tier-A dialect was detected', () => {
    const register = detectRegionalRegister('Cái vòi ni hư rồi, làm răng chừ rứa.')
    expect(register.adapt.mirrorTerms).toEqual([]) // tier-A is detect-only, nothing to echo
    const hint = buildRegisterHint(register)
    expect(hint).toBeTruthy()
    expect(hint).not.toContain('rứa') // strong dialect is never surfaced
    expect(hint).not.toMatch(/\b(nam|bac|trung)\b/i)
    expect(hint).toMatch(/never mimic a regional accent/i)
  })
})

describe('KC2 Edge regional register — prompt integration', () => {
  const base = { purpose: 'educational_response', actor: 'customer' } as const

  it('injects the register hint only when supplied, leaving the base prompt unchanged', () => {
    const without = buildKaelSystemPrompt({ ...base, contextSummary: 'x' })
    expect(without).not.toContain('Register hint')
    const with_ = buildKaelSystemPrompt({
      ...base,
      contextSummary: 'x',
      registerHint: 'Register hint (mirror-lite, deterministic)\nreuse: chén.',
    })
    expect(with_).toContain('Register hint')
    // determinism preserved for the no-hint path
    expect(buildKaelSystemPrompt({ ...base, contextSummary: 'x' })).toBe(without)
  })
})

describe('KC2 Edge regional register — wiring + no PII logging', () => {
  it('is wired into the customer conversational path', () => {
    const assistant = readEdge('stages/customer-assistant.ts')
    expect(assistant).toContain('detectRegionalRegister')
    expect(assistant).toContain('buildRegisterHint')
    expect(assistant).toContain('registerHint')
  })

  it('detector and lexicon do not import workspace packages or log anything (RULES #9)', () => {
    const detector = readEdge('charter/regional-register.ts')
    const lexicon = readEdge('charter/regional-lexicon.ts')
    for (const src of [detector, lexicon]) {
      expect(src).not.toContain('packages/shared')
      expect(src).not.toContain('console.')
    }
  })
})
