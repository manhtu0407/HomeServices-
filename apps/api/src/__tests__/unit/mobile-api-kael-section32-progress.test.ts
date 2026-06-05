import { describe, expect, it, vi } from 'vitest'

import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/services'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

const ownerCtx: MobileApiContext = {
  success: true,
  role: 'customer',
  user: { id: 'customer-1' },
  supabase: null,
}

function ctxWithClient(client: unknown): MobileApiContext {
  return { ...ownerCtx, supabase: client }
}

function singleRowClient(row: Record<string, unknown> | null) {
  return {
    from(table: string) {
      expect(table).toBe('kael_chat_sessions')
      return {
        select(columns: string) {
          expect(columns).toBe('id, customer_id, kael_progress')
          return this
        },
        eq(column: string, value: unknown) {
          expect(column).toBe('id')
          expect(value).toBe('session-1')
          return this
        },
        single() {
          return Promise.resolve({
            data: row,
            error: row ? null : { code: 'PGRST116', message: 'not found' },
          })
        },
      }
    },
  }
}

describe('Plan §32 Kael chat progress service', () => {
  it('returns schema-valid session progress for the owning customer', async () => {
    const progress = {
      current_stage: 'market_lookup',
      status: 'running',
      progress: 0.32,
      failure_reason: null,
      updated_at: '2026-06-04T00:00:00.000Z',
    }
    const services = createEdgeServices({})

    const result = await services.getKaelChatProgress(
      ctxWithClient(singleRowClient({
        id: 'session-1',
        customer_id: 'customer-1',
        kael_progress: progress,
      })),
      'session-1',
    )

    expect(result).toEqual({ session_id: 'session-1', progress })
  })

  it('hides another customer session behind NOT_FOUND', async () => {
    const services = createEdgeServices({})

    await expect(services.getKaelChatProgress(
      ctxWithClient(singleRowClient({
        id: 'session-1',
        customer_id: 'customer-2',
        kael_progress: null,
      })),
      'session-1',
    )).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('returns null progress instead of leaking invalid telemetry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const services = createEdgeServices({})

    const result = await services.getKaelChatProgress(
      ctxWithClient(singleRowClient({
        id: 'session-1',
        customer_id: 'customer-1',
        kael_progress: {
          current_stage: 'market_lookup',
          status: 'running',
          progress: 2,
          updated_at: '2026-06-04T00:00:00.000Z',
        },
      })),
      'session-1',
    )

    expect(result).toEqual({ session_id: 'session-1', progress: null })
    expect(warn).toHaveBeenCalledWith('mobile-api Kael progress invalid', { contextId: 'session-1' })
    warn.mockRestore()
  })
})
