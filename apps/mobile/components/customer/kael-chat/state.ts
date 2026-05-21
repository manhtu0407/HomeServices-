import { type ServiceType } from '@home-services/shared'
import { type KaelChatResponse } from '@/lib/api-types'

export type KaelChatState = {
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  draft: string
  addressLabel: string
  loading: boolean
  sending: boolean
  confirming: boolean
  confirmArmed: boolean
  error: string | null
  confirmedMessage: string | null
}

export type KaelChatAction =
  | { type: 'syncRouteService'; service: ServiceType | null; routeSessionId?: string }
  | { type: 'applyPendingDraft'; service: ServiceType | null; message: string }
  | { type: 'loadSessionStarted' }
  | { type: 'loadSessionSucceeded'; session: KaelChatResponse }
  | { type: 'loadSessionFailed'; error: string }
  | { type: 'selectService'; service: ServiceType }
  | { type: 'setAddress'; value: string }
  | { type: 'setDraft'; value: string; clearTransientError: boolean }
  | { type: 'showTransientError'; error: string }
  | { type: 'sendStarted' }
  | { type: 'sendSucceeded'; session: KaelChatResponse }
  | { type: 'sendFailed'; error: string }
  | { type: 'confirmArmed' }
  | { type: 'confirmStarted' }
  | { type: 'confirmSucceeded'; message: string; jobId: string; status: string }
  | { type: 'confirmFailed'; error: string }

export function createInitialKaelChatState(routeService: ServiceType | null): KaelChatState {
  return {
    selectedService: routeService,
    session: null,
    draft: '',
    addressLabel: '',
    loading: false,
    sending: false,
    confirming: false,
    confirmArmed: false,
    error: null,
    confirmedMessage: null,
  }
}

export function kaelChatReducer(state: KaelChatState, action: KaelChatAction): KaelChatState {
  switch (action.type) {
    case 'syncRouteService':
      if (!action.service) return state
      if (!action.routeSessionId && state.session?.session.service_type !== action.service) {
        return {
          ...state,
          selectedService: action.service,
          session: null,
          confirmArmed: false,
          confirmedMessage: null,
          error: null,
        }
      }
      return { ...state, selectedService: action.service }
    case 'applyPendingDraft':
      return {
        ...state,
        selectedService: action.service ?? state.selectedService,
        draft: action.message,
      }
    case 'loadSessionStarted':
      return { ...state, loading: true, error: null }
    case 'loadSessionSucceeded':
      return {
        ...state,
        loading: false,
        session: action.session,
        selectedService: action.session.session.service_type,
      }
    case 'loadSessionFailed':
      return { ...state, loading: false, error: action.error }
    case 'selectService':
      return {
        ...state,
        selectedService: action.service,
        session: !state.session || state.session.session.service_type !== action.service ? null : state.session,
        error: null,
      }
    case 'setAddress':
      return { ...state, addressLabel: action.value }
    case 'setDraft':
      return {
        ...state,
        draft: action.value,
        error: action.clearTransientError ? null : state.error,
      }
    case 'showTransientError':
      return { ...state, error: action.error }
    case 'sendStarted':
      return {
        ...state,
        sending: true,
        error: null,
        confirmArmed: false,
        confirmedMessage: null,
      }
    case 'sendSucceeded':
      return {
        ...state,
        sending: false,
        session: action.session,
        selectedService: action.session.session.service_type,
        draft: '',
      }
    case 'sendFailed':
      return { ...state, sending: false, error: action.error }
    case 'confirmArmed':
      return { ...state, confirmArmed: true, error: null }
    case 'confirmStarted':
      return { ...state, confirming: true, error: null }
    case 'confirmSucceeded':
      return {
        ...state,
        confirming: false,
        confirmedMessage: action.message,
        session: state.session
          ? {
              ...state.session,
              session: {
                ...state.session.session,
                job_id: action.jobId,
                status: action.status === 'broadcasting' ? 'confirmed' : state.session.session.status,
                next_action: 'confirmed',
              },
            }
          : state.session,
      }
    case 'confirmFailed':
      return { ...state, confirming: false, error: action.error }
    default:
      return state
  }
}
