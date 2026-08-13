import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { customerV21BookingStyles } from '../../customer/booking/booking-styles'
import { customerV21PaymentStyles } from '../../customer/ui/payment-styles'

const COMPONENTS_ROOT = join(__dirname, '..', '..')
const LEGACY_PROPS = ['shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius']

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      found.push(full)
    }
  }
  return found
}

describe('shadow contract guard', () => {
  // A source-level guard so the contract holds even without react-doctor installed. The 106
  // sites this replaced drew no shadow at all on Android, which no unit test would have caught.
  it('has no legacy one-platform shadow prop left anywhere under components/', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(COMPONENTS_ROOT)) {
      const source = readFileSync(file, 'utf8')
      for (const prop of LEGACY_PROPS) {
        const pattern = new RegExp(`^\\s*${prop}:`, 'm')
        if (pattern.test(source)) {
          offenders.push(`${file.slice(COMPONENTS_ROOT.length + 1)} → ${prop}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps a shadow on the surfaces the migration was for', () => {
    // Payment and booking are two of the six priority screens. If a conversion had dropped a
    // shadow rather than translated it, these counts would fall.
    const withShadow = (styles: Record<string, unknown>) =>
      Object.values(styles).filter((style) => {
        const flat = style as Record<string, unknown>
        return typeof flat?.boxShadow === 'string' && flat.boxShadow !== 'none'
      }).length

    expect(withShadow(customerV21PaymentStyles as Record<string, unknown>)).toBeGreaterThanOrEqual(15)
    expect(withShadow(customerV21BookingStyles as Record<string, unknown>)).toBeGreaterThanOrEqual(13)
  })

  it('emits a parseable boxShadow for every style that declares one', () => {
    const processBoxShadow = require('react-native/Libraries/StyleSheet/processBoxShadow').default
    for (const styles of [customerV21PaymentStyles, customerV21BookingStyles]) {
      for (const [name, style] of Object.entries(styles as Record<string, Record<string, unknown>>)) {
        const value = style?.boxShadow
        if (typeof value !== 'string' || value === 'none') continue
        // An unparseable string yields [] — the shadow would silently vanish on both platforms.
        expect(`${name}:${processBoxShadow(value).length}`).toBe(`${name}:1`)
      }
    }
  })
})
