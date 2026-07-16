import { describe, expect, it } from 'vitest'
import {
  accumulateRegionalScores,
  DEFAULT_REGION,
  detectRegionalRegister,
  resolveRegionalRegister,
  scoreRegionalMarkers,
} from '../../kael/regional-register'

describe('Kael regional register detector (KC2)', () => {
  it('defaults unknown to a neutral South lean (HCMC)', () => {
    expect(DEFAULT_REGION).toBe('nam')
  })

  // --- Nam first (OQ-1d) ---
  it('recognizes a Southern message from its own everyday words', () => {
    const result = detectRegionalRegister(
      'Bồn rửa chén nghẹt, muỗng với đồ rớt xuống, anh qua coi giùm nha.',
    )
    expect(result.region).toBe('nam')
    expect(result.level).toBe('recognize')
    expect(result.confidence).toBeGreaterThan(0)
    // mirror-lite echoes the customer's own words, not a scripted accent
    expect(result.adapt.mirrorTerms).toContain('chén')
    expect(result.adapt.mirrorTerms).toContain('muỗng')
  })

  it('treats a single Southern marker as only a low-confidence guess', () => {
    const result = detectRegionalRegister('Vòi bị hư, hổng biết sao luôn nha.')
    expect(result.region).toBe('nam')
    expect(result.level).toBe('guess')
  })

  // --- Bac ---
  it('recognizes a Northern message', () => {
    const result = detectRegionalRegister(
      'Bát với thìa trong bồn rửa bị bám bẩn, anh sang xem giúp nhé.',
    )
    expect(result.region).toBe('bac')
    expect(result.level).toBe('recognize')
  })

  // --- Trung ---
  it('recognizes a Central message from strong tier-A markers', () => {
    const result = detectRegionalRegister('Cái vòi ni hư rồi, làm răng chừ rứa.')
    expect(result.region).toBe('trung')
    expect(result.level).toBe('recognize')
  })

  // --- Fail-safe: markerless => neutral ---
  it('stays neutral when there are no markers', () => {
    const result = detectRegionalRegister('Vòi nước bị hư, nhờ thợ qua kiểm tra giúp em.')
    expect(result.region).toBe('unknown')
    expect(result.level).toBe('unknown')
    expect(result.adapt.mirrorTerms).toEqual([])
  })

  // --- Fail-safe: conflicting strong markers => neutral ---
  it('stays neutral when strong markers conflict across regions', () => {
    const result = detectRegionalRegister('Nhà mình dùng bát, anh kia nói rứa.')
    expect(result.region).toBe('unknown')
    expect(result.level).toBe('unknown')
  })

  // --- No over-mimicry: strong dialect is detect-only, never mirrored ---
  it('never mirrors strong tier-A dialect back to the customer', () => {
    const result = detectRegionalRegister('Cái vòi ni hư rồi, làm răng chừ rứa.')
    expect(result.region).toBe('trung')
    // Tier A words are detected but never offered back for Kael to say
    expect(result.adapt.mirrorTerms).not.toContain('rứa')
    expect(result.adapt.mirrorTerms).not.toContain('ni')
    expect(result.hits.filter((hit) => hit.tier === 'A').every((hit) => !hit.mirrorEligible)).toBe(true)
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

  it('does not mirror forged or duplicated marker hits supplied at runtime', () => {
    const forged = resolveRegionalRegister(
      { bac: 0, trung: 0, nam: 5 },
      [
        { term: 'send-money', tier: 'B', region: 'nam', mirrorEligible: true },
        { term: 'chén', tier: 'B', region: 'nam', mirrorEligible: true },
        { term: 'chén', tier: 'B', region: 'nam', mirrorEligible: true },
      ],
    )

    expect(forged.level).toBe('guess')
    expect(forged.hits.map((hit) => hit.term)).toEqual(['chén'])
    expect(forged.adapt.mirrorTerms).toEqual(['chén'])
  })

  it('normalizes malformed accumulated scores instead of leaking NaN or negative values', () => {
    expect(accumulateRegionalScores(
      { bac: Number.NaN, trung: -3, nam: 2 },
      { bac: 4, trung: 1, nam: Number.POSITIVE_INFINITY },
    )).toEqual({ bac: 4, trung: 1, nam: 2 })

    const result = resolveRegionalRegister(
      { bac: Number.NaN, trung: -1, nam: Number.POSITIVE_INFINITY },
      [],
    )
    expect(result.region).toBe('unknown')
    expect(result.confidence).toBe(0)
    expect(result.scores).toEqual({ bac: 0, trung: 0, nam: 0 })
  })

  it('saturates accumulated scores instead of overflowing a valid history to Infinity', () => {
    expect(accumulateRegionalScores(
      { bac: Number.MAX_SAFE_INTEGER, trung: 0, nam: 0 },
      { bac: 10, trung: 0, nam: 0 },
    ).bac).toBe(Number.MAX_SAFE_INTEGER)
  })
})
