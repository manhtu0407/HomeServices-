import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')
// Reads throw on a missing file on purpose: the negative assertions below would
// pass vacuously against an empty string, which is worse than a hard failure.
const read = (relative: string) => readFileSync(join(root, relative), 'utf8')

describe('SePay VietQR production payment rail', () => {
  const edgeFunction = read('supabase/functions/sepay-webhook/index.ts')
  const paymentService = read('supabase/functions/mobile-api/_shared/domains/payment/sepay-vietqr.ts')

  it('keeps the public callback behind HMAC verification over bounded raw JSON', () => {
    expect(edgeFunction).toContain('readJsonTextRequestBounded')
    expect(edgeFunction).toContain('receiveSePayVietQrWebhook')
    expect(edgeFunction).toContain('x-sepay-signature')
    expect(edgeFunction).toContain('x-sepay-timestamp')
    expect(edgeFunction).not.toContain('request.json()')
    expect(edgeFunction).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:rawBody|raw_body|payment_transfer_content)/)
  })

  it('does not apply the new-intent kill switch to verified provider reconciliation', () => {
    expect(edgeFunction).not.toContain('assertHarnessCapabilityEnabled')
    expect(edgeFunction).not.toContain('payment_sepay')
  })

  it('has an explicitly configured JWT-free provider boundary only', () => {
    const config = read('supabase/config.toml')
    const section = config.split('[functions.sepay-webhook]')[1]?.split('[')[0] ?? ''
    const deno = read('supabase/functions/sepay-webhook/deno.json')

    expect(section).toContain('verify_jwt = false')
    expect(deno).toContain('"zod": "npm:zod@4.4.3"')
  })

  it('keeps the provider implementation name out of customer-visible API failures', () => {
    expect(paymentService).not.toContain('Công việc không dùng thanh toán SePay VietQR.')
  })
})
