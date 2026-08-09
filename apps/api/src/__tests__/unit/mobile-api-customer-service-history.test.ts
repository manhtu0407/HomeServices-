import { describe, expect, it } from 'vitest'

import { projectCustomerServiceHistoryRows } from '../../../../../supabase/functions/mobile-api/_shared/domains/job/read'

describe('customer service history projection', () => {
  it('returns only deal summary and safe worker fields with favorite state', () => {
    const result = projectCustomerServiceHistoryRows(
      [{
        cancelled_at: null,
        completed_at: '2026-07-13T08:45:00.000Z',
        created_at: '2026-07-13T07:00:00.000Z',
        customer_id: 'customer-private',
        description: 'private job description',
        final_price: '320000',
        id: 'job-1',
        paid_at: '2026-07-13T08:52:00.000Z',
        reviewed_at: null,
        service_type: 'electrical',
        status: 'paid',
        worker_id: 'worker-1',
      }],
      new Map([[
        'worker-1',
        {
          avatar_url: 'https://example.test/worker.png',
          email: 'private@example.test',
          full_name: 'Anh Minh',
          id: 'worker-1',
        },
      ]]),
      new Set(['worker-1']),
    )

    expect(result).toEqual([{
      ended_at: '2026-07-13T08:52:00.000Z',
      final_price: 320000,
      id: 'job-1',
      service_type: 'electrical',
      status: 'paid',
      worker: {
        avatar_url: 'https://example.test/worker.png',
        display_name: 'Anh Minh',
        id: 'worker-1',
        is_favorite: true,
      },
    }])
    expect(result[0]).not.toHaveProperty('description')
    expect(result[0]).not.toHaveProperty('customer_id')
    expect(result[0]?.worker).not.toHaveProperty('email')
  })

  it('keeps cancelled deals honest when there is no assigned worker or final price', () => {
    const result = projectCustomerServiceHistoryRows(
      [{
        cancelled_at: '2026-07-03T12:00:00.000Z',
        completed_at: null,
        created_at: '2026-07-03T11:00:00.000Z',
        final_price: null,
        id: 'job-2',
        paid_at: null,
        reviewed_at: null,
        service_type: 'cleaning',
        status: 'cancelled',
        worker_id: null,
      }],
      new Map(),
      new Set(),
    )

    expect(result[0]).toMatchObject({
      ended_at: '2026-07-03T12:00:00.000Z',
      final_price: null,
      worker: null,
    })
  })
})
