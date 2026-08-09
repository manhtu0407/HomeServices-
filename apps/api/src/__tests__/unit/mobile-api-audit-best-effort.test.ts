import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  logJobEvent,
  logMemoryAudit,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/audit'
import type { DbClient } from '../../../../../supabase/functions/mobile-api/_shared/platform/db'

describe('mobile-api best-effort audit visibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when Supabase rejects a job-event audit row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = errorClient('JOB_EVENT_UNAVAILABLE')

    await logJobEvent(client, 'job-1', 'estimate_ready', {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }, 'analyzing', 'broadcasting')

    expect(warn).toHaveBeenCalledWith('mobile-api job event log failed', {
      jobId: 'job-1',
      eventType: 'estimate_ready',
    })
  })

  it('warns when Supabase rejects a memory-audit row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = errorClient('MEMORY_AUDIT_UNAVAILABLE')

    await logMemoryAudit(client, {
      subjectType: 'customer',
      subjectId: 'customer-1',
      actorId: 'customer-1',
      operation: 'read',
      layer: 'L3',
      purpose: 'customer_assistant',
    })

    expect(warn).toHaveBeenCalledWith('mobile-api kael memory audit failed', {
      subjectType: 'customer',
      operation: 'read',
    })
  })
})

function errorClient(code: string): DbClient {
  const query = {
    insert() {
      return query
    },
    then<TResult1 = { data: null; error: { code: string } }, TResult2 = never>(
      onfulfilled?: ((value: { data: null; error: { code: string } }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: null, error: { code } }).then(onfulfilled, onrejected)
    },
  }
  return {
    from() {
      return query
    },
  } as unknown as DbClient
}
