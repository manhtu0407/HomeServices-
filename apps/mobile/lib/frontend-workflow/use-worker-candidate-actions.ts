import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type Dispatch, type RefObject } from 'react'
import { AppState } from 'react-native'
import { candidateDecisionStatusSchema, isValidRemoteJobSnapshot, type LocalWorkflowAction, type LocalWorkflowState, type UserRole } from '@nestscout/shared'
import { createClientDiagnosticMetadata } from '../api'
import type { WorkerCandidateView } from '../api-types'
import type { ApiResponseMetadata } from '../api-types/shared'
import type { AppLanguage } from '../app-language'
import { jobService } from '../services'
import { localizeWorkflowError, type WorkflowErrorInput } from './errors'
import { getRemoteJobId, isAppForeground } from './helpers'
import { jobDetailToSnapshot } from './snapshots'
import { listCandidateDecisions, prepareCandidateDecision, sameCandidateDecision, storeCandidateDecision,
  type CandidateDecisionIntent, type PendingCandidateDecision } from './candidate-decision-recovery'

type CandidateFlight = { generation: number; intent?: CandidateDecisionIntent; request: Promise<boolean> }
type CandidateSession = { active: boolean; generation: number; remaining: number; polling: boolean;
  flights: Map<string, CandidateFlight>; reads: Map<string, Promise<boolean>>; refreshed: Set<string> }
type CandidateViewState = { session: CandidateSession; generation: number; jobId: string;
  candidate: WorkerCandidateView | null; loading: boolean; error: WorkflowErrorInput | null }
type WorkerCandidateActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  customerStatus: string | undefined
  language: AppLanguage
  remoteJobId: string | null
  role: UserRole | null
  sessionUserId: string | null
  sessionAccessToken?: string
  stateRef: RefObject<LocalWorkflowState>
}

const failure = (code: string, meta?: ApiResponseMetadata): WorkflowErrorInput => ({
  success: false, status: 0, error: '', code, meta: meta ?? createClientDiagnosticMetadata(),
})

