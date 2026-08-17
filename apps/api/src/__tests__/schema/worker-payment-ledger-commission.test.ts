import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')
const read = (relative: string) => readFileSync(join(root, relative), 'utf8')

describe('worker commission policy', () => {
  // The rate is duplicated across the Node and Deno runtimes because neither can
  // import the other's module graph. Nothing but this check keeps them equal.
  it('declares the same base commission rate in shared constants and edge contracts', () => {
    expect(read('packages/shared/src/constants.ts')).toContain('export const PLATFORM_FEE_WORKER = 0.15')
    expect(read('supabase/functions/_shared/contracts/common.ts')).toContain(
      'export const PLATFORM_FEE_WORKER = 0.15;',
    )
  })

  it('leaves commission arithmetic and ledger writes to the database RPC', () => {
    const paymentService = read('supabase/functions/mobile-api/_shared/domains/payment/sepay-vietqr.ts')

    expect(paymentService).toContain('client.rpc("create_worker_vietqr_payment_intent"')
    expect(paymentService).toContain('p_expected_gross_amount')
    expect(paymentService).not.toContain('PLATFORM_FEE_WORKER')
    expect(paymentService).not.toContain('.from("jobs")\n       .update(payment)')
  })
})
