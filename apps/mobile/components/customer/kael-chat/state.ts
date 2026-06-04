import { type ServiceType } from '@home-services/shared'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { type LocalMediaUploadDraft } from '@/lib/media-upload'
import { isLocalGreetingOnly } from './local-rhythm'
import { type PendingKaelChatDraft } from './pending-intake'

export type KaelChatState = {
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  pendingIntake: PendingKaelChatDraft | null
  localTurns: KaelChatTurn[]
  localDraftMessage: string | null
  composerPhotoDrafts: LocalMediaUploadDraft[]
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
  | { type: 'addComposerPhotos'; drafts: LocalMediaUploadDraft[] }
  | { type: 'appendDraft'; segment: string }
  | { type: 'composerPhotosUploaded' }
  | { type: 'loadSessionStarted' }
  | { type: 'loadSessionSucceeded'; session: KaelChatResponse }
  | { type: 'loadSessionFailed'; error: string }
  | { type: 'selectService'; service: ServiceType }
  | { type: 'setAddress'; value: string }
  | { type: 'setDraft'; value: string; clearTransientError: boolean }
  | { type: 'showTransientError'; error: string }
  | { type: 'showLocalGreeting'; userMessage: string; kaelMessage: string }
  | { type: 'showLocalGuidance'; userMessage: string; kaelMessage: string }
  | { type: 'sendStarted' }
  | { type: 'sendSucceeded'; session: KaelChatResponse; clearDraft?: boolean }
  | { type: 'sendFailed'; error: string }
  | { type: 'orchestrationStarted' }
  | { type: 'orchestrationSucceeded'; message: string; jobId: string }
  | { type: 'orchestrationFailed'; error: string }

export function createInitialKaelChatState(routeService: ServiceType | null): KaelChatState {
  return {
    selectedService: routeService,
    session: null,
    pendingIntake: null,
    localTurns: [],
    localDraftMessage: null,
    composerPhotoDrafts: [],
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
    case 'addComposerPhotos':
      return { ...state, composerPhotoDrafts: mergeComposerPhotoDrafts(state.composerPhotoDrafts, action.drafts) }
    case 'appendDraft':
      return { ...state, draft: appendKaelDraftSegment(state.draft, action.segment), error: null }
    case 'composerPhotosUploaded':
      return { ...state, composerPhotoDrafts: [] }
    case 'loadSessionStarted':
      return { ...state, loading: true, error: null }
    case 'loadSessionSucceeded':
      return {
        ...state,
        loading: false,
        session: action.session,
        selectedService: action.session.session.service_type,
        localTurns: [],
        localDraftMessage: null,
      }
    case 'loadSessionFailed':
      return { ...state, loading: false, error: action.error }
    case 'selectService': {
      const shouldResetSessionForService = Boolean(
        state.session?.session.service_type &&
        state.session.session.service_type !== action.service,
      )
      const preIntakeDraft = state.session && !state.session.session.service_type
        ? preIntakeCustomerDraft(state.session.turns)
        : ''
      const shouldRestorePreIntakeDraft = Boolean(preIntakeDraft && state.draft.trim().length === 0)
      return {
        ...state,
        selectedService: action.service,
        session: shouldResetSessionForService ? null : state.session,
        draft: shouldRestorePreIntakeDraft
          ? preIntakeDraft
          : !state.session && state.localDraftMessage && state.draft.trim().length === 0
            ? state.localDraftMessage
            : state.draft,
        localDraftMessage: shouldRestorePreIntakeDraft || (!state.session && state.localDraftMessage && state.draft.trim().length === 0) ? null : state.localDraftMessage,
        error: null,
      }
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
    case 'showLocalGreeting':
      return {
        ...state,
        draft: '',
        error: null,
        localTurns: [
          ...state.localTurns,
          ...createLocalGuidanceTurns({
            kaelMessage: action.kaelMessage,
            startIndex: state.localTurns.length,
            userMessage: action.userMessage,
          }),
        ],
        orchestrationMessage: null,
        sending: false,
      }
    case 'showLocalGuidance':
      return {
        ...state,
        draft: '',
        error: null,
        localDraftMessage: appendKaelDraftSegment(state.localDraftMessage ?? '', action.userMessage),
        localTurns: [
          ...state.localTurns,
          ...createLocalGuidanceTurns({
            kaelMessage: action.kaelMessage,
            startIndex: state.localTurns.length,
            userMessage: action.userMessage,
          }),
        ],
        orchestrationMessage: null,
        sending: false,
      }
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
        draft: action.clearDraft === false ? state.draft : '',
        localTurns: [],
        localDraftMessage: null,
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

function mergeComposerPhotoDrafts(current: LocalMediaUploadDraft[], drafts: LocalMediaUploadDraft[]) {
  const seenUris = new Set(current.map((photo) => photo.uri))
  const merged = [...current]
  for (const draft of drafts) {
    if (seenUris.has(draft.uri)) continue
    seenUris.add(draft.uri)
    merged.push(draft)
    if (merged.length >= 5) break
  }
  return merged
}

function appendKaelDraftSegment(draft: string, segment: string) {
  const cleanDraft = draft.trim()
  const cleanSegment = segment.trim()
  if (!cleanSegment) return cleanDraft
  return cleanDraft ? `${cleanDraft} ${cleanSegment}` : cleanSegment
}

function preIntakeCustomerDraft(turns: KaelChatTurn[]) {
  return turns
    .filter((turn) => turn.role === 'customer' && turn.text_content?.trim())
    .map((turn) => turn.text_content?.trim() ?? '')
    .filter((message) => !isLocalGreetingOnly(message))
    .join(' ')
    .trim()
}

function createLocalGuidanceTurns({
  kaelMessage,
  startIndex,
  userMessage,
}: {
  kaelMessage: string
  startIndex: number
  userMessage: string
}): KaelChatTurn[] {
  const createdAt = '1970-01-01T00:00:00.000Z'
  return [
    {
      content_type: 'text',
      created_at: createdAt,
      estimate: null,
      id: `local_customer_${startIndex + 1}`,
      media_refs: [],
      role: 'customer',
      session_id: 'local_pre_service',
      text_content: userMessage,
      turn_index: startIndex + 1,
    },
    {
      content_type: 'clarification',
      created_at: createdAt,
      estimate: null,
      id: `local_kael_${startIndex + 2}`,
      media_refs: [],
      role: 'kael',
      session_id: 'local_pre_service',
      text_content: kaelMessage,
      turn_index: startIndex + 2,
    },
  ]
}
