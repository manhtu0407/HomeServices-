import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type Dispatch, type SetStateAction } from 'react'

import type { KaelProcessLine, KaelProcessScenarioId } from './kael-process-lines'
import {
  readCustomerKaelComposerState,
  readPersistedCustomerKaelComposerState,
  persistCustomerKaelComposerState,
  rememberCustomerKaelComposerState,
} from './customer-kael-ephemeral-state'

export type KaelProcessLineRuntime = {
  activeIndex: number | null
  collapse: string | null
  lines: KaelProcessLine[]
  origin: 'backend' | 'local'
  prompt: string
  scenarioId: KaelProcessScenarioId
  streamId: string
  visibleCount: number
}

type CustomerKaelChatUiState = {
  agenticAdjustmentOpen: boolean
  agenticAdjustmentText: string
  agenticPriceQuestionOpen: boolean
  agenticEvidenceReason: string
  agenticEvidenceRejectOpen: boolean
  agenticRejectOpen: boolean
  agenticRejectReason: string
  blankCaseTransition: boolean
  caseEditOpen: boolean
  caseQuoteRejectOpen: boolean
  caseQuoteRejectReason: string
  confirmingAgenticEstimate: boolean
  confirmingCaseQuote: boolean
  confirmingCompletion: boolean
  draft: string
  modeMenuOpen: boolean
  retryingWorkerSearch: boolean
  sessionMenuOpen: boolean
  submittingAgenticEvidence: boolean
  submittingAgenticAdjustment: boolean
  submittingAgenticRejectReason: boolean
  submittingCaseQuoteRejectReason: boolean
  uploadingMedia: boolean
  voiceTranscript: string
}

type CustomerKaelChatUiAction = {
  [Key in keyof CustomerKaelChatUiState]: {
    key: Key
    value: SetStateAction<CustomerKaelChatUiState[Key]>
  }
}[keyof CustomerKaelChatUiState]

type CustomerKaelChatUiSetter<Key extends keyof CustomerKaelChatUiState> = Dispatch<
  SetStateAction<CustomerKaelChatUiState[Key]>
>

const initialCustomerKaelChatUiState: CustomerKaelChatUiState = {
  agenticAdjustmentOpen: false,
  agenticAdjustmentText: '',
  agenticPriceQuestionOpen: false,
  agenticEvidenceReason: '',
  agenticEvidenceRejectOpen: false,
  agenticRejectOpen: false,
  agenticRejectReason: '',
  blankCaseTransition: false,
  caseEditOpen: false,
  caseQuoteRejectOpen: false,
  caseQuoteRejectReason: '',
  confirmingAgenticEstimate: false,
  confirmingCaseQuote: false,
  confirmingCompletion: false,
  draft: '',
  modeMenuOpen: false,
  retryingWorkerSearch: false,
  sessionMenuOpen: false,
  submittingAgenticEvidence: false,
  submittingAgenticAdjustment: false,
  submittingAgenticRejectReason: false,
  submittingCaseQuoteRejectReason: false,
  uploadingMedia: false,
  voiceTranscript: '',
}

function customerKaelChatUiReducer(
  state: CustomerKaelChatUiState,
  action: CustomerKaelChatUiAction,
): CustomerKaelChatUiState {
  const previous = state[action.key]
  const next = typeof action.value === 'function'
    ? (action.value as (current: typeof previous) => typeof previous)(previous)
    : action.value

  return Object.is(previous, next) ? state : { ...state, [action.key]: next }
}

function createSetter<Key extends keyof CustomerKaelChatUiState>(
  dispatch: Dispatch<CustomerKaelChatUiAction>,
  key: Key,
): CustomerKaelChatUiSetter<Key> {
  return (value) => dispatch({ key, value } as CustomerKaelChatUiAction)
}

