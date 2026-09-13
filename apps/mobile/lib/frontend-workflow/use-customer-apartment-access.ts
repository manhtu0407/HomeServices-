import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type Dispatch, type RefObject } from 'react'
import { AppState } from 'react-native'
import { isValidRemoteJobSnapshot, type ApartmentAccessAuthorizationInput, type LocalWorkflowAction, type LocalWorkflowState, type UserRole } from '@nestscout/shared'
import { createClientDiagnosticMetadata } from '../api'
import type { ApiResponseMetadata } from '../api-types/shared'
import type { AppLanguage } from '../app-language'
import { jobService } from '../services'
import { readApartmentContext, readApartmentReceipt } from '../services/customer-apartment-access'
import { localizeWorkflowError, type WorkflowErrorHandler, type WorkflowErrorInput } from './errors'
import { getRemoteJobId, isAppForeground } from './helpers'
import { jobDetailToSnapshot } from './snapshots'
import { listApartmentAccess, prepareApartmentAccess, sameApartmentIntent, storeApartmentAccess, type PendingApartmentAccess } from './apartment-access-recovery'

type AccessInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  role: UserRole | null
  sessionUserId: string | null
  sessionAccessToken?: string
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}
export type ApartmentAccessView = { jobId: string | null; ready: boolean; pending: boolean; message: string | null }

