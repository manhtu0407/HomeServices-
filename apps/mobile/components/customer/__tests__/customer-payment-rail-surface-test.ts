import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  it('uses a solid receipt surface and an isolated QR frame', () => {
    expect(paymentRailSurface).toContain('backgroundColor: tokens.raised')
    expect(paymentRailSurface).toContain("backgroundColor: '#ffffff'")
    expect(paymentRailSurface).toContain('const QR_BOX_SIZE = 256')
    expect(paymentRailSurface).not.toContain('useSharedValue')
  })

  it('requires a direct-payment response from the customer without legacy cash authority', () => {
    expect(paymentRailSurface).toContain("deal.payment?.provider === 'direct_worker'")
    expect(paymentRailSurface).toContain('customer-v21-case-direct-payment-confirm')
    expect(paymentRailSurface).toContain('customer-v21-case-direct-payment-problem')
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
