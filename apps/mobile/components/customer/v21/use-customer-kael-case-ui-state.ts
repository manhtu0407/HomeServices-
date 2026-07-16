import { useCallback, useReducer } from 'react'

type CustomerKaelCaseUiState = {
  evidenceOwnerKey: string | null
  evidenceReason: string
  evidenceRejectOpen: boolean
  optionsAcknowledged: boolean
  optionsOwnerKey: string | null
  submittingEvidence: boolean
}

type CustomerKaelCaseUiAction =
  | { evidenceOwnerKey: string | null; optionsOwnerKey: string | null; type: 'sync-owners' }
  | { type: 'acknowledge-options' }
  | { open: boolean; type: 'set-evidence-reject-open' }
  | { reason: string; type: 'set-evidence-reason' }
  | { submitting: boolean; type: 'set-submitting-evidence' }
  | { type: 'clear-evidence-draft' }

function createCaseUiState(
  evidenceOwnerKey: string | null,
  optionsOwnerKey: string | null,
): CustomerKaelCaseUiState {
  return {
    evidenceOwnerKey,
    evidenceReason: '',
    evidenceRejectOpen: false,
    optionsAcknowledged: false,
    optionsOwnerKey,
    submittingEvidence: false,
  }
}

function customerKaelCaseUiReducer(
  state: CustomerKaelCaseUiState,
  action: CustomerKaelCaseUiAction,
): CustomerKaelCaseUiState {
  switch (action.type) {
    case 'sync-owners': {
      const evidenceOwnerChanged = state.evidenceOwnerKey !== action.evidenceOwnerKey
      const optionsOwnerChanged = state.optionsOwnerKey !== action.optionsOwnerKey
      return {
        evidenceOwnerKey: action.evidenceOwnerKey,
        evidenceReason: evidenceOwnerChanged ? '' : state.evidenceReason,
        evidenceRejectOpen: evidenceOwnerChanged ? false : state.evidenceRejectOpen,
        optionsAcknowledged: optionsOwnerChanged ? false : state.optionsAcknowledged,
        optionsOwnerKey: action.optionsOwnerKey,
        submittingEvidence: evidenceOwnerChanged ? false : state.submittingEvidence,
      }
    }
    case 'acknowledge-options':
      return { ...state, optionsAcknowledged: true }
    case 'set-evidence-reject-open':
      return { ...state, evidenceRejectOpen: action.open }
    case 'set-evidence-reason':
      return { ...state, evidenceReason: action.reason }
    case 'set-submitting-evidence':
      return { ...state, submittingEvidence: action.submitting }
    case 'clear-evidence-draft':
      return { ...state, evidenceReason: '', evidenceRejectOpen: false }
  }
}

export function useCustomerKaelCaseUiState(input: {
  evidenceOwnerKey: string | null
  optionsOwnerKey: string | null
}) {
  const [state, dispatch] = useReducer(
    customerKaelCaseUiReducer,
    input,
    ({ evidenceOwnerKey, optionsOwnerKey }) => createCaseUiState(evidenceOwnerKey, optionsOwnerKey),
  )
  if (
    state.evidenceOwnerKey !== input.evidenceOwnerKey ||
    state.optionsOwnerKey !== input.optionsOwnerKey
  ) {
    dispatch({
      evidenceOwnerKey: input.evidenceOwnerKey,
      optionsOwnerKey: input.optionsOwnerKey,
      type: 'sync-owners',
    })
  }
  const setCaseEvidenceRejectOpen = useCallback((open: boolean) => {
    dispatch({ open, type: 'set-evidence-reject-open' })
  }, [])
  const setCaseEvidenceReason = useCallback((reason: string) => {
    dispatch({ reason, type: 'set-evidence-reason' })
  }, [])
  const setSubmittingCaseEvidence = useCallback((submitting: boolean) => {
    dispatch({ submitting, type: 'set-submitting-evidence' })
  }, [])
  const setCaseOptionsAcknowledged = useCallback((acknowledged: boolean) => {
    if (acknowledged) dispatch({ type: 'acknowledge-options' })
  }, [])
  const clearCaseEvidenceDraft = useCallback(() => {
    dispatch({ type: 'clear-evidence-draft' })
  }, [])

  return {
    caseEvidenceReason: state.evidenceReason,
    caseEvidenceRejectOpen: state.evidenceRejectOpen,
    caseOptionsAcknowledged: state.optionsAcknowledged,
    clearCaseEvidenceDraft,
    setCaseEvidenceReason,
    setCaseEvidenceRejectOpen,
    setCaseOptionsAcknowledged,
    setSubmittingCaseEvidence,
    submittingCaseEvidence: state.submittingEvidence,
  }
}
