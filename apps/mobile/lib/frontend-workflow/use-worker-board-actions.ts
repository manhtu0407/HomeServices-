import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react'
import {
  toLocalDealStatus,
  type MatchingDeliveryReceipt,
  type QuoteMode,
  type LocalWorkflowAction,
  type LocalWorkflowState,
  type UserRole,
  type WorkerServiceAreaUpdateInput,
  type WorkerServicePreferencesUpdateInput,
} from '@nestscout/shared'
import type { AppLanguage } from '../app-language'
import type {
  EarningsResponse,
  WorkerBroadcast,
  WorkerJobListResponse,
  WorkerBroadcastProposalInput,
  WorkerBroadcastProposalResponse,
  WorkerBroadcastProposalAction,
  WorkerPayoutMethod,
  WorkerPayoutMethodSaveInput,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
  WorkerWithdrawalRequest,
  WorkerWithdrawalRequestCreateInput,
} from '../api-types'
import { workerService } from '../services'
import { useWorkerRegistrationActions } from './use-worker-registration-actions'
import { uploadWorkerAvatar, type WorkerAvatarDraft } from '../worker-avatar-upload'
import { localizeWorkflowError, type WorkflowErrorHandler } from './errors'
import { isWorkerBroadcastProposalAction, validateWorkerProposal } from './worker-proposal'
import {
  sameWorkerEarnings,
  sameWorkerBroadcasts,
  sameWorkerJobs,
  sameWorkerPayoutMethod,
  sameWorkerPerformanceInsights,
  sameWorkerProfile,
  sameWorkerWithdrawalRequests,
} from './comparisons'
import {
  currentWorkerYearRange,
  getRemoteJobId,
  hasStaleRemoteBroadcast,
  isAppForeground,
  isStaleBroadcastError,
  isWorkerCurrentJobStatus,
} from './helpers'

import { dealToSnapshot, workerBroadcastToSnapshot, workerJobToSnapshot } from './snapshots'

const WORKER_STARTUP_REFRESH_RETRY_DELAYS_MS = [1_000, 3_000] as const

type WorkerRemoteState = {
  broadcasts: WorkerBroadcast[]
  broadcastsError: string | null
  broadcastsHydrated: boolean
  earnings: EarningsResponse | null
  jobs: WorkerJobListResponse['jobs']
  jobsHydrated: boolean
  performanceInsights: WorkerPerformanceInsightsResponse | null
  payoutMethod: WorkerPayoutMethod | null
  profile: WorkerProfileResponse | null
  sessionUserId: string | null
  withdrawalRequests: WorkerWithdrawalRequest[]
}

export type WorkerMatchingDeliveryView = {
  confirmedRecipientCount: number | null
  receipt: MatchingDeliveryReceipt
}

export type WorkerProposalOpportunityView = {
  broadcastId: string
  proposalAction: WorkerBroadcastProposalAction
  quoteMode: QuoteMode | null
  result: WorkerBroadcastProposalResponse | null
}

const initialWorkerRemoteState: WorkerRemoteState = {
  broadcasts: [],
  broadcastsError: null,
  broadcastsHydrated: false,
  earnings: null,
  jobs: [],
  jobsHydrated: false,
  performanceInsights: null,
  payoutMethod: null,
  profile: null,
  sessionUserId: null,
  withdrawalRequests: [],
}

type WorkerBoardActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  language: AppLanguage
  refreshCurrentJob: () => Promise<boolean>
  role: UserRole | null
  sessionUserId: string | null
  sessionAccessToken?: string
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
}

