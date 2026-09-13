import { useCallback, useEffect, useEffectEvent, useRef, useState, type Dispatch, type RefObject } from 'react'
import { AppState } from 'react-native'
import type { JobMatchingPreferenceInput, LocalWorkflowAction, LocalWorkflowState, UserRole } from '@nestscout/shared'
import { createClientDiagnosticMetadata } from '../api'
import type { ApiResponseMetadata } from '../api-types/shared'
import type { AppLanguage } from '../app-language'
import { jobService } from '../services'
import { validateMatchingSelectionResult } from '../services/customer-matching-selection'
import { localizeWorkflowError, type WorkflowErrorHandler, type WorkflowErrorInput } from './errors'
import { getRemoteJobId, isAppForeground } from './helpers'
import { jobDetailToSnapshot } from './snapshots'
import {
  isMatchingSelectionTerminal, listMatchingSelections, matchingChoiceKey, MATCHING_SELECTION_REJECTIONS,
  prepareMatchingSelection, storeMatchingSelection, type PendingMatchingSelection,
} from './matching-selection-recovery'

type SelectionInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  role: UserRole | null
  sessionUserId: string | null
  sessionAccessToken?: string
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}
type Choice = Omit<JobMatchingPreferenceInput, 'client_request_id'>
export type MatchingSelectionView = {
  jobId: string | null
  scopeKey: string
  ready: boolean
  choice: Choice | null
}

