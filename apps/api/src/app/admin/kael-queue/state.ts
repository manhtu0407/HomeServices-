export type AdminKaelQueueItem = {
  id: string
  job_id: string | null
  queue_type: string
  priority: string
  status: string
  escalation_level: string | null
  reason_code: string
  response_summary: string | null
  safe_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
}

export type AdminKaelQueueState = {
  activeRequestId: number | null
  bearerToken: string
  error: string | null
  items: AdminKaelQueueItem[]
  limit: number
  loading: boolean
  nextPage: number | null
  notes: Record<string, string>
  notice: string | null
  ownerVersion: number
  page: number
  resolvingId: string | null
}

export type AdminKaelQueueAction =
  | { type: 'tokenChanged'; value: string }
  | { type: 'loadStarted'; ownerVersion: number; requestId: number }
  | {
      type: 'loadSucceeded'
      items: AdminKaelQueueItem[]
      limit: number
      nextPage: number | null
      ownerVersion: number
      page: number
      requestId: number
    }
  | { type: 'loadFailed'; error: string; ownerVersion: number; requestId: number }
  | { type: 'noteChanged'; id: string; value: string }
  | { type: 'resolveStarted'; id: string; ownerVersion: number }
  | { type: 'resolveSucceeded'; id: string; item: AdminKaelQueueItem; ownerVersion: number }
  | { type: 'resolveFailed'; error: string; ownerVersion: number }
  | { type: 'validationFailed'; error: string }

export function createAdminKaelQueueState(): AdminKaelQueueState {
  return {
    activeRequestId: null,
    bearerToken: '',
    error: null,
    items: [],
    limit: 30,
    loading: false,
    nextPage: null,
    notes: {},
    notice: null,
    ownerVersion: 0,
    page: 1,
    resolvingId: null,
  }
}

export function adminKaelQueueReducer(
  state: AdminKaelQueueState,
  action: AdminKaelQueueAction,
): AdminKaelQueueState {
  switch (action.type) {
    case 'tokenChanged':
      if (action.value === state.bearerToken) return state
      return { ...createAdminKaelQueueState(), bearerToken: action.value, ownerVersion: state.ownerVersion + 1 }
    case 'loadStarted':
      if (action.ownerVersion !== state.ownerVersion) return state
      return { ...state, activeRequestId: action.requestId, error: null, loading: true, notice: null }
    case 'loadSucceeded':
      if (action.ownerVersion !== state.ownerVersion || action.requestId !== state.activeRequestId) return state
      return {
        ...state,
        activeRequestId: null,
        error: null,
        items: action.items,
        limit: action.limit,
        loading: false,
        nextPage: action.nextPage,
        page: action.page,
      }
    case 'loadFailed':
      if (action.ownerVersion !== state.ownerVersion || action.requestId !== state.activeRequestId) return state
      return { ...state, activeRequestId: null, error: action.error, loading: false }
    case 'noteChanged':
      return { ...state, notes: { ...state.notes, [action.id]: action.value } }
    case 'resolveStarted':
      if (action.ownerVersion !== state.ownerVersion) return state
      return { ...state, error: null, notice: null, resolvingId: action.id }
    case 'resolveSucceeded':
      if (action.ownerVersion !== state.ownerVersion || action.id !== state.resolvingId) return state
      return {
        ...state,
        items: state.items.map((item) => item.id === action.id ? action.item : item),
        notice: 'Đã xử lý mục hàng đợi Kael.',
        resolvingId: null,
      }
    case 'resolveFailed':
      if (action.ownerVersion !== state.ownerVersion) return state
      return { ...state, error: action.error, resolvingId: null }
    case 'validationFailed':
      return { ...state, error: action.error }
  }
}