export function useWorkerBoardActions({
  dispatch,
  language,
  refreshCurrentJob,
  role,
  sessionUserId,
  sessionAccessToken,
  setRemoteError,
  stateRef,
}: WorkerBoardActionsInput) {
  const workerAvailabilityPreferenceRef = useRef<{ sessionUserId: string | null; value: boolean } | null>(null)
  const workerRefreshRequestIdRef = useRef(0)
  const workerRefreshInFlightRequestIdRef = useRef<number | null>(null)
  // A trigger that lands mid-refresh may carry a change the running pass already read past.
  const workerRefreshQueuedRef = useRef(false)
  const workerRefreshRef = useRef<(() => Promise<boolean>) | null>(null)
  const workerActivityHeartbeatBusyRef = useRef(false)
  const workerProposalInFlightRef = useRef<string | null>(null)
  const [workerRemoteState, setWorkerRemoteState] = useState<WorkerRemoteState>(initialWorkerRemoteState)
  const [workerEarningsError, setWorkerEarningsError] = useState<string | null>(null)
  const [workerMatchingDelivery, setWorkerMatchingDelivery] = useState<WorkerMatchingDeliveryView | null>(null)
  const [workerProposalOpportunity, setWorkerProposalOpportunity] = useState<WorkerProposalOpportunityView | null>(null)
  const workerProfile = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.profile : null
  const workerBroadcasts = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.broadcasts : []
  const workerBroadcastsError = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.broadcastsError : null
  const workerBroadcastsHydrated = workerRemoteState.sessionUserId === sessionUserId && workerRemoteState.broadcastsHydrated
  const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null
  const workerJobs = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.jobs : []
  const workerJobsHydrated = workerRemoteState.sessionUserId === sessionUserId && workerRemoteState.jobsHydrated
  const workerPerformanceInsights = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.performanceInsights : null
  const workerPayoutMethod = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.payoutMethod : null

  const workerWithdrawalRequests = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.withdrawalRequests : []
  useEffect(() => {
    workerRefreshRequestIdRef.current += 1
    workerRefreshInFlightRequestIdRef.current = null
    workerRefreshQueuedRef.current = false
  }, [role, sessionUserId])

  const workerRefresh = useCallback(async () => {
    if (role !== 'worker' && role !== 'admin') return true
    if (workerRefreshInFlightRequestIdRef.current !== null) {
      workerRefreshQueuedRef.current = true
      return true
    }
    const workerRefreshRequestId = workerRefreshRequestIdRef.current + 1
    workerRefreshRequestIdRef.current = workerRefreshRequestId
    workerRefreshInFlightRequestIdRef.current = workerRefreshRequestId
    try {
      const isCurrentWorkerRefresh = () => workerRefreshRequestIdRef.current === workerRefreshRequestId

      const profileRequest = workerService.getProfile()
      const earningsRequest = workerService.getEarnings(currentWorkerYearRange())
      const performanceInsightsRequest = workerService.getPerformanceInsights()
      const payoutMethodRequest = role === 'worker'
        ? workerService.getPayoutMethod()
        : Promise.resolve({ success: true as const, data: { payout_method: null } })
      const withdrawalRequestsRequest = role === 'worker'
        ? workerService.listWithdrawalRequests()
        : Promise.resolve({ success: true as const, data: { requests: [] } })
      const broadcastsRequest = workerService.getBroadcasts()
      const jobsRequest = workerService.getJobs()
      const matchingHeartbeatRequest = role === 'worker'
        ? workerService.sendMatchingHeartbeat()
        : Promise.resolve({ success: true as const })

      // Reconcile assigned work and offers together. An active assigned job is
      // authoritative and must never be replaced by an offer during refresh.
      const [broadcasts, jobs] = await Promise.all([broadcastsRequest, jobsRequest])
      if (!isCurrentWorkerRefresh()) return true
      const nextBroadcast = broadcasts.success ? broadcasts.data.broadcasts[0] : undefined
      if (broadcasts.success) {
        setWorkerMatchingDelivery(nextBroadcast?.delivery_receipt
          ? {
              confirmedRecipientCount: nextBroadcast.confirmed_recipient_count ?? null,
              receipt: nextBroadcast.delivery_receipt,
            }
          : null)
        setWorkerProposalOpportunity((current) => {
          if (nextBroadcast && isWorkerBroadcastProposalAction(nextBroadcast.proposal_action)) {
            return {
              broadcastId: nextBroadcast.broadcast_id,
              proposalAction: nextBroadcast.proposal_action,
              quoteMode: nextBroadcast.quote_mode ?? null,
              result: current?.broadcastId === nextBroadcast.broadcast_id ? current.result : null,
            }
          }
          return current?.result ? current : null
        })
      }
      let workflowError = broadcasts.success ? null : broadcasts
      setWorkerRemoteState((current) => {
        const sameOwner = current.sessionUserId === sessionUserId
        const currentBroadcasts = sameOwner ? current.broadcasts : []
        const currentJobs = sameOwner ? current.jobs : []
        const nextBroadcasts = broadcasts.success ? broadcasts.data.broadcasts : currentBroadcasts
        const nextJobs = jobs.success ? jobs.data.jobs : currentJobs
        const nextBroadcastsError = broadcasts.success
          ? null
          : localizeWorkflowError(broadcasts, language)
        if (
          sameOwner
          && current.broadcastsHydrated === (broadcasts.success || current.broadcastsHydrated)
          && current.jobsHydrated === (jobs.success || current.jobsHydrated)
          && current.broadcastsError === nextBroadcastsError
          && sameWorkerBroadcasts(currentBroadcasts, nextBroadcasts)
          && sameWorkerJobs(currentJobs, nextJobs)
        ) return current
        return {
          broadcasts: nextBroadcasts,
          broadcastsError: nextBroadcastsError,
          broadcastsHydrated: broadcasts.success || (sameOwner && current.broadcastsHydrated),
          earnings: sameOwner ? current.earnings : null,
          jobs: nextJobs,
          jobsHydrated: jobs.success || (sameOwner && current.jobsHydrated),
          performanceInsights: sameOwner ? current.performanceInsights : null,
          payoutMethod: sameOwner ? current.payoutMethod : null,
          profile: sameOwner ? current.profile : null,
          sessionUserId,
          withdrawalRequests: sameOwner ? current.withdrawalRequests : [],
        }
      })
      if (jobs.success) {
        const activeJob = jobs.data.jobs.find((job) => isWorkerCurrentJobStatus(job.status))
        const currentJobId = getRemoteJobId(stateRef.current)
        const currentJob = currentJobId ? jobs.data.jobs.find((job) => job.id === currentJobId) : undefined
        if (activeJob) {
          dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(activeJob), workerGate: 'remote_backend' })
        } else if (nextBroadcast) {
          dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
        } else if (currentJob) {
          dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(currentJob), workerGate: 'remote_backend' })
        } else if (
          stateRef.current.workerGate === 'remote_backend'
          && stateRef.current.deal?.backendStatus === 'worker_candidate_pending'
        ) {
          dispatch({ type: 'reset_workflow' })
        } else if (hasStaleRemoteBroadcast(stateRef.current)) {
          dispatch({ type: 'mark_remote_broadcast_expired' })
        }
      } else {
        workflowError = jobs
      }

      // The post-I/O generation check prevents an older refresh from committing after a newer refresh starts.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const [profile, earnings, performanceInsights, payoutMethod, withdrawalRequests] = await Promise.all([
        profileRequest,
        earningsRequest,
        performanceInsightsRequest,
        payoutMethodRequest,
        withdrawalRequestsRequest,
        matchingHeartbeatRequest,
      ])
      if (!isCurrentWorkerRefresh()) return true
      if (!profile.success) return setRemoteError(profile)

      setWorkerEarningsError(earnings.success ? null : localizeWorkflowError(earnings, language))
      const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null
      const pendingAvailabilityPreference = workerAvailabilityPreferenceRef.current?.sessionUserId === sessionUserId
        ? workerAvailabilityPreferenceRef.current.value
        : null
      const refreshedProfile = pendingAvailabilityPreference === null || profile.data.is_available === pendingAvailabilityPreference
        ? profile.data
        : { ...profile.data, is_available: pendingAvailabilityPreference }
      if (pendingAvailabilityPreference !== null && profile.data.is_available === pendingAvailabilityPreference) {
        workerAvailabilityPreferenceRef.current = null
      }
      setWorkerRemoteState((current) => {
        const currentProfile = current.sessionUserId === sessionUserId ? current.profile : null
        const currentEarnings = current.sessionUserId === sessionUserId ? current.earnings : null
        const nextEarnings = earnings.success ? earnings.data : currentEarnings
        const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
        const currentPerformanceInsights = current.sessionUserId === sessionUserId ? current.performanceInsights : null
        const currentPayoutMethod = current.sessionUserId === sessionUserId ? current.payoutMethod : null
        const currentWithdrawalRequests = current.sessionUserId === sessionUserId ? current.withdrawalRequests : []
        const nextPayoutMethod = payoutMethod.success ? payoutMethod.data.payout_method : currentPayoutMethod
        const nextWithdrawalRequests = withdrawalRequests.success
          ? withdrawalRequests.data.requests
          : currentWithdrawalRequests
        const sameProfile = sameWorkerProfile(currentProfile, refreshedProfile)
        const sameEarnings = nextEarnings ? sameWorkerEarnings(currentEarnings, nextEarnings) : currentEarnings === null
        const samePerformanceInsights = nextPerformanceInsights
          ? sameWorkerPerformanceInsights(currentPerformanceInsights, nextPerformanceInsights)
          : currentPerformanceInsights === null
        const samePayoutMethod = sameWorkerPayoutMethod(currentPayoutMethod, nextPayoutMethod)
        const sameWithdrawalRequests = sameWorkerWithdrawalRequests(currentWithdrawalRequests, nextWithdrawalRequests)
        return current.sessionUserId === sessionUserId && sameProfile && sameEarnings && samePerformanceInsights && samePayoutMethod && sameWithdrawalRequests
          ? current
          : {
              broadcasts: current.sessionUserId === sessionUserId ? current.broadcasts : [],
              broadcastsError: current.sessionUserId === sessionUserId ? current.broadcastsError : null,
              broadcastsHydrated: current.sessionUserId === sessionUserId ? current.broadcastsHydrated : false,
              earnings: nextEarnings,
              jobs: currentJobs,
              jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
              performanceInsights: nextPerformanceInsights,
              payoutMethod: nextPayoutMethod,
              profile: refreshedProfile,
              sessionUserId,
              withdrawalRequests: nextWithdrawalRequests,
            }
      })
      if (!payoutMethod.success && !workflowError) workflowError = payoutMethod
      if (!withdrawalRequests.success && !workflowError) workflowError = withdrawalRequests
      if (workflowError) return setRemoteError(workflowError)
      return true
    } finally {
      if (workerRefreshInFlightRequestIdRef.current === workerRefreshRequestId) {
        workerRefreshInFlightRequestIdRef.current = null
        if (workerRefreshQueuedRef.current) {
          workerRefreshQueuedRef.current = false
          void workerRefreshRef.current?.().catch(() => undefined)
        }
      }
    }
  }, [dispatch, language, role, sessionUserId, setRemoteError, stateRef])
  workerRefreshRef.current = workerRefresh

  const workerUpdateAvailability = useCallback(async (
    isAvailable: boolean,
    options: { revalidate?: boolean } = {},
  ) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated)
    workerAvailabilityPreferenceRef.current = { sessionUserId, value: updated.data.is_available }
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: updated.data.is_available } }
      : current)
    if (options.revalidate !== false) void workerRefresh().catch(() => undefined)
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServiceArea = useCallback(async (input: WorkerServiceAreaUpdateInput) => {
    const updated = await workerService.updateServiceArea(input)
    if (!updated.success) return setRemoteError(updated)
    setWorkerRemoteState((current) => ({
      broadcasts: current.sessionUserId === sessionUserId ? current.broadcasts : [],
      broadcastsError: current.sessionUserId === sessionUserId ? current.broadcastsError : null,
      broadcastsHydrated: current.sessionUserId === sessionUserId ? current.broadcastsHydrated : false,
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      payoutMethod: current.sessionUserId === sessionUserId ? current.payoutMethod : null,
      profile: updated.data,
      sessionUserId,
      withdrawalRequests: current.sessionUserId === sessionUserId ? current.withdrawalRequests : [],
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServicePreferences = useCallback(async (
    input: WorkerServicePreferencesUpdateInput,
  ) => {
    const updated = await workerService.updateServicePreferences(input)
    if (!updated.success) return setRemoteError(updated)
    setWorkerRemoteState((current) => ({
      broadcasts: current.sessionUserId === sessionUserId ? current.broadcasts : [],
      broadcastsError: current.sessionUserId === sessionUserId ? current.broadcastsError : null,
      broadcastsHydrated: current.sessionUserId === sessionUserId ? current.broadcastsHydrated : false,
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      payoutMethod: current.sessionUserId === sessionUserId ? current.payoutMethod : null,
      profile: updated.data,
      sessionUserId,
      withdrawalRequests: current.sessionUserId === sessionUserId ? current.withdrawalRequests : [],
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUploadAvatar = useCallback(async (input: WorkerAvatarDraft) => {
    const uploaded = await uploadWorkerAvatar(input)
    if (!uploaded.success) return setRemoteError(uploaded)
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? {
          ...current,
          profile: { ...current.profile, avatar_url: uploaded.data.avatar_url },
        }
      : current)
    return true
  }, [sessionUserId, setRemoteError])

  const workerSavePayoutMethod = useCallback(async (input: WorkerPayoutMethodSaveInput) => {
    const result = await workerService.savePayoutMethod(input)
    if (!result.success) {
      setRemoteError(result)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerRequestWithdrawal = useCallback(async (input: WorkerWithdrawalRequestCreateInput) => {
    const result = await workerService.createWithdrawalRequest(input)
    if (!result.success) {
      setRemoteError(result)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerAcceptBroadcast = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để nhận')
    const quoteId = stateRef.current.deal?.broadcast?.priceQuote?.quoteId
    if (!quoteId) return setRemoteError('Báo giá chính xác chưa sẵn sàng. Vui lòng tải lại lời mời việc.')
    const accepted = await workerService.acceptBroadcast(jobId, quoteId)
    if (!accepted.success) {
      if (isStaleBroadcastError(accepted.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(accepted)
    }

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      if (accepted.data.delivery_receipt) {
        setWorkerMatchingDelivery((current) => ({
          confirmedRecipientCount: current?.confirmedRecipientCount ?? null,
          receipt: accepted.data.delivery_receipt!,
        }))
      }
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: accepted.data.status,
          status: toLocalDealStatus(accepted.data.status),
          addressLabel: existing.broadcast.generalArea || existing.draft.districtLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            fullAddressVisible: false,
            fullAddressLabel: null,
            addressAccess: null,
            safe_metadata: {
              ...existing.broadcast.safe_metadata,
              candidate_id: accepted.data.candidate_id,
              awaiting_customer_confirmation: accepted.data.awaiting_customer_confirmation,
              already_applied: accepted.data.already_applied,
            },
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [dispatch, refreshCurrentJob, setRemoteError, stateRef])

  const workerMarkBroadcastSeen = useCallback(async (broadcastId: string) => {
    const seen = await workerService.markBroadcastSeen(broadcastId)
    if (!seen.success) return false
    setWorkerMatchingDelivery((current) => current?.receipt.broadcast_id === broadcastId
      ? { ...current, receipt: seen.data.delivery_receipt }
      : current)
    return true
  }, [])

  const workerSubmitBroadcastProposal = useCallback(async (input: WorkerBroadcastProposalInput) => {
    const opportunity = workerProposalOpportunity
    if (
      !opportunity
      || opportunity.proposalAction === 'accept_priced_offer'
      || workerProposalInFlightRef.current
    ) return false
    const validated = validateWorkerProposal(opportunity.proposalAction, {
      priceMaxText: input.price_max === null || input.price_max === undefined ? '' : String(input.price_max),
      priceMinText: input.price_min === null || input.price_min === undefined ? '' : String(input.price_min),
      scopeSummary: input.scope_summary,
    })
    if (!validated.success) return setRemoteError('', validated.code)
    workerProposalInFlightRef.current = opportunity.broadcastId
    try {
      const submitted = await workerService.submitBroadcastProposal(
        opportunity.broadcastId,
        validated.input,
      )
      if (!submitted.success) return setRemoteError(submitted)
      setWorkerProposalOpportunity((current) => current?.broadcastId === submitted.data.broadcast_id
        ? { ...current, result: submitted.data }
        : current)
      return true
    } finally {
      workerProposalInFlightRef.current = null
    }
  }, [setRemoteError, workerProposalOpportunity])

  const workerSelectBroadcast = useCallback((broadcastId: string) => {
    const cachedBroadcasts = workerRemoteState.sessionUserId === sessionUserId
      ? workerRemoteState.broadcasts
      : []
    const selected = cachedBroadcasts.find((broadcast) => broadcast.broadcast_id === broadcastId)
    const now = Date.now()
    const expiresAt = selected?.expires_at ? Date.parse(selected.expires_at) : Number.NaN
    const quoteExpiresAt = selected?.original_scope_price_quote?.expires_at
      ? Date.parse(selected.original_scope_price_quote.expires_at)
      : Number.NaN
    if (!selected || selected.status !== 'sent' || !Number.isFinite(expiresAt) || expiresAt <= now) return false
    const requiresQuote = !selected.proposal_action || selected.proposal_action === 'accept_priced_offer'
    if (requiresQuote && (!Number.isFinite(quoteExpiresAt) || quoteExpiresAt <= now)) return false
    dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(selected) })
    setWorkerMatchingDelivery(selected.delivery_receipt
      ? {
          confirmedRecipientCount: selected.confirmed_recipient_count ?? null,
          receipt: selected.delivery_receipt,
        }
      : null)
    setWorkerProposalOpportunity(isWorkerBroadcastProposalAction(selected.proposal_action)
      ? {
          broadcastId: selected.broadcast_id,
          proposalAction: selected.proposal_action,
          quoteMode: selected.quote_mode ?? null,
          result: null,
        }
      : null)
    return true
  }, [dispatch, sessionUserId, workerRemoteState.broadcasts, workerRemoteState.sessionUserId])

  const workerDeclineBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để từ chối')
    const declined = await workerService.declineBroadcast(jobId)
    if (!declined.success) {
      if (isStaleBroadcastError(declined.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(declined)
    }
    dispatch({ type: 'worker_decline_broadcast' })
    await workerRefresh()
    return true
  }, [dispatch, setRemoteError, stateRef, workerRefresh])

  const {
    workerRegistrationRecovery, workerReconcileRegistration,
    workerSubmitRegistration, workerSaveRegistrationDraft,
  } = useWorkerRegistrationActions({
    ownerId: role === 'worker' ? sessionUserId : null,
    accessToken: sessionAccessToken,
    refresh: workerRefresh,
  })

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    let cancelled = false
    let startupRetry: ReturnType<typeof setTimeout> | null = null

    const refreshWorkerStartupState = async (attempt: number) => {
      if (cancelled || !isAppForeground()) return
      const refreshed = await workerRefresh().catch(() => false)
      const retryDelay = WORKER_STARTUP_REFRESH_RETRY_DELAYS_MS[attempt]
      if (cancelled || refreshed || retryDelay === undefined) return

      // A restored session can briefly be unavailable to the API client.
      // Reconcile again before falling back to the regular 20-second poll.
      startupRetry = setTimeout(() => {
        void refreshWorkerStartupState(attempt + 1)
      }, retryDelay)
    }

    const initialRefresh = setTimeout(() => {
      void refreshWorkerStartupState(0)
    }, 0)
    const interval = setInterval(() => {
      if (isAppForeground()) void workerRefresh()
    }, 20_000)
    return () => {
      cancelled = true
      clearTimeout(initialRefresh)
      if (startupRetry) clearTimeout(startupRetry)
      clearInterval(interval)
    }
  }, [role, sessionUserId, workerRefresh])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    let cancelled = false
    const interval = setInterval(() => {
      if (!isAppForeground() || workerActivityHeartbeatBusyRef.current) return
      workerActivityHeartbeatBusyRef.current = true
      void workerService.recordActiveMinute().then((result) => {
        if (cancelled || !result.success) return
        setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
          ? {
              ...current,
              profile: {
                ...current.profile,
                active_minutes: result.data.active_minutes,
                last_active_at: result.data.last_active_at,
              },
            }
          : current)
      }).finally(() => {
        workerActivityHeartbeatBusyRef.current = false
      })
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [role, sessionUserId])

  return {
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerBroadcasts,
    workerBroadcastsError,
    workerBroadcastsHydrated,
    workerEarnings,
    workerEarningsError,
    workerJobs,
    workerJobsHydrated,
    workerMarkBroadcastSeen,
    workerMatchingDelivery,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerProposalOpportunity,
    workerRefresh,
    workerSelectBroadcast,
    workerRequestWithdrawal,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerRegistrationRecovery,
    workerReconcileRegistration,
    workerSubmitBroadcastProposal,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerWithdrawalRequests,
  }
}
