import { describe, expect, it } from 'vitest'
import {
  adminLearningReducer,
  createAdminLearningState,
  type AdminLearningCandidate,
} from '@/app/admin/kael-learning/state'

const candidate: AdminLearningCandidate = {
  affected_district: null,
  affected_problem: null,
  affected_service: 'electrical',
  audit_reason: null,
  candidate_type: 'service_knowledge_candidate',
  confidence: 0.8,
  created_at: '2026-07-14T00:00:00.000Z',
  evidence_count: 3,
  evidence_snapshot: null,
  id: 'candidate-1',
  status: 'manual_review',
  suggested_payload: {},
}

describe('admin learning state', () => {
  it('preserves an action success notice through its follow-up list refresh', () => {
    let state = createAdminLearningState()
    state = adminLearningReducer(state, { type: 'tokenChanged', bearerToken: 'admin-token' })
    state = adminLearningReducer(state, {
      type: 'actionStarted',
      candidateId: candidate.id,
      ownerVersion: state.ownerVersion,
      requestId: 1,
    })
    state = adminLearningReducer(state, {
      type: 'actionSucceeded',
      notice: 'Đã duyệt đề xuất candidate-1.',
      ownerVersion: state.ownerVersion,
      requestId: 1,
    })
    state = adminLearningReducer(state, {
      type: 'loadStarted',
      clearNotice: false,
      ownerVersion: state.ownerVersion,
      requestId: 1,
    })
    state = adminLearningReducer(state, {
      type: 'loadSucceeded',
      candidates: [],
      ownerVersion: state.ownerVersion,
      requestId: 1,
    })

    expect(state.notice).toBe('Đã duyệt đề xuất candidate-1.')
    expect(state.loading).toBe(false)
  })

  it('atomically clears prior-session data and ignores its late response when the token changes', () => {
    let state = createAdminLearningState()
    state = adminLearningReducer(state, { type: 'tokenChanged', bearerToken: 'token-a' })
    const ownerA = state.ownerVersion
    state = adminLearningReducer(state, {
      type: 'loadStarted',
      clearNotice: true,
      ownerVersion: ownerA,
      requestId: 1,
    })
    state = adminLearningReducer(state, { type: 'tokenChanged', bearerToken: 'token-b' })
    state = adminLearningReducer(state, {
      type: 'loadSucceeded',
      candidates: [candidate],
      ownerVersion: ownerA,
      requestId: 1,
    })

    expect(state).toEqual(expect.objectContaining({
      bearerToken: 'token-b',
      candidates: [],
      error: null,
      loading: false,
      notice: null,
      rejectReasons: {},
    }))
  })
})
