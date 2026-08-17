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

  it('provides one shared set of twenty English greetings for both locales', () => {
    const greetings = Object.values(roleGateGreetingVariants).flat()
    const english = Object.values(roleGateGreetingVariantsByLanguage.en).flat()

    expect(greetings).toHaveLength(20)
    expect(new Set(greetings.map((greeting) => greeting.headline)).size).toBe(20)
    expect(greetings).toEqual(english)
    for (const greeting of greetings) {
      expect(greeting.headline.trim()).not.toHaveLength(0)
      expect(greeting.headline.length).toBeLessThanOrEqual(48)
      expect(greeting.headline).toMatch(/[.!]$/)
    }
  })

  it('returns the same English greeting for vi and en', () => {
    const vietnameseLocale = Object.values(roleGateGreetingVariantsByLanguage.vi).flat()
    const englishLocale = Object.values(roleGateGreetingVariantsByLanguage.en).flat()

    expect(vietnameseLocale).toHaveLength(20)
    expect(englishLocale).toHaveLength(20)
    expect(vietnameseLocale).toEqual(englishLocale)
    expect(selectRoleGateGreeting(new Date(2026, 6, 12, 6), () => 0, 'vi')).toEqual(
      selectRoleGateGreeting(new Date(2026, 6, 12, 6), () => 0, 'en'),
    )
  })
})
