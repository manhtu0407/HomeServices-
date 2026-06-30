import { useMemo } from 'react'
import { buildWorkflowViewModel, type WorkflowViewModel, type WorkflowViewModelInput } from '@nestscout/shared'

export function useServiceWorkflow(input: WorkflowViewModelInput): WorkflowViewModel {
  const {
    hasAiNotes,
    hasCompletionEvidence,
    hasCustomerInput,
    hasPendingIntake,
    hasEstimate,
    hasScopeChange,
    isLoading,
    optimistic,
    status,
  } = input

  return useMemo(
    () =>
      buildWorkflowViewModel({
        hasAiNotes,
        hasCompletionEvidence,
        hasCustomerInput,
        hasPendingIntake,
        hasEstimate,
        hasScopeChange,
        isLoading,
        optimistic,
        status,
      }),
    [
      hasAiNotes,
      hasCompletionEvidence,
      hasCustomerInput,
      hasPendingIntake,
      hasEstimate,
      hasScopeChange,
      isLoading,
      optimistic,
      status,
    ],
  )
}
