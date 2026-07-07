import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REGION,
  detectRegionalRegister,
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
})