export function useCustomerKaelChatUiState(scopeKey?: string) {
  const [state, dispatch] = useReducer(
    customerKaelChatUiReducer,
    scopeKey,
    (key: string | undefined) => ({
      ...initialCustomerKaelChatUiState,
      ...(key ? readCustomerKaelComposerState(key) : {}),
    }),
  )
  const latestComposerRef = useRef({ draft: state.draft, voiceTranscript: state.voiceTranscript })
  const composerMutationRevisionRef = useRef(0)
  const hydrationRevisionRef = useRef(0)
  const hydratedScopeRef = useRef<string | null>(null)
  const currentScopeRef = useRef(scopeKey)
  const setDraft = useCallback<CustomerKaelChatUiSetter<'draft'>>((value) => {
    composerMutationRevisionRef.current += 1
    dispatch({ key: 'draft', value } as CustomerKaelChatUiAction)
  }, [])
  const setVoiceTranscript = useCallback<CustomerKaelChatUiSetter<'voiceTranscript'>>((value) => {
    composerMutationRevisionRef.current += 1
    dispatch({ key: 'voiceTranscript', value } as CustomerKaelChatUiAction)
  }, [])
  const setters = useMemo(() => ({
    setAgenticAdjustmentOpen: createSetter(dispatch, 'agenticAdjustmentOpen'),
    setAgenticAdjustmentText: createSetter(dispatch, 'agenticAdjustmentText'),
    setAgenticPriceQuestionOpen: createSetter(dispatch, 'agenticPriceQuestionOpen'),
    setAgenticEvidenceReason: createSetter(dispatch, 'agenticEvidenceReason'),
    setAgenticEvidenceRejectOpen: createSetter(dispatch, 'agenticEvidenceRejectOpen'),
    setAgenticRejectOpen: createSetter(dispatch, 'agenticRejectOpen'),
    setAgenticRejectReason: createSetter(dispatch, 'agenticRejectReason'),
    setBlankCaseTransition: createSetter(dispatch, 'blankCaseTransition'),
    setCaseEditOpen: createSetter(dispatch, 'caseEditOpen'),
    setCaseQuoteRejectOpen: createSetter(dispatch, 'caseQuoteRejectOpen'),
    setCaseQuoteRejectReason: createSetter(dispatch, 'caseQuoteRejectReason'),
    setConfirmingAgenticEstimate: createSetter(dispatch, 'confirmingAgenticEstimate'),
    setConfirmingCaseQuote: createSetter(dispatch, 'confirmingCaseQuote'),
    setConfirmingCompletion: createSetter(dispatch, 'confirmingCompletion'),
    setModeMenuOpen: createSetter(dispatch, 'modeMenuOpen'),
    setRetryingWorkerSearch: createSetter(dispatch, 'retryingWorkerSearch'),
    setSessionMenuOpen: createSetter(dispatch, 'sessionMenuOpen'),
    setSubmittingAgenticEvidence: createSetter(dispatch, 'submittingAgenticEvidence'),
    setSubmittingAgenticAdjustment: createSetter(dispatch, 'submittingAgenticAdjustment'),
    setSubmittingAgenticRejectReason: createSetter(dispatch, 'submittingAgenticRejectReason'),
    setSubmittingCaseQuoteRejectReason: createSetter(dispatch, 'submittingCaseQuoteRejectReason'),
    setUploadingMedia: createSetter(dispatch, 'uploadingMedia'),
  }), [])

  useLayoutEffect(() => {
    latestComposerRef.current = { draft: state.draft, voiceTranscript: state.voiceTranscript }
    currentScopeRef.current = scopeKey
  }, [scopeKey, state.draft, state.voiceTranscript])

  useEffect(() => {
    if (!scopeKey) return
    const hydrationRevision = ++hydrationRevisionRef.current
    const composerMutationRevision = composerMutationRevisionRef.current
    hydratedScopeRef.current = null
    let cancelled = false
    void readPersistedCustomerKaelComposerState(scopeKey).then((stored) => {
      if (
        cancelled ||
        hydrationRevisionRef.current !== hydrationRevision ||
        currentScopeRef.current !== scopeKey
      ) return
      hydratedScopeRef.current = scopeKey
      const current = latestComposerRef.current
      if (current.draft || current.voiceTranscript) {
        void persistCustomerKaelComposerState(scopeKey, current)
        return
      }
      if (
        stored &&
        composerMutationRevisionRef.current === composerMutationRevision &&
        !current.draft &&
        !current.voiceTranscript
      ) {
        dispatch({ key: 'draft', value: stored.draft })
        dispatch({ key: 'voiceTranscript', value: stored.voiceTranscript })
      }
    })
    return () => {
      cancelled = true
    }
  }, [scopeKey])

  useEffect(() => {
    if (!scopeKey) return
    rememberCustomerKaelComposerState(scopeKey, {
      draft: state.draft,
      voiceTranscript: state.voiceTranscript,
    })
    if (hydratedScopeRef.current !== scopeKey) return
    void persistCustomerKaelComposerState(scopeKey, {
      draft: state.draft,
      voiceTranscript: state.voiceTranscript,
    })
  }, [scopeKey, state.draft, state.voiceTranscript])
  const rememberComposerState = useCallback(() => {
    if (!scopeKey) return
    const composer = {
      draft: state.draft,
      voiceTranscript: state.voiceTranscript,
    }
    rememberCustomerKaelComposerState(scopeKey, composer)
    if (hydratedScopeRef.current === scopeKey) void persistCustomerKaelComposerState(scopeKey, composer)
  }, [scopeKey, state.draft, state.voiceTranscript])

  return { ...state, ...setters, rememberComposerState, setDraft, setVoiceTranscript }
}
