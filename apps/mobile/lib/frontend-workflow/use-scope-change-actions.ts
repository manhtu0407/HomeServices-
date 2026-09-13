import type { WorkflowErrorHandler } from './errors'
import { useCallback, useRef, useState, type RefObject } from 'react'
import type {
  CustomerScopeDecisionInput,
  LocalWorkflowState,
  WorkerScopeChangeInput,
} from '@nestscout/shared'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '../client-request-id'
import { jobService, workerService } from '../services'
import type { JobIncidentScopePricePreviewResponse } from '../api-types'
import { getRemoteJobId, scopeChangeClientRequestFingerprint } from './helpers'

export type WorkerScopeChangeDraftInput = Omit<WorkerScopeChangeInput, 'client_request_id'> & {
  client_request_id?: string
}

type ScopeChangeActionsInput = {
  pendingDirectScopeChangeClientRequestRef: RefObject<PendingClientRequestId | null>
  pendingIncidentOpenClientRequestRef: RefObject<PendingClientRequestId | null>
  pendingScopePricePreviewClientRequestRef: RefObject<PendingClientRequestId | null>
  pendingScopeProposalClientRequestRef: RefObject<PendingClientRequestId | null>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}

export function useScopeChangeActions({
  pendingDirectScopeChangeClientRequestRef,
  pendingIncidentOpenClientRequestRef,
  pendingScopePricePreviewClientRequestRef,
  pendingScopeProposalClientRequestRef,
  refreshCurrentJob,
  setRemoteError,
  stateRef,
}: ScopeChangeActionsInput) {
  const [customerScopeDecisionBusyId, setCustomerScopeDecisionBusyId] = useState<string | null>(null)
  const customerScopeDecisionBusyRef = useRef<string | null>(null)

  const requestScopeChange = useCallback(async (input: WorkerScopeChangeDraftInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đổi phạm vi')
    const requestFingerprint = scopeChangeClientRequestFingerprint(jobId, input)
    const result = await workerService.requestScopeChange(jobId, {
      ...input,
      client_request_id: stableClientRequestId(
        pendingDirectScopeChangeClientRequestRef,
        requestFingerprint,
      ),
      new_description: input.new_description.trim(),
      reason: input.reason.trim(),
    })
    if (!result.success) return setRemoteError(result)
    clearStableClientRequestId(pendingDirectScopeChangeClientRequestRef, requestFingerprint)
    await refreshCurrentJob()
    return true
  }, [pendingDirectScopeChangeClientRequestRef, refreshCurrentJob, setRemoteError, stateRef])

  const getKaelJobIncident = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride?.trim() || getRemoteJobId(stateRef.current)
    if (!jobId) return false
    const result = await workerService.getKaelJobIncident(jobId)
    if (!result.success) {
      setRemoteError(result)
      return false
    }
    return result.data
  }, [setRemoteError, stateRef])

  const openKaelJobIncident = useCallback(async (input: WorkerScopeChangeDraftInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      setRemoteError('Không có yêu cầu để mở Kael Công việc')
      return false
    }
    const requestFingerprint = scopeChangeClientRequestFingerprint(jobId, input)
    const result = await workerService.openKaelJobIncident(jobId, {
      ...input,
      client_request_id: stableClientRequestId(
        pendingIncidentOpenClientRequestRef,
        requestFingerprint,
      ),
      new_description: input.new_description.trim(),
      reason: input.reason.trim(),
    })
    if (!result.success) {
      setRemoteError(result)
      return false
    }
    clearStableClientRequestId(pendingIncidentOpenClientRequestRef, requestFingerprint)
    return result.data
  }, [pendingIncidentOpenClientRequestRef, setRemoteError, stateRef])

  const previewScopeChangeFromKaelIncident = useCallback(async (): Promise<JobIncidentScopePricePreviewResponse | false> => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để Kael tính giá')
    const requestFingerprint = `job-incident-scope-price-preview:${jobId}`
    const result = await workerService.previewScopeChangeFromKaelIncident(jobId, {
      client_request_id: stableClientRequestId(
        pendingScopePricePreviewClientRequestRef,
        requestFingerprint,
      ),
    })
    if (!result.success) {
      if (!shouldRetainClientRequestId(result)) {
        clearStableClientRequestId(pendingScopePricePreviewClientRequestRef, requestFingerprint)
      }
      return setRemoteError(result)
    }
    clearStableClientRequestId(pendingScopePricePreviewClientRequestRef, requestFingerprint)
    return result.data
  }, [pendingScopePricePreviewClientRequestRef, setRemoteError, stateRef])

  const proposeScopeChangeFromKaelIncident = useCallback(async (quoteId: string) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo đề xuất')
    const requestFingerprint = `job-incident-scope-proposal:${jobId}:${quoteId}`
    const result = await workerService.proposeScopeChangeFromKaelIncident(jobId, {
      client_request_id: stableClientRequestId(
        pendingScopeProposalClientRequestRef,
        requestFingerprint,
      ),
      quote_id: quoteId,
    })
    if (!result.success) return setRemoteError(result)
    clearStableClientRequestId(pendingScopeProposalClientRequestRef, requestFingerprint)
    await refreshCurrentJob()
    return true
  }, [pendingScopeProposalClientRequestRef, refreshCurrentJob, setRemoteError, stateRef])

  const decideScopeChange = useCallback(async (scopeChangeId: string, input: CustomerScopeDecisionInput) => {
    if (customerScopeDecisionBusyRef.current) return false
    customerScopeDecisionBusyRef.current = scopeChangeId
    setCustomerScopeDecisionBusyId(scopeChangeId)
    try {
      const result = await jobService.decideScopeChange(scopeChangeId, input)
      if (!result.success) return setRemoteError(result)
      await refreshCurrentJob()
      return true
    } finally {
      customerScopeDecisionBusyRef.current = null
      setCustomerScopeDecisionBusyId(null)
    }
  }, [refreshCurrentJob, setRemoteError])

  return {
    customerScopeDecisionBusyId,
    decideScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    previewScopeChangeFromKaelIncident,
    proposeScopeChangeFromKaelIncident,
    requestScopeChange,
  }
}
