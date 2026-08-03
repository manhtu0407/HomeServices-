import { describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import {
  getCustomerRefundAccount,
  saveCustomerRefundAccount,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/refund-account'

const savedRow = {
  bank_account_masked: '**** 6789',
  bank_key: 'techcombank',
  bank_name: 'Techcombank',
  id: 'refund-account-1',
  is_default: true,
  status: 'pending_verification',
  updated_at: '2026-07-28T00:00:00.000Z',
  verified_at: null,
}

function context(options: {
  readResult?: { data: Record<string, unknown> | null; error: { code?: string } | null }
  rpcResult?: { data: Record<string, unknown>[] | null; error: { code?: string } | null }
} = {}) {
  const maybeSingle = vi.fn(async () => options.readResult ?? { data: savedRow, error: null })
  const eq = vi.fn(() => ({ eq, maybeSingle, select }))
  const select = vi.fn(() => ({ eq, maybeSingle, select }))
  const from = vi.fn(() => ({ eq, maybeSingle, select }))
  const rpc = vi.fn(async () => options.rpcResult ?? { data: [savedRow], error: null })
  const ctx: MobileApiContext = {
    success: true,
    user: { id: '11111111-1111-4111-8111-111111111111' },
    role: 'customer',
    supabase: { from, rpc },
  }

  return { ctx, from, maybeSingle, rpc, select }
}

describe('mobile-api customer refund account persistence', () => {
  it('reads only the current customer default record and never selects the raw bank account', async () => {
    const { ctx, from, select } = context()

    await expect(getCustomerRefundAccount(ctx)).resolves.toEqual({ refund_account: savedRow })

    expect(from).toHaveBeenCalledWith('customer_payment_methods')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('bank_account_masked'))
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('bank_account,'))
  })

  it('accepts raw account input only at the atomic RPC and returns the masked persisted record', async () => {
    const { ctx, rpc } = context()

    await expect(saveCustomerRefundAccount(ctx, {
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
    })).resolves.toEqual({ refund_account: savedRow })

    expect(rpc).toHaveBeenCalledWith('upsert_customer_refund_payment_method', {
      p_account_holder_name: 'PHAN MANH TU',
      p_bank_account: '123456789',
      p_bank_key: 'techcombank',
      p_customer_id: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('fails closed when the database cannot return a persisted refund-account row', async () => {
    const { ctx } = context({ rpcResult: { data: [], error: null } })

    await expect(saveCustomerRefundAccount(ctx, {
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
    })).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })
})
