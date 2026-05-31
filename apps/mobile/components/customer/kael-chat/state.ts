import { type ServiceType } from '@home-services/shared'
import { type KaelChatResponse } from '@/lib/api-types'
import { type PendingKaelChatDraft } from './pending-intake'

export type KaelChatState = {
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  pendingIntake: PendingKaelChatDraft | null
  draft: string
  addressLabel: string
  loading: boolean
  sending: boolean
  orchestrating: boolean
  error: string | null
  orchestrationMessage: string | null
}

export type KaelChatAction =
  | { type: 'syncRouteService'; service: ServiceType | null; routeSessionId?: string }
  | { type: 'applyPendingDraft'; intake: PendingKaelChatDraft }
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
  | { type: 'orchestrationStarted' }
  | { type: 'orchestrationSucceeded'; message: string; jobId: string }
  | { type: 'orchestrationFailed'; error: string }

export function createInitialKaelChatState(routeService: ServiceType | null): KaelChatState {
  return {
    selectedService: routeService,
    session: null,
    pendingIntake: null,
    draft: '',
    addressLabel: '',
    loading: false,
    sending: false,
    orchestrating: false,
    error: null,
    orchestrationMessage: null,
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
          orchestrationMessage: null,
          error: null,
        }
      }
      return { ...state, selectedService: action.service }
    case 'applyPendingDraft':
      return {
        ...state,
        selectedService: action.intake.serviceType ?? state.selectedService,
        pendingIntake: action.intake,
        draft: '',
        addressLabel: action.intake.addressLabel ?? state.addressLabel,
        error: null,
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
        orchestrationMessage: null,
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
    case 'orchestrationStarted':
      return { ...state, orchestrating: true, error: null }
    case 'orchestrationSucceeded':
      return {
        ...state,
        orchestrating: false,
        orchestrationMessage: action.message,
        session: state.session
          ? {
              ...state.session,
              session: {
                ...state.session.session,
                job_id: action.jobId,
                status: 'confirmed',
                next_action: 'confirmed',
              },
            }
          : state.session,
      }
    case 'orchestrationFailed':
      return { ...state, orchestrating: false, error: action.error }
    default:
      return state
  }
}
