import { useMemo, useReducer, type Dispatch, type SetStateAction } from 'react'

import type { KaelProcessLine, KaelProcessScenarioId } from './kael-process-lines'

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

export function useCustomerKaelChatUiState() {
  const [state, dispatch] = useReducer(
    customerKaelChatUiReducer,
    initialCustomerKaelChatUiState,
  )
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
    setDraft: createSetter(dispatch, 'draft'),
    setModeMenuOpen: createSetter(dispatch, 'modeMenuOpen'),
    setRetryingWorkerSearch: createSetter(dispatch, 'retryingWorkerSearch'),
    setSessionMenuOpen: createSetter(dispatch, 'sessionMenuOpen'),
    setSubmittingAgenticEvidence: createSetter(dispatch, 'submittingAgenticEvidence'),
    setSubmittingAgenticAdjustment: createSetter(dispatch, 'submittingAgenticAdjustment'),
    setSubmittingAgenticRejectReason: createSetter(dispatch, 'submittingAgenticRejectReason'),
    setSubmittingCaseQuoteRejectReason: createSetter(dispatch, 'submittingCaseQuoteRejectReason'),
    setUploadingMedia: createSetter(dispatch, 'uploadingMedia'),
    setVoiceTranscript: createSetter(dispatch, 'voiceTranscript'),
  }), [])

  return { ...state, ...setters }
}
