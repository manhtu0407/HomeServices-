import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// What the payment rail renders — the receipt surface, the QR frame, the confirm
// and problem actions — is covered by the surface tests that mount it. What
// survives as a file read is absence: a removed cash authority, an animation the
// receipt must not regain, and a provider or infrastructure name that must never
// reach customer-facing copy. None of those render anything to assert against.
const mobileRoot = join(process.cwd())
const paymentRailSurface = readFileSync(
  join(mobileRoot, 'components/customer/kael-chat/customer-payment-rail-surface.tsx'),
  'utf8',
)
const paymentResponseModel = readFileSync(
  join(mobileRoot, 'components/customer/kael-chat/case-work-response-model.ts'),
  'utf8',
)
const paymentDisplayModel = readFileSync(
  join(mobileRoot, 'components/customer/kael-chat/case-work-display-model.ts'),
  'utf8',
)

describe('CustomerPaymentRailSurface', () => {
  it('keeps the receipt static and free of legacy cash authority', () => {
    expect(paymentRailSurface).not.toContain('useSharedValue')
    expect(paymentRailSurface).not.toContain('cash_confirmed')
  })

  it('keeps provider and infrastructure names out of customer-facing payment copy', () => {
    const customerPaymentSources = [
      paymentRailSurface,
      paymentResponseModel,
      paymentDisplayModel,
    ].join('\n')

    expect(customerPaymentSources).not.toMatch(/['"`][^'"`\n]*\bSePay\b[^'"`\n]*['"`]/)
    expect(customerPaymentSources).not.toMatch(/['"`][^'"`\n]*\bBackend\b[^'"`\n]*['"`]/)
  })
})
