import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8')

describe('customer refund-account persistence schema', () => {
  it('routes refund-account writes through the RPC and never returns raw financial data', () => {
    const service = read('supabase/functions/mobile-api/_shared/domains/customer/refund-account.ts')

    expect(service).toContain('upsert_customer_refund_payment_method')
    expect(service).toContain('bank_account_masked')
    expect(service).not.toContain('console.')
    expect(service).not.toContain('select("*")')
  })
})
