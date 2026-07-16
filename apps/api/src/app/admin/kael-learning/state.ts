import type { AdminLearningService } from './client'

export type AdminLearningCandidate = {
  id: string
  candidate_type: string
  affected_service: AdminLearningService | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: string
  audit_reason: string | null
  created_at: string
  suggested_payload: Record<string, unknown>
  evidence_snapshot: Record<string, unknown> | null
}

type ActiveAction = {
  candidateId: string
  requestId: number
} | null

export type AdminLearningState = {
  activeAction: ActiveAction
  activeLoadRequestId: number | null
  bearerToken: string
  candidates: AdminLearningCandidate[]
  error: string | null
  loading: boolean
  notice: string | null
  ownerVersion: number
  rejectReasons: Record<string, string>
}

type OwnedRequest = {
  ownerVersion: number
  requestId: number
}

export type AdminLearningAction =
  | { type: 'tokenChanged'; bearerToken: string }
  | ({ type: 'loadStarted'; clearNotice: boolean } & OwnedRequest)
  | ({ type: 'loadSucceeded'; candidates: AdminLearningCandidate[] } & OwnedRequest)
  | ({ type: 'loadFailed'; error: string } & OwnedRequest)
  | ({ type: 'actionStarted'; candidateId: string } & OwnedRequest)
  | ({ type: 'actionSucceeded'; clearRejectReasonFor?: string; notice: string } & OwnedRequest)
  | ({ type: 'actionFailed'; error: string } & OwnedRequest)
  | ({ type: 'actionFinished' } & OwnedRequest)
  | { type: 'rejectReasonChanged'; candidateId: string; text: string }
  | { type: 'validationFailed'; error: string }

export function createAdminLearningState(): AdminLearningState {
  return {
    activeAction: null,
    activeLoadRequestId: null,
    bearerToken: '',
    candidates: [],
    error: null,
    loading: false,
    notice: null,
    ownerVersion: 0,
    rejectReasons: {},
  }
}

export function adminLearningReducer(
  state: AdminLearningState,
  action: AdminLearningAction,
): AdminLearningState {
  switch (action.type) {
    case 'tokenChanged':
      if (action.bearerToken === state.bearerToken) return state
      return {
        ...createAdminLearningState(),
        bearerToken: action.bearerToken,
        ownerVersion: state.ownerVersion + 1,
      }
    case 'loadStarted':
      if (action.ownerVersion !== state.ownerVersion) return state
      return {
        ...state,
        activeLoadRequestId: action.requestId,
        error: null,
        loading: true,
        notice: action.clearNotice ? null : state.notice,
      }
    case 'loadSucceeded':
      if (!ownsLoadRequest(state, action)) return state
      return {
        ...state,
        activeLoadRequestId: null,
        candidates: action.candidates,
        error: null,
        loading: false,
      }
    case 'loadFailed':
      if (!ownsLoadRequest(state, action)) return state
      return {
        ...state,
        activeLoadRequestId: null,
        error: action.error,
        loading: false,
      }
    case 'actionStarted':
      if (action.ownerVersion !== state.ownerVersion) return state
      return {
        ...state,
        activeAction: { candidateId: action.candidateId, requestId: action.requestId },
        error: null,
        notice: null,
      }
    case 'actionSucceeded': {
      if (!ownsActionRequest(state, action)) return state
      if (!action.clearRejectReasonFor) {
        return { ...state, error: null, notice: action.notice }
      }
      const rejectReasons = { ...state.rejectReasons }
      delete rejectReasons[action.clearRejectReasonFor]
      return { ...state, error: null, notice: action.notice, rejectReasons }
    }
    case 'actionFailed':
      if (!ownsActionRequest(state, action)) return state
      return { ...state, error: action.error }
    case 'actionFinished':
      if (!ownsActionRequest(state, action)) return state
      return { ...state, activeAction: null }
    case 'rejectReasonChanged':
      return {
        ...state,
        rejectReasons: { ...state.rejectReasons, [action.candidateId]: action.text },
      }
    case 'validationFailed':
      return { ...state, error: action.error }
  }
}

function ownsLoadRequest(state: AdminLearningState, request: OwnedRequest) {
  return state.ownerVersion === request.ownerVersion &&
    state.activeLoadRequestId === request.requestId
}

function ownsActionRequest(state: AdminLearningState, request: OwnedRequest) {
  return state.ownerVersion === request.ownerVersion &&
    state.activeAction?.requestId === request.requestId
}
