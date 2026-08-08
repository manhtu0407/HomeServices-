import { describe, expect, it } from 'vitest'

import {
  adminKaelQueueReducer,
  createAdminKaelQueueState,
  type AdminKaelQueueItem,
} from '@/app/admin/kael-queue/state'

const item: AdminKaelQueueItem = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  job_id: null,
  queue_type: 'demanding_customer',
  priority: 'high',
  status: 'open',
  escalation_level: 'hard',
  reason_code: 'high_stakes',
  response_summary: 'Needs review.',
  safe_metadata: {},
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
}

describe('Kael queue admin state', () => {
  it('clears prior-session data and ignores a late response after token ownership changes', () => {
    let state = createAdminKaelQueueState()
    state = adminKaelQueueReducer(state, { type: 'tokenChanged', value: 'token-a' })
    const ownerA = state.ownerVersion
    state = adminKaelQueueReducer(state, { type: 'loadStarted', ownerVersion: ownerA, requestId: 1 })
    state = adminKaelQueueReducer(state, { type: 'tokenChanged', value: 'token-b' })
    state = adminKaelQueueReducer(state, {
      type: 'loadSucceeded', items: [item], limit: 30, nextPage: null, ownerVersion: ownerA, page: 1, requestId: 1,
    })

    expect(state).toEqual(expect.objectContaining({
      bearerToken: 'token-b',
      items: [],
      loading: false,
      error: null,
    }))
  })

  it('replaces a resolved row without mutating unrelated queue items', () => {
    const other = { ...item, id: '223e4567-e89b-42d3-a456-426614174000' }
    let state = { ...createAdminKaelQueueState(), items: [item, other] }
    state = adminKaelQueueReducer(state, { type: 'resolveStarted', id: item.id, ownerVersion: state.ownerVersion })
    state = adminKaelQueueReducer(state, {
      type: 'resolveSucceeded',
      id: item.id,
      item: { ...item, status: 'resolved', resolution_note: 'Reviewed safely.' },
      ownerVersion: state.ownerVersion,
    })

    expect(state.items[0]).toMatchObject({ status: 'resolved', resolution_note: 'Reviewed safely.' })
    expect(state.items[1]).toEqual(other)
    expect(state.notice).toBe('Đã xử lý mục hàng đợi Kael.')
  })
})
