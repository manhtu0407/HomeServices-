import { useCallback, useRef, useState, type RefObject } from 'react'
import type {
  CustomerScopeDecisionInput,
  LocalWorkflowState,
  WorkerScopeChangeInput,
} from '@nestscout/shared'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '../client-request-id'
import { jobService, workerService } from '../services'
import { getRemoteJobId, scopeChangeClientRequestFingerprint } from './helpers'

export type WorkerScopeChangeDraftInput = Omit<WorkerScopeChangeInput, 'client_request_id'> & {
  client_request_id?: string
}

type ScopeChangeActionsInput = {
  pendingDirectScopeChangeClientRequestRef: RefObject<PendingClientRequestId | null>
  pendingIncidentOpenClientRequestRef: RefObject<PendingClientRequestId | null>
  pendingScopeProposalClientRequestRef: RefObject<PendingClientRequestId | null>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: (error: string) => false
  stateRef: RefObject<LocalWorkflowState>
}

export function useScopeChangeActions({
  pendingDirectScopeChangeClientRequestRef,
  pendingIncidentOpenClientRequestRef,
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
    if (!result.success) return setRemoteError(result.error)
    clearStableClientRequestId(pendingDirectScopeChangeClientRequestRef, requestFingerprint)
    await refreshCurrentJob()
    return true
  }, [pendingDirectScopeChangeClientRequestRef, refreshCurrentJob, setRemoteError, stateRef])

  const getKaelJobIncident = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return false
    const result = await workerService.getKaelJobIncident(jobId)
    if (!result.success) {
      setRemoteError(result.error)
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
      setRemoteError(result.error)
      return false
    }
    clearStableClientRequestId(pendingIncidentOpenClientRequestRef, requestFingerprint)
    return result.data
  }, [pendingIncidentOpenClientRequestRef, setRemoteError, stateRef])

  const proposeScopeChangeFromKaelIncident = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo đề xuất')
    const requestFingerprint = `job-incident-scope-proposal:${jobId}`
    const result = await workerService.proposeScopeChangeFromKaelIncident(jobId, {
      client_request_id: stableClientRequestId(
        pendingScopeProposalClientRequestRef,
        requestFingerprint,
      ),
    })
    if (!result.success) return setRemoteError(result.error)
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
      if (!result.success) return setRemoteError(result.error)
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
    proposeScopeChangeFromKaelIncident,
    requestScopeChange,
  }
}