export function useWorkerCandidateActions({ dispatch, customerStatus, language, remoteJobId, role,
  sessionUserId, sessionAccessToken, stateRef }: WorkerCandidateActionsInput) {
  const session = useMemo<CandidateSession>(() => ({ active: false, generation: 0, remaining: 20, polling: false,
    flights: new Map(), reads: new Map(), refreshed: new Set() }), [role, sessionUserId])
  const [view, setView] = useState<CandidateViewState | null>(null)
  const viewRef = useRef<CandidateViewState | null>(null)
  const [known, setKnown] = useState<{ session: CandidateSession; generation: number; records: PendingCandidateDecision[] } | null>(null)
  const revision = useRef(0)
  const publishView = useCallback((next: CandidateViewState) => { viewRef.current = next; setView(next) }, [])
  const report = useCallback((jobId: string, code: string, meta?: ApiResponseMetadata) => {
    if (!session.active || !isAppForeground() || getRemoteJobId(stateRef.current) !== jobId) return false
    const prior = viewRef.current
    publishView({ session, generation: session.generation, jobId, loading: false,
      candidate: prior?.session === session && prior.jobId === jobId ? prior.candidate : null, error: failure(code, meta) })
    return false
  }, [publishView, session, stateRef])

  const loadCandidate = useCallback((jobId: string): Promise<boolean> => {
    const generation = session.generation
    const visible = () => session.active && session.generation === generation && isAppForeground()
      && getRemoteJobId(stateRef.current) === jobId
    if (role !== 'customer' || !sessionUserId || !sessionAccessToken || !visible()) return Promise.resolve(false)
    const key = `${generation}:${jobId}`
    const priorRead = session.reads.get(key)
    if (priorRead) return priorRead
    const prior = viewRef.current
    publishView({ session, generation, jobId, loading: true, error: prior?.session === session && prior.jobId === jobId ? prior.error : null,
      candidate: prior?.session === session && prior.jobId === jobId ? prior.candidate : null })
    const request = (async () => {
      const result = await jobService.getWorkerCandidate(jobId, sessionAccessToken)
      if (!visible()) return false
      if (!result.success || result.data.job_id !== jobId) return report(jobId, 'CANDIDATE_STATE_UNAVAILABLE', result.meta)
      const candidate = result.data.candidate
      if (candidate !== null && !candidateDecisionStatusSchema.safeParse({
        job_id: jobId, candidate_id: candidate?.candidate_id, worker_id: candidate?.worker_id,
        candidate_status: candidate?.status, receipt: null,
      }).success) return report(jobId, 'CANDIDATE_STATE_UNAVAILABLE', result.meta)
      const latest = viewRef.current
      publishView({ session, generation, jobId, candidate, loading: false,
        error: latest?.session === session && latest.jobId === jobId ? latest.error : null })
      return true
    })().catch(() => visible() ? report(jobId, 'CANDIDATE_STATE_UNAVAILABLE') : false)
      .finally(() => { if (session.reads.get(key) === request) session.reads.delete(key) })
    session.reads.set(key, request)
    return request
  }, [publishView, report, role, session, sessionAccessToken, sessionUserId, stateRef])

  const process = useCallback((jobId: string, intent?: CandidateDecisionIntent): Promise<boolean> => {
    const generation = session.generation
    const current = () => session.active && session.generation === generation
    const visible = () => current() && isAppForeground() && getRemoteJobId(stateRef.current) === jobId
    const fail = (code: string, meta?: ApiResponseMetadata) => current() ? report(jobId, code, meta) : false
    if (!current() || !isAppForeground() || role !== 'customer' || !sessionUserId || !sessionAccessToken) return Promise.resolve(false)
    const flight = session.flights.get(jobId)
    if (flight?.generation === generation) {
      if (intent && (!flight.intent || !sameCandidateDecision(flight.intent, intent))) return Promise.resolve(false)
      return flight.request
    }
    const publishRecord = (record: PendingCandidateDecision) => {
      if (!current()) return
      revision.current += 1
      setKnown((prior) => ({ session, generation,
        records: [...(prior?.session === session ? prior.records : []).filter((entry) => entry.jobId !== jobId), record] }))
    }
    const request = (async () => {
      let pending: PendingCandidateDecision | null | undefined
      revision.current += 1
      try {
        pending = intent ? await prepareCandidateDecision(sessionUserId, jobId, intent, current)
          : (await listCandidateDecisions(sessionUserId)).find((entry) => entry.jobId === jobId)
      } catch (error) {
        if (current()) setKnown(null)
        return fail(error instanceof Error && error.message === 'CANDIDATE_DECISION_CONFLICT' ? error.message : 'CANDIDATE_STORAGE_UNAVAILABLE')
      }
      if (!current() || !pending) return false
      const activeFlight = session.flights.get(jobId)
      if (activeFlight?.generation === generation) activeFlight.intent = pending.intent
      publishRecord(pending)
      if (pending.resolution === 'pending') fail('CANDIDATE_DECISION_OUTCOME_UNKNOWN')
      if (!isAppForeground()) return false
      if (pending.resolution === 'pending') {
        const read = async () => {
          const result = await jobService.getWorkerCandidateDecision(jobId, pending!.intent.candidate_id, sessionAccessToken)
          if (!current() || !isAppForeground()) return null
          const parsed = result.success ? candidateDecisionStatusSchema.safeParse(result.data) : null
          if (!parsed?.success || parsed.data.job_id !== jobId || parsed.data.candidate_id !== pending!.intent.candidate_id
            || parsed.data.worker_id !== pending!.intent.worker_id) {
            fail('CANDIDATE_DECISION_OUTCOME_UNKNOWN', result.meta)
            return null
          }
          return parsed.data
        }
        let status = await read()
        if (!current() || !isAppForeground() || !status) return false
        if (!status.receipt && status.candidate_status === 'proposed') {
          // Only persisted consent for this immutable candidate may be replayed.
          const result = pending.intent.decision === 'confirm'
            ? await jobService.confirmWorkerCandidate(jobId, pending.intent.candidate_id, sessionAccessToken)
            : await jobService.rejectWorkerCandidate(jobId, pending.intent.candidate_id, sessionAccessToken)
          if (!current() || !isAppForeground()) return false
          status = await read()
          if (!status) return false
          if (!status.receipt && status.candidate_status === 'proposed') {
            return fail(result.success ? 'CANDIDATE_DECISION_OUTCOME_UNKNOWN'
              : result.code === 'CLIENT_UPDATE_REQUIRED' ? result.code : 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', result.meta)
          }
        }
        pending = { ...pending, receipt: status.receipt,
          resolution: status.receipt?.decision === pending.intent.decision ? 'recorded' : 'superseded' }
        try {
          if (!await storeCandidateDecision(pending, current)) return fail('CANDIDATE_STORAGE_UNAVAILABLE')
        } catch { return fail('CANDIDATE_STORAGE_UNAVAILABLE') }
        if (!current()) return false
        publishRecord(pending)
      }
      // A historical decision is not proof that the Worker is still the current official match.
      if (!visible()) return pending.resolution === 'recorded'
      publishView({ session, generation, jobId, candidate: null, loading: true,
        error: pending.resolution === 'superseded' ? failure('CANDIDATE_DECISION_CONFLICT') : null })
      const result = await jobService.getJob(jobId, sessionAccessToken)
      if (!visible()) return false
      if (!result.success || result.data.job?.id !== jobId) return fail('CANDIDATE_STATE_UNAVAILABLE', result.meta)
      const snapshot = jobDetailToSnapshot(result.data, false)
      if (!isValidRemoteJobSnapshot(snapshot)) return fail('CANDIDATE_STATE_UNAVAILABLE', result.meta)
      dispatch({ type: 'hydrate_remote_job', job: snapshot })
      session.refreshed.add(pending.localId)
      publishView({ session, generation, jobId, candidate: null, loading: false,
        error: pending.resolution === 'superseded' ? failure('CANDIDATE_DECISION_CONFLICT') : null })
      return pending.resolution === 'recorded'
    })().catch(() => fail('CANDIDATE_DECISION_OUTCOME_UNKNOWN')).finally(() => {
      if (session.flights.get(jobId)?.request === request) session.flights.delete(jobId)
    })
    session.flights.set(jobId, { generation, intent, request })
    return request
  }, [dispatch, publishView, report, role, session, sessionAccessToken, sessionUserId, stateRef])

  const refreshWorkerCandidate = useCallback(async (override?: string) => {
    const jobId = override ?? getRemoteJobId(stateRef.current)
    if (!jobId || !session.active || role !== 'customer' || !sessionUserId || !sessionAccessToken || !isAppForeground()) return false
    session.remaining = 20
    await process(jobId)
    return loadCandidate(jobId)
  }, [loadCandidate, process, role, session, sessionAccessToken, sessionUserId, stateRef])

  const reconcile = useEffectEvent(async () => {
    if (!session.active || role !== 'customer' || !sessionUserId || !sessionAccessToken || !isAppForeground()
      || session.polling || session.remaining <= 0) return
    session.polling = true
    session.remaining -= 1
    const generation = session.generation
    const current = () => session.active && session.generation === generation
    try {
      const version = revision.current
      const records = await listCandidateDecisions(sessionUserId)
      if (!current()) return
      if (version === revision.current) setKnown({ session, generation, records })
      for (const record of records) {
        if (!current() || !isAppForeground()) break
        if (record.resolution === 'pending' || !session.refreshed.has(record.localId)) await process(record.jobId)
      }
      if (current() && remoteJobId && customerStatus === 'worker_candidate_pending' && !session.flights.has(remoteJobId)) {
        await loadCandidate(remoteJobId)
      }
      if (current() && session.remaining === 0) {
        const latest = await listCandidateDecisions(sessionUserId)
        const unresolved = latest.find((entry) => entry.jobId === getRemoteJobId(stateRef.current)
          && (entry.resolution === 'pending' || !session.refreshed.has(entry.localId)))
        if (current() && unresolved) report(unresolved.jobId, 'CANDIDATE_RECOVERY_REQUIRED')
      }
    } catch {
      if (current()) {
        setKnown(null)
        const jobId = getRemoteJobId(stateRef.current)
        if (jobId) report(jobId, 'CANDIDATE_STORAGE_UNAVAILABLE')
      }
    } finally { if (current()) session.polling = false }
  })
  useEffect(() => {
    if (role !== 'customer' || !sessionUserId) return
    session.active = true
    session.generation += 1
    session.polling = false
    session.remaining = 20
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { session.remaining = 20; session.refreshed.clear(); void reconcile() }
    })
    const timer = setInterval(() => { void reconcile() }, 5_000)
    return () => { session.active = false; session.generation += 1; clearInterval(timer); subscription.remove() }
  }, [role, session, sessionUserId])
  useEffect(() => {
    session.remaining = 20
    void reconcile()
    if (role === 'customer' && remoteJobId && customerStatus === 'worker_candidate_pending') {
      void loadCandidate(remoteJobId)
    }
  }, [customerStatus, loadCandidate, remoteJobId, role, session])

  const scoped = view?.session === session && view.generation === session.generation && view.jobId === remoteJobId
  const record = known?.session === session && known.generation === session.generation
    ? known.records.find((entry) => entry.jobId === remoteJobId) : undefined
  const customerWorkerCandidate = scoped && role === 'customer' && customerStatus === 'worker_candidate_pending' ? view.candidate : null
  const customerWorkerCandidateBusy = role === 'customer' && Boolean(!known || known.session !== session
    || known.generation !== session.generation || (scoped && view.loading) || record?.resolution === 'pending'
    || (record && !session.refreshed.has(record.localId)))
  const customerWorkerCandidateError = scoped && view.error ? localizeWorkflowError(view.error, language) : null

  const decideWorkerCandidate = useCallback((decision: 'confirm' | 'reject') => {
    const jobId = remoteJobId
    const candidate = customerWorkerCandidate
    const latest = viewRef.current
    if (!session.active || role !== 'customer' || !sessionUserId || !sessionAccessToken || !isAppForeground()
      || !jobId || !candidate || candidate.status !== 'proposed' || customerWorkerCandidateBusy
      || getRemoteJobId(stateRef.current) !== jobId || latest?.session !== session || latest.jobId !== jobId
      || latest.generation !== session.generation || latest.loading
      || latest.candidate?.candidate_id !== candidate.candidate_id || latest.candidate?.worker_id !== candidate.worker_id) return Promise.resolve(false)
    session.remaining = 20
    return process(jobId, { candidate_id: candidate.candidate_id, worker_id: candidate.worker_id, decision })
  }, [customerWorkerCandidate, customerWorkerCandidateBusy, process, remoteJobId, role, session, sessionAccessToken, sessionUserId, stateRef])

  const setWorkerCandidateFavorite = useCallback(async (isFavorite: boolean) => {
    const jobId = remoteJobId
    const candidate = customerWorkerCandidate
    const generation = session.generation
    const visible = () => session.active && session.generation === generation && isAppForeground()
      && getRemoteJobId(stateRef.current) === jobId && viewRef.current?.session === session
      && viewRef.current.generation === generation && viewRef.current.jobId === jobId
      && viewRef.current.candidate?.candidate_id === candidate?.candidate_id
    if (!jobId || !candidate || customerWorkerCandidateBusy || role !== 'customer' || !sessionAccessToken || !visible()
      || viewRef.current?.loading || session.flights.has(jobId)) return false
    publishView({ session, generation, jobId, candidate, loading: true, error: null })
    try {
      const result = await jobService.setFavoriteWorker(candidate.worker_id, isFavorite, sessionAccessToken)
      if (!visible()) return false
      if (!result.success || result.data.worker_id !== candidate.worker_id || result.data.is_favorite !== isFavorite) {
        return report(jobId, 'CANDIDATE_STATE_UNAVAILABLE', result.meta)
      }
      publishView({ session, generation, jobId, candidate: { ...candidate, is_favorite: result.data.is_favorite }, loading: false, error: null })
      return true
    } catch { return visible() ? report(jobId, 'CANDIDATE_STATE_UNAVAILABLE') : false }
  }, [customerWorkerCandidate, customerWorkerCandidateBusy, publishView, remoteJobId, report, role, session, sessionAccessToken, stateRef])

  return { customerWorkerCandidate, customerWorkerCandidateBusy, customerWorkerCandidateError,
    decideWorkerCandidate, refreshWorkerCandidate, setWorkerCandidateFavorite }
}