export function useCustomerApartmentAccess({ dispatch, language, role, sessionUserId, sessionAccessToken, setRemoteError, stateRef }: AccessInput) {
  // Retired callbacks remain retired even if the same account signs in again.
  const session = useMemo(() => ({ active: false, generation: 0 }), [role, sessionUserId])
  const flights = useRef(new Map<string, {
    session: typeof session; intent?: ApartmentAccessAuthorizationInput; request: Promise<boolean>
  }>())
  const automatic = useRef({ inFlight: false, remaining: 20 })
  const revision = useRef(0)
  const refreshedReceipts = useRef(new Set<string>())
  const [known, setKnown] = useState<{ session: typeof session; records: PendingApartmentAccess[] } | null>(null)
  const [feedback, setFeedback] = useState<{ session: typeof session; jobId: string; error: WorkflowErrorInput } | null>(null)

  const process = useCallback((jobId: string, intent?: ApartmentAccessAuthorizationInput): Promise<boolean> => {
    const generation = session.generation
    const current = () => session.active && session.generation === generation
    const visible = () => current() && isAppForeground() && getRemoteJobId(stateRef.current) === jobId
    const report = (code: string, meta?: ApiResponseMetadata) => {
      if (!visible()) return false
      const error = { success: false as const, error: '', code, status: 0, meta: meta ?? createClientDiagnosticMetadata() }
      if (code === 'ACCESS_STORAGE_UNAVAILABLE') setKnown(null)
      setFeedback({ session, jobId, error })
      return setRemoteError(error)
    }
    if (!current() || !isAppForeground() || role !== 'customer' || !sessionUserId || !sessionAccessToken) return Promise.resolve(false)
    const key = `${sessionUserId}:${generation}:${jobId}`
    const flight = flights.current.get(key)
    if (flight?.session === session) {
      if (intent && (!flight.intent || !sameApartmentIntent(flight.intent, intent))) {
        return Promise.resolve(report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN'))
      }
      return flight.request
    }
    const publish = (record: PendingApartmentAccess) => {
      if (!current()) return
      revision.current += 1
      setKnown((prior) => ({ session, records: [...(prior?.session === session ? prior.records : []).filter((entry) => entry.jobId !== jobId), record] }))
    }
    const request = (async () => {
      let pending: PendingApartmentAccess | null | undefined
      try {
        revision.current += 1
        pending = intent ? await prepareApartmentAccess(sessionUserId, jobId, intent, current)
          : (await listApartmentAccess(sessionUserId)).find((entry) => entry.jobId === jobId)
      } catch (error) {
        return report(error instanceof Error && error.message === 'ACCESS_CONTEXT_CHANGED' ? error.message : 'ACCESS_STORAGE_UNAVAILABLE')
      }
      if (!current() || !pending || !['pending', 'confirmed'].includes(pending.resolution)) return false
      const activeFlight = flights.current.get(key)
      if (activeFlight?.session === session) activeFlight.intent = pending.intent
      publish(pending)
      report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN')
      if (!isAppForeground()) return false
      const detail = await jobService.getJob(jobId, sessionAccessToken)
      if (!current() || !isAppForeground()) return false
      if (!detail.success || detail.data.job?.id !== jobId) return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', detail.meta)
      const access = detail.data.job.address_access
      const context = readApartmentContext(access?.authorization_context)
      const snapshot = jobDetailToSnapshot(detail.data, false)
      if (!isValidRemoteJobSnapshot(snapshot)) return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', detail.meta)
      // An old server or malformed projection cannot prove the command absent.
      if (!access || !Object.hasOwn(access, 'authorization_context') || !Object.hasOwn(access, 'authorization_receipt')
        || (access.authorization_context !== null && !context)) return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', detail.meta)
      let receipt = readApartmentReceipt(access.authorization_receipt, jobId, pending.intent)
      const same = context && sameApartmentIntent(context, pending.intent)
      if (pending.resolution === 'confirmed') {
        if (same && !receipt) return report('ACCESS_READ_UNAVAILABLE', detail.meta)
        if (visible()) {
          dispatch({ type: 'hydrate_remote_job', job: snapshot })
          setFeedback(null)
          refreshedReceipts.current.add(pending.localId)
        }
        return true
      }
      if (access.authorization_receipt !== null && !receipt && same) return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', detail.meta)
      const settle = async (record: PendingApartmentAccess) => {
        try { if (!await storeApartmentAccess(record, current)) return report('ACCESS_STORAGE_UNAVAILABLE') }
        catch { return report('ACCESS_STORAGE_UNAVAILABLE') }
        publish(record)
        return current()
      }
      if (!same) {
        if (!await settle({ ...pending, receipt: null, resolution: 'superseded' })) return false
        if (visible()) dispatch({ type: 'hydrate_remote_job', job: snapshot })
        return report('ACCESS_CONTEXT_CHANGED', detail.meta)
      }
      if (!receipt) {
        if (!access.worker_checked_in || access.exact_unit_released || access.release_stage !== 'building_released') {
          return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', detail.meta)
        }
        // Replay only the persisted, unchanged consent after an authoritative read.
        const result = await jobService.authorizeApartmentAccess(jobId, pending.intent, sessionAccessToken)
        if (!current()) return false
        if (!result.success) {
          if (result.status === 409 && ['ACCESS_CONTEXT_CHANGED', 'ACCESS_NOT_READY', 'CLIENT_UPDATE_REQUIRED'].includes(result.code ?? '')) {
            if (!await settle({ ...pending, receipt: null, resolution: 'rejected' })) return false
            return report(result.code!, result.meta)
          }
          return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', result.meta)
        }
        receipt = readApartmentReceipt(result.data, jobId, pending.intent)
        if (!receipt) return report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', result.meta)
      }
      if (!await settle({ ...pending, receipt, resolution: 'confirmed' })) return false
      if (!visible()) return true
      // A command receipt proves the grant, not that the assignment is still current.
      const refreshed = await jobService.getJob(jobId, sessionAccessToken)
      if (!visible()) return true
      if (!refreshed.success || refreshed.data.job?.id !== jobId) return report('ACCESS_READ_UNAVAILABLE', refreshed.meta)
      const refreshedSnapshot = jobDetailToSnapshot(refreshed.data, false)
      if (!isValidRemoteJobSnapshot(refreshedSnapshot)) return report('ACCESS_READ_UNAVAILABLE', refreshed.meta)
      const refreshedContext = readApartmentContext(refreshed.data.job.address_access.authorization_context)
      if (refreshedContext && sameApartmentIntent(refreshedContext, pending.intent)
        && !readApartmentReceipt(refreshed.data.job.address_access.authorization_receipt, jobId, pending.intent)) {
        return report('ACCESS_READ_UNAVAILABLE', refreshed.meta)
      }
      dispatch({ type: 'hydrate_remote_job', job: refreshedSnapshot })
      refreshedReceipts.current.add(pending.localId)
      setFeedback(null)
      return true
    })().catch(() => report('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN')).finally(() => {
      if (flights.current.get(key)?.request === request) flights.current.delete(key)
    })
    flights.current.set(key, { session, intent, request })
    return request
  }, [dispatch, role, session, sessionAccessToken, sessionUserId, setRemoteError, stateRef])

  const reconcile = useEffectEvent(async () => {
    if (!session.active || role !== 'customer' || !sessionUserId || !sessionAccessToken || !isAppForeground()
      || automatic.current.inFlight || automatic.current.remaining <= 0) return
    automatic.current.inFlight = true
    automatic.current.remaining -= 1
    const generation = session.generation
    const current = () => session.active && session.generation === generation
    try {
      const version = revision.current
      const records = await listApartmentAccess(sessionUserId)
      if (!current()) return
      if (version === revision.current) setKnown({ session, records })
      for (const record of records) {
        if (!current() || !isAppForeground()) break
        if (record.resolution === 'pending' || (record.resolution === 'confirmed' && !refreshedReceipts.current.has(record.localId))) await process(record.jobId)
      }
    } catch {
      if (current()) {
        setKnown(null)
        const jobId = getRemoteJobId(stateRef.current)
        const error = { success: false as const, error: '', code: 'ACCESS_STORAGE_UNAVAILABLE', status: 0, meta: createClientDiagnosticMetadata() }
        if (jobId) setFeedback({ session, jobId, error })
        setRemoteError(error)
      }
    } finally { if (current()) automatic.current.inFlight = false }
  })

  useEffect(() => {
    if (role !== 'customer' || !sessionUserId) return
    session.active = true
    session.generation += 1
    automatic.current = { inFlight: false, remaining: 20 }
    refreshedReceipts.current.clear()
    void reconcile()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { automatic.current.remaining = 20; refreshedReceipts.current.clear(); void reconcile() }
    })
    const timer = setInterval(() => { void reconcile() }, 5_000)
    return () => { session.active = false; session.generation += 1; clearInterval(timer); subscription.remove() }
  }, [role, session, sessionUserId])

  const jobId = getRemoteJobId(stateRef.current)
  const renderedContext = readApartmentContext(stateRef.current.deal?.broadcast?.addressAccess?.authorization_context)
  const expectedWorker = renderedContext?.expected_worker_id
  const expectedVisit = renderedContext?.expected_check_in_at
  const authorizeApartmentAccess = useCallback(() => {
    const access = stateRef.current.deal?.broadcast?.addressAccess
    const latest = readApartmentContext(access?.authorization_context)
    if (!session.active || role !== 'customer' || !sessionUserId || !sessionAccessToken) return Promise.resolve(false)
    if (!jobId || !expectedWorker || !expectedVisit || !latest || !access?.worker_checked_in || access.exact_unit_released) {
      return Promise.resolve(setRemoteError({ success: false, error: '', code: 'ACCESS_NOT_READY', status: 409, meta: createClientDiagnosticMetadata() }))
    }
    const intent = { expected_worker_id: expectedWorker, expected_check_in_at: expectedVisit }
    if (getRemoteJobId(stateRef.current) !== jobId || !sameApartmentIntent(intent, latest)) {
      return Promise.resolve(setRemoteError({ success: false, error: '', code: 'ACCESS_CONTEXT_CHANGED', status: 409, meta: createClientDiagnosticMetadata() }))
    }
    automatic.current.remaining = 20
    return process(jobId, intent)
  }, [expectedVisit, expectedWorker, jobId, process, role, session, sessionAccessToken, sessionUserId, setRemoteError, stateRef])

  const record = known?.session === session ? known.records.find((entry) => entry.jobId === jobId) : undefined
  const access = stateRef.current.deal?.broadcast?.addressAccess
  const pending = record?.resolution === 'pending'
  const confirmed = record?.resolution === 'confirmed' && access?.authorization_context
    && sameApartmentIntent(record.intent, access.authorization_context)
  const customerApartmentAccessState: ApartmentAccessView = {
    jobId, pending,
    ready: Boolean(role === 'customer' && sessionAccessToken && known?.session === session && !pending && !confirmed
      && access?.worker_checked_in && !access.exact_unit_released && readApartmentContext(access.authorization_context)),
    message: feedback?.session === session && feedback.jobId === jobId ? localizeWorkflowError(feedback.error, language) : null,
  }
  return { authorizeApartmentAccess, customerApartmentAccessState }
}
