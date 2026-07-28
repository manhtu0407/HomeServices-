import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { LocalWorkflowState, UserRole } from '@nestscout/shared'
import type { WorkerCandidateView } from '../api-types'
import type { AppLanguage } from '../app-language'
import { jobService } from '../services'
import { localizeWorkflowError } from './errors'
import { getRemoteJobId } from './helpers'

type CustomerWorkerCandidateState = {
  candidate: WorkerCandidateView | null
  busy: boolean
  error: string | null
}

const initialCustomerWorkerCandidateState: CustomerWorkerCandidateState = {
  candidate: null,
  busy: false,
  error: null,
}

type WorkerCandidateActionsInput = {
  customerStatus: string | undefined
  hydrateRemoteJobById: (jobId: string) => Promise<boolean>
  language: AppLanguage
  remoteJobId: string | null
  role: UserRole | null
  sessionUserId: string | null
  stateRef: RefObject<LocalWorkflowState>
}

export function useWorkerCandidateActions({
  customerStatus,
  hydrateRemoteJobById,
  language,
  remoteJobId,
  role,
  sessionUserId,
  stateRef,
}: WorkerCandidateActionsInput) {
  const [customerWorkerCandidateState, setCustomerWorkerCandidateState] = useState<CustomerWorkerCandidateState>(initialCustomerWorkerCandidateState)
  const customerWorkerCandidate = customerWorkerCandidateState.candidate
  const customerWorkerCandidateBusy = customerWorkerCandidateState.busy
  const customerWorkerCandidateError = customerWorkerCandidateState.error

  const refreshWorkerCandidate = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) {
      setCustomerWorkerCandidateState({
        busy: false,
        candidate: null,
        error: language === 'vi' ? 'Chưa có công việc để tải hồ sơ thợ.' : 'There is no job to load a worker profile for.',
      })
      return false
    }
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = await jobService.getWorkerCandidate(jobId)
    if (!result.success) {
      setCustomerWorkerCandidateState({
        busy: false,
        candidate: null,
        error: localizeWorkflowError(result.error, language),
      })
      return false
    }
    setCustomerWorkerCandidateState({ busy: false, candidate: result.data.candidate, error: null })
    return true
  }, [language, stateRef])

  const decideWorkerCandidate = useCallback(async (decision: 'confirm' | 'reject') => {
    const jobId = getRemoteJobId(stateRef.current)
    const candidateId = customerWorkerCandidate?.candidate_id
    if (!jobId || !candidateId || customerWorkerCandidateBusy) return false
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = decision === 'confirm'
      ? await jobService.confirmWorkerCandidate(jobId, candidateId)
      : await jobService.rejectWorkerCandidate(jobId, candidateId)
    if (!result.success) {
      setCustomerWorkerCandidateState((current) => ({
        ...current,
        busy: false,
        error: localizeWorkflowError(result.error, language),
      }))
      return false
    }
    const decidedCandidate = decision === 'confirm' ? result.data.candidate : null
    const hydrated = await hydrateRemoteJobById(jobId)
    setCustomerWorkerCandidateState({
      busy: false,
      candidate: decidedCandidate,
      error: hydrated
        ? null
        : language === 'vi'
          ? 'Đã ghi nhận quyết định nhưng chưa đồng bộ trạng thái mới.'
          : 'Your decision was saved, but the new state has not synced yet.',
    })
    return true
  }, [customerWorkerCandidate?.candidate_id, customerWorkerCandidateBusy, hydrateRemoteJobById, language, stateRef])

  const setWorkerCandidateFavorite = useCallback(async (isFavorite: boolean) => {
    const workerId = customerWorkerCandidate?.worker_id
    if (!workerId || customerWorkerCandidateBusy) return false
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = await jobService.setFavoriteWorker(workerId, isFavorite)
    if (!result.success) {
      setCustomerWorkerCandidateState((current) => ({
        ...current,
        busy: false,
        error: localizeWorkflowError(result.error, language),
      }))
      return false
    }
    setCustomerWorkerCandidateState((current) => ({
      busy: false,
      candidate: current.candidate
        ? { ...current.candidate, is_favorite: result.data.is_favorite }
        : null,
      error: null,
    }))
    return true
  }, [customerWorkerCandidate?.worker_id, customerWorkerCandidateBusy, language])

  useEffect(() => {
    setCustomerWorkerCandidateState(initialCustomerWorkerCandidateState)
  }, [sessionUserId])

  useEffect(() => {
    if (
      (role !== 'customer' && role !== 'admin') ||
      !remoteJobId ||
      customerStatus !== 'worker_candidate_pending'
    ) {
      setCustomerWorkerCandidateState(initialCustomerWorkerCandidateState)
      return
    }
    void refreshWorkerCandidate(remoteJobId)
  }, [customerStatus, refreshWorkerCandidate, remoteJobId, role])

  return {
    customerWorkerCandidate,
    customerWorkerCandidateBusy,
    customerWorkerCandidateError,
    decideWorkerCandidate,
    refreshWorkerCandidate,
    setWorkerCandidateFavorite,
  }
}
