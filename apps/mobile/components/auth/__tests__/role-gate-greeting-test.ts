import {
  roleGateGreetingVariants,
  roleGateGreetingVariantsByLanguage,
  selectRoleGateGreeting,
} from '../entry-access/role-gate-greeting'

describe('role gate greeting', () => {
  it.each([
    ['morning', 6],
    ['midday', 11],
    ['afternoon', 14],
    ['evening', 18],
    ['evening', 2],
  ] as const)('selects a %s greeting for hour %s', (period, hour) => {
    const greeting = selectRoleGateGreeting(new Date(2026, 6, 12, hour), () => 0)

    expect(greeting).toEqual(roleGateGreetingVariants[period][0])
  })

  it('keeps selection inside the current time period when random reaches its upper bound', () => {
    const greeting = selectRoleGateGreeting(new Date(2026, 6, 12, 16), () => 1)
    const variants = roleGateGreetingVariants.afternoon

    expect(greeting).toEqual(variants[variants.length - 1])
  })

  it('provides twenty distinct, bounded Vietnamese greetings', () => {
    const greetings = Object.values(roleGateGreetingVariantsByLanguage.vi).flat()

    expect(greetings).toHaveLength(20)
    expect(new Set(greetings.map((greeting) => greeting.headline)).size).toBe(20)
    for (const greeting of greetings) {
      expect(greeting.headline.trim()).not.toHaveLength(0)
      expect(greeting.headline.length).toBeLessThanOrEqual(48)
      expect(greeting.headline).toMatch(/[.!?]$/)
      expect(greeting.headline).toMatch(/[À-ỹ]/u)
    }
  })

  it('keeps Vietnamese and English greeting catalogs separate', () => {
    const vietnameseLocale = Object.values(roleGateGreetingVariantsByLanguage.vi).flat()
    const englishLocale = Object.values(roleGateGreetingVariantsByLanguage.en).flat()
    const englishHeadlines = new Set(englishLocale.map((greeting) => greeting.headline))

    expect(vietnameseLocale).toHaveLength(20)
    expect(englishLocale).toHaveLength(20)
    expect(vietnameseLocale.every((greeting) => !englishHeadlines.has(greeting.headline))).toBe(true)
    expect(selectRoleGateGreeting(new Date(2026, 6, 12, 6), () => 0, 'vi')).not.toEqual(
      selectRoleGateGreeting(new Date(2026, 6, 12, 6), () => 0, 'en'),
    )
  })
})