export function useCustomerMatchingSelection({
  dispatch, language, role, sessionUserId, sessionAccessToken, setRemoteError, stateRef,
}: SelectionInput) {
  const lifecycle = useRef({ active: false, generation: 0 })
  const flights = useRef(new Map<string, { choice?: string; request: Promise<boolean> }>())
  const automatic = useRef({ inFlight: false, remaining: 20 })
  const hydrated = useRef(new Set<string>())
  const recordsRevision = useRef(0)
  const [knownSelections, setKnownSelections] = useState<{
    ownerId: string; generation: number; loaded: boolean; records: PendingMatchingSelection[]
  } | null>(null)
  const [feedback, setFeedback] = useState<{ ownerId: string; jobId: string; error: WorkflowErrorInput } | null>(null)

  const processSelection = useCallback((jobId: string, choice?: Choice): Promise<boolean> => {
    const generation = lifecycle.current.generation
    const current = () => lifecycle.current.active && lifecycle.current.generation === generation
    const visible = () => current() && getRemoteJobId(stateRef.current) === jobId
    const report = (code: string, meta?: ApiResponseMetadata) => {
      if (!visible() || !sessionUserId) return false
      const error = { success: false as const, code, error: '', status: 0, meta: meta ?? createClientDiagnosticMetadata() }
      if (code === 'MATCHING_PREFERENCE_STORAGE_UNAVAILABLE') setKnownSelections(null)
      setFeedback({ ownerId: sessionUserId, jobId, error })
      return setRemoteError(error)
    }
    const key = `${generation}:${sessionUserId}:${jobId}`
    const inFlight = flights.current.get(key)
    if (inFlight) {
      if (choice && inFlight.choice !== matchingChoiceKey(choice)) return Promise.resolve(report(inFlight.choice
        ? 'MATCHING_PREFERENCE_REQUEST_CONFLICT' : 'MATCHING_PREFERENCE_OUTCOME_UNKNOWN'))
      return inFlight.request
    }
    const request = (async () => {
      if (!current() || !isAppForeground()) return false
      if (role !== 'customer' || !sessionUserId || !sessionAccessToken) return report('AUTH_REQUIRED')
      let pending: PendingMatchingSelection | undefined
      const publish = (record: PendingMatchingSelection) => {
        if (!current()) return
        recordsRevision.current += 1
        setKnownSelections((prior) => ({
          ownerId: sessionUserId, generation,
          loaded: prior?.ownerId === sessionUserId && prior.generation === generation && prior.loaded,
          records: [...(prior?.ownerId === sessionUserId && prior.generation === generation ? prior.records : []).filter((entry) => entry.jobId !== jobId), record],
        }))
      }
      try {
        recordsRevision.current += 1
        pending = choice ? await prepareMatchingSelection(sessionUserId, jobId, choice)
          : (await listMatchingSelections(sessionUserId)).find((record) => record.jobId === jobId)
      } catch (error) {
        return report(error instanceof Error && error.message === 'MATCHING_PREFERENCE_REQUEST_CONFLICT'
          ? error.message : 'MATCHING_PREFERENCE_STORAGE_UNAVAILABLE')
      }
      if (pending) publish(pending)
      if (!pending || pending.rejectedCode || !current() || !isAppForeground()) return false
      const flight = flights.current.get(key)
      if (flight) flight.choice = matchingChoiceKey(pending.request)
      report('MATCHING_PREFERENCE_OUTCOME_UNKNOWN')
      let result = validateMatchingSelectionResult(
        await jobService.getMatchingPreferenceReceipt(jobId, pending.request.client_request_id, sessionAccessToken), jobId, pending.request,
      )
      if (!current() || !isAppForeground()) return false
      let posted = false
      // Only a definite absence can replay the persisted consent; an unreadable receipt cannot.
      if (!result.success && result.status === 404 && result.code === 'NOT_FOUND' && !pending.receipt) {
        posted = true
        result = validateMatchingSelectionResult(await jobService.setMatchingPreference(jobId, pending.request, sessionAccessToken), jobId, pending.request)
      }
      if (!current()) return false
      if (!result.success) {
        const rejectedCode = MATCHING_SELECTION_REJECTIONS.find((code) => code === result.code)
        if (posted && rejectedCode) {
          const rejected = { ...pending, rejectedCode }
          try { if (!await storeMatchingSelection(rejected)) return report('RECOVERY_REQUIRED', result.meta) }
          catch { return report('MATCHING_PREFERENCE_STORAGE_UNAVAILABLE', result.meta) }
          publish(rejected)
          return report(rejectedCode, result.meta)
        }
        return report('MATCHING_PREFERENCE_OUTCOME_UNKNOWN', result.meta)
      }
      const receipt = result.data.selection
      const meta = { ...createClientDiagnosticMetadata(), ...result.meta, supportCode: receipt.support_code }
      try {
        if (!await storeMatchingSelection({ ...pending, receipt, rejectedCode: null })) return report('RECOVERY_REQUIRED', meta)
      } catch { return report('MATCHING_PREFERENCE_STORAGE_UNAVAILABLE', meta) }
      publish({ ...pending, receipt, rejectedCode: null })
      if (!visible() || !isAppForeground()) return true
      const job = await jobService.getJob(jobId, sessionAccessToken)
      if (!visible() || !isAppForeground()) return true
      const validJob = job.success && job.data.job?.id === jobId
      if (validJob) {
        dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(job.data, false) })
        // Later lifecycle changes use the active-job reconciler, not another selection command.
        if (isMatchingSelectionTerminal(receipt)) hydrated.current.add(receipt.request_id)
      }
      const code = receipt.state === 'queued' ? 'MATCHING_PREFERENCE_QUEUED'
        : receipt.state === 'recovery_required' ? 'RECOVERY_REQUIRED'
          : receipt.state === 'no_reachable_worker' ? 'NO_REACHABLE_WORKER'
            : receipt.state === 'stopped' ? 'MATCHING_RETRY_STOPPED'
              : !validJob ? 'MATCHING_PREFERENCE_READ_UNAVAILABLE' : null
      if (code) report(code, meta)
      else setFeedback(null)
      return true
    })().catch(() => report('MATCHING_PREFERENCE_OUTCOME_UNKNOWN')).finally(() => {
      if (flights.current.get(key)?.request === request) flights.current.delete(key)
    })
    flights.current.set(key, { choice: choice ? matchingChoiceKey(choice) : undefined, request })
    return request
  }, [dispatch, role, sessionAccessToken, sessionUserId, setRemoteError, stateRef])

  const reconcile = useEffectEvent(async () => {
    if (!lifecycle.current.active || role !== 'customer' || !sessionUserId || !sessionAccessToken
      || !isAppForeground() || automatic.current.inFlight || automatic.current.remaining <= 0) return
    const generation = lifecycle.current.generation
    automatic.current.inFlight = true
    automatic.current.remaining -= 1
    try {
      const revision = recordsRevision.current
      const records = await listMatchingSelections(sessionUserId)
      // An older recovery read must not unlock consent prepared while storage was loading.
      if (lifecycle.current.active && lifecycle.current.generation === generation && revision === recordsRevision.current) {
        setKnownSelections({ ownerId: sessionUserId, generation, loaded: true, records })
      }
      for (const record of records) {
        if (!lifecycle.current.active || lifecycle.current.generation !== generation || !isAppForeground()) break
        if (!record.rejectedCode && !hydrated.current.has(record.request.client_request_id)) await processSelection(record.jobId)
      }
    } catch {
      if (lifecycle.current.active && lifecycle.current.generation === generation) {
        setKnownSelections(null)
        setRemoteError({ success: false, code: 'MATCHING_PREFERENCE_STORAGE_UNAVAILABLE', error: '', status: 0, meta: createClientDiagnosticMetadata() })
      }
    } finally { if (lifecycle.current.generation === generation) automatic.current.inFlight = false }
  })

  useEffect(() => {
    if (role !== 'customer' || !sessionUserId) return
    lifecycle.current.active = true
    lifecycle.current.generation += 1
    automatic.current = { inFlight: false, remaining: 20 }
    hydrated.current.clear()
    void reconcile()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { automatic.current.remaining = 20; void reconcile() }
    })
    const timer = setInterval(() => { void reconcile() }, 5_000)
    return () => {
      lifecycle.current.active = false
      lifecycle.current.generation += 1
      clearInterval(timer)
      subscription.remove()
    }
  }, [role, sessionUserId])

  const setMatchingPreference = useCallback((choice: Choice) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return Promise.resolve(setRemoteError('Chưa có yêu cầu để tìm thợ'))
    automatic.current.remaining = 20
    return processSelection(jobId, choice)
  }, [processSelection, setRemoteError, stateRef])

  const jobId = getRemoteJobId(stateRef.current)
  const known = role === 'customer' && knownSelections?.ownerId === sessionUserId
    && knownSelections.generation === lifecycle.current.generation ? knownSelections : null
  const record = known?.records.find((entry) => entry.jobId === jobId)
  const locked = record && (record.receipt || !record.rejectedCode || record.rejectedCode === 'MATCHING_PREFERENCE_REQUEST_CONFLICT')
  const customerMatchingSelectionState: MatchingSelectionView = {
    jobId, scopeKey: `${sessionUserId}:${jobId}`,
    ready: Boolean(sessionAccessToken && jobId && (known?.loaded || record)),
    choice: locked ? { mode: record.request.mode, worker_id: record.request.worker_id, auto_general: record.request.auto_general } : null,
  }
  return {
    setMatchingPreference,
    customerMatchingSelectionState,
    customerMatchingSelectionFeedback: feedback?.ownerId === sessionUserId
      ? { jobId: feedback.jobId, message: localizeWorkflowError(feedback.error, language) } : null,
  }
}
