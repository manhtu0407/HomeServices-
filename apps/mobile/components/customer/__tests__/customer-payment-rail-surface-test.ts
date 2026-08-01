import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mobileRoot = join(process.cwd())
const paymentRailSurface = readFileSync(
  join(mobileRoot, 'components/customer/v21/customer-payment-rail-surface.tsx'),
  'utf8',
)
const paymentResponseModel = readFileSync(
  join(mobileRoot, 'components/customer/v21/case-work-response-model.ts'),
  'utf8',
)
const paymentDisplayModel = readFileSync(
  join(mobileRoot, 'components/customer/v21/case-work-display-model.ts'),
  'utf8',
)

describe('CustomerPaymentRailSurface', () => {
  it('uses the standard Mint Aura behind the payment card without affecting the QR frame', () => {
    expect(paymentRailSurface).toContain("import { CaseWideMintAura } from './aura-surfaces'")
    expect(paymentRailSurface).toContain('<CaseWideMintAura')
    expect(paymentRailSurface).toContain('testID={`${testID}-mint-aura`}')
    expect(paymentRailSurface).toContain('style={styles.surfaceContent}')
    expect(paymentRailSurface).toContain("backgroundColor: '#ffffff'")
    expect(paymentRailSurface).not.toContain('useSharedValue')
  })

  it('shows a recorded cash receipt without adding a customer cash-confirmation action', () => {
    expect(paymentRailSurface).toContain("deal.payment?.provider === 'cash' && deal.payment.status === 'cash_confirmed'")
    expect(paymentRailSurface).toContain('customer-v21-case-cash-payment-confirmed')
    expect(paymentRailSurface).not.toContain('customer-v21-case-cash-payment-action')
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
