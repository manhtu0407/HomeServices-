import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react'

import type { KaelChatResponse, KaelChatTurn } from '@/lib/api-types'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'
import type { PendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'

import type { CustomerKaelMode } from './types'

export type CustomerAssistantLocalTurn = {
  id: string
  role: 'customer' | 'worker' | 'kael'
  surface: 'customer_normal' | 'customer_case'
  text_content: string
}

export type CustomerKaelConversationState = {
  assistantTurns: CustomerAssistantLocalTurn[]
  chat: KaelChatResponse | null
  composerMediaDrafts: LocalMediaUploadDraft[]
  error: string | null
  loading: boolean
  localMode: CustomerKaelMode
  pendingDraft: PendingKaelChatDraft | null
  routeDraftEvidencePending: boolean
  turns: KaelChatTurn[]
}

export type CustomerKaelConversationAction =
  | { type: 'set-assistant-turns'; value: SetStateAction<CustomerAssistantLocalTurn[]> }
  | { type: 'set-chat'; value: SetStateAction<KaelChatResponse | null> }
  | { type: 'set-composer-media-drafts'; value: SetStateAction<LocalMediaUploadDraft[]> }
  | { type: 'set-error'; value: SetStateAction<string | null> }
  | { type: 'set-loading'; value: SetStateAction<boolean> }
  | { type: 'set-local-mode'; value: SetStateAction<CustomerKaelMode> }
  | { type: 'set-pending-draft'; value: SetStateAction<PendingKaelChatDraft | null> }
  | { type: 'set-route-draft-evidence'; value: SetStateAction<boolean> }
  | { type: 'set-turns'; value: SetStateAction<KaelChatTurn[]> }
  | { draft: PendingKaelChatDraft; loading: boolean; type: 'hydrate-pending-draft' }
  | { type: 'begin-hydration' }
  | { consumePendingDraft: boolean; response: KaelChatResponse; type: 'resolve-hydration' }
  | { error: string; type: 'reject-hydration' }
  | { type: 'finish-hydration' }
  | { mode: CustomerKaelMode; type: 'switch-mode' }

function resolveStateAction<T>(current: T, action: SetStateAction<T>) {
  return typeof action === 'function'
    ? (action as (current: T) => T)(current)
    : action
}

export function customerKaelConversationReducer(
  state: CustomerKaelConversationState,
  action: CustomerKaelConversationAction,
): CustomerKaelConversationState {
  switch (action.type) {
    case 'set-assistant-turns':
      return { ...state, assistantTurns: resolveStateAction(state.assistantTurns, action.value) }
    case 'set-chat':
      return { ...state, chat: resolveStateAction(state.chat, action.value) }
    case 'set-composer-media-drafts':
      return { ...state, composerMediaDrafts: resolveStateAction(state.composerMediaDrafts, action.value) }
    case 'set-error':
      return { ...state, error: resolveStateAction(state.error, action.value) }
    case 'set-loading':
      return { ...state, loading: resolveStateAction(state.loading, action.value) }
    case 'set-local-mode': {
      const localMode = resolveStateAction(state.localMode, action.value)
      const clearsMissingServiceError = localMode === 'normal' && (
        state.error === 'Chọn dịch vụ.' || state.error === 'Choose a service.'
      )
      return { ...state, error: clearsMissingServiceError ? null : state.error, localMode }
    }
    case 'set-pending-draft':
      return { ...state, pendingDraft: resolveStateAction(state.pendingDraft, action.value) }
    case 'set-route-draft-evidence':
      return { ...state, routeDraftEvidencePending: resolveStateAction(state.routeDraftEvidencePending, action.value) }
    case 'set-turns':
      return { ...state, turns: resolveStateAction(state.turns, action.value) }
    case 'hydrate-pending-draft':
      return {
        ...state,
        composerMediaDrafts: action.draft.photoDrafts ? [...action.draft.photoDrafts] : [],
        loading: action.loading,
        localMode: 'case',
        pendingDraft: action.draft,
        routeDraftEvidencePending: true,
      }
    case 'begin-hydration':
      return state.loading ? state : { ...state, loading: true }
    case 'resolve-hydration':
      return {
        ...state,
        chat: action.response,
        composerMediaDrafts: action.consumePendingDraft ? [] : state.composerMediaDrafts,
        error: null,
        loading: false,
        pendingDraft: action.consumePendingDraft ? null : state.pendingDraft,
        routeDraftEvidencePending: action.consumePendingDraft ? false : state.routeDraftEvidencePending,
        turns: action.response.turns,
      }
    case 'reject-hydration':
      return { ...state, error: action.error, loading: false }
    case 'finish-hydration':
      return state.loading ? { ...state, loading: false } : state
    case 'switch-mode':
      return {
        ...state,
        assistantTurns: [],
        chat: null,
        composerMediaDrafts: [],
        error: null,
        loading: false,
        localMode: action.mode,
        turns: [],
      }
  }
}

export function createCustomerKaelConversationState(input: {
  initialLoading: boolean
  initialMode: CustomerKaelMode
  pendingDraft: PendingKaelChatDraft | null
}): CustomerKaelConversationState {
  return {
    assistantTurns: [],
    chat: null,
    composerMediaDrafts: input.pendingDraft?.photoDrafts ? [...input.pendingDraft.photoDrafts] : [],
    error: null,
    loading: input.initialLoading,
    localMode: input.initialMode,
    pendingDraft: input.pendingDraft,
    routeDraftEvidencePending: Boolean(input.pendingDraft),
    turns: [],
  }
}

export function useCustomerKaelConversationState(input: {
  initialLoading: boolean
  initialMode: CustomerKaelMode
  pendingDraft: PendingKaelChatDraft | null
}) {
  const [state, dispatch] = useReducer(
    customerKaelConversationReducer,
    input,
    createCustomerKaelConversationState,
  )
  const setAssistantTurns: Dispatch<SetStateAction<CustomerAssistantLocalTurn[]>> = useCallback((value) => {
    dispatch({ type: 'set-assistant-turns', value })
  }, [])
  const setChat: Dispatch<SetStateAction<KaelChatResponse | null>> = useCallback((value) => {
    dispatch({ type: 'set-chat', value })
  }, [])
  const setComposerMediaDrafts: Dispatch<SetStateAction<LocalMediaUploadDraft[]>> = useCallback((value) => {
    dispatch({ type: 'set-composer-media-drafts', value })
  }, [])
  const setError: Dispatch<SetStateAction<string | null>> = useCallback((value) => {
    dispatch({ type: 'set-error', value })
  }, [])
  const setLoading: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    dispatch({ type: 'set-loading', value })
  }, [])
  const setLocalMode: Dispatch<SetStateAction<CustomerKaelMode>> = useCallback((value) => {
    dispatch({ type: 'set-local-mode', value })
  }, [])
  const setPendingDraftState: Dispatch<SetStateAction<PendingKaelChatDraft | null>> = useCallback((value) => {
    dispatch({ type: 'set-pending-draft', value })
  }, [])
  const setRouteDraftEvidencePending: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    dispatch({ type: 'set-route-draft-evidence', value })
  }, [])
  const setTurns: Dispatch<SetStateAction<KaelChatTurn[]>> = useCallback((value) => {
    dispatch({ type: 'set-turns', value })
  }, [])
  const hydratePendingDraft = useCallback((draft: PendingKaelChatDraft, loading: boolean) => {
    dispatch({ draft, loading, type: 'hydrate-pending-draft' })
  }, [])
  const beginHydration = useCallback(() => {
    dispatch({ type: 'begin-hydration' })
  }, [])
  const resolveHydration = useCallback((response: KaelChatResponse, consumePendingDraft: boolean) => {
    dispatch({ consumePendingDraft, response, type: 'resolve-hydration' })
  }, [])
  const rejectHydration = useCallback((error: string) => {
    dispatch({ error, type: 'reject-hydration' })
  }, [])
  const finishHydration = useCallback(() => {
    dispatch({ type: 'finish-hydration' })
  }, [])
  const switchMode = useCallback((mode: CustomerKaelMode) => {
    dispatch({ mode, type: 'switch-mode' })
  }, [])

  return {
    ...state,
    beginHydration,
    finishHydration,
    hydratePendingDraft,
    rejectHydration,
    resolveHydration,
    setAssistantTurns,
    setChat,
    setComposerMediaDrafts,
    setError,
    setLoading,
    setLocalMode,
    setPendingDraftState,
    setRouteDraftEvidencePending,
    setTurns,
    switchMode,
  }
}
