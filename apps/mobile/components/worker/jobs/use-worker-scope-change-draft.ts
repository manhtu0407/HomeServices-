import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { LocalDeal } from '@nestscout/shared'
import type { JobIncidentResponse, ScopeChangeWorkerQuote } from '@/lib/api-types'
import type { WorkerV5PrivateKaelMediaPreview } from '../chat/use-worker-kael-orb-chat'

type WorkerV5ScopeChangeDraftState = {
  description: string
  evidenceOpenLocal: boolean
  evidenceSent: boolean
  incident: JobIncidentResponse['incident']
  mediaNotice: string | null
  ownerKey: string
  photos: WorkerV5PrivateKaelMediaPreview[]
  proposing: boolean
  quote: ScopeChangeWorkerQuote | null
  quoting: boolean
  reason: string
  sourceIncidentUpdatedAt: string | null
  sourceScopeId: string | null
  submitting: boolean
  uploadedEvidenceRefs: string[]
}

type WorkerV5ScopeChangeDraftOwner = {
  ownerKey: string
}

type WorkerV5StoredScopeChangeDraftState = {
  owner: WorkerV5ScopeChangeDraftOwner
  state: WorkerV5ScopeChangeDraftState
}

function createWorkerV5ScopeChangeDraftState(
  ownerKey: string,
  deal: LocalDeal | null,
): WorkerV5ScopeChangeDraftState {
  const review = deal?.scopeReview ?? null
  const scope = deal?.scopeChange ?? null
  return {
    description: scope?.requestedDescription ?? review?.reportedDescription ?? '',
    evidenceOpenLocal: false,
    evidenceSent: Boolean(review),
    incident: review ? {
      id: review.id,
      job_id: ownerKey,
      status: review.status,
      evidence_status: review.evidenceStatus,
      last_summary: review.lastSummary,
      last_question: review.lastQuestion,
      last_next_actor: review.lastNextActor,
      created_at: review.createdAt,
      updated_at: review.updatedAt,
    } : null,
    mediaNotice: null,
    ownerKey,
    photos: [],
    proposing: false,
    quote: null,
    quoting: false,
    reason: scope?.reason ?? review?.reportedReason ?? '',
    sourceIncidentUpdatedAt: review?.updatedAt ?? null,
    sourceScopeId: scope?.id ?? null,
    submitting: false,
    uploadedEvidenceRefs: [],
  }
}

function resolveWorkerV5ScopeChangeDraftState(
  state: WorkerV5ScopeChangeDraftState,
  ownerKey: string,
  deal: LocalDeal | null,
) {
  const review = deal?.scopeReview ?? null
  const scope = deal?.scopeChange ?? null
  if (state.ownerKey !== ownerKey) {
    return createWorkerV5ScopeChangeDraftState(ownerKey, deal)
  }
  const sourceScopeId = scope?.id ?? null
  const sourceIncidentUpdatedAt = review?.updatedAt ?? null
  if (
    sourceScopeId === state.sourceScopeId &&
    sourceIncidentUpdatedAt === state.sourceIncidentUpdatedAt
  ) return state
  return {
    ...state,
    description: state.description.trim()
      ? state.description
      : scope?.requestedDescription ?? review?.reportedDescription ?? '',
    evidenceSent: state.evidenceSent || Boolean(review),
    incident: state.incident ?? (review ? {
      id: review.id,
      job_id: ownerKey,
      status: review.status,
      evidence_status: review.evidenceStatus,
      last_summary: review.lastSummary,
      last_question: review.lastQuestion,
      last_next_actor: review.lastNextActor,
      created_at: review.createdAt,
      updated_at: review.updatedAt,
    } : null),
    reason: state.reason.trim()
      ? state.reason
      : scope?.reason ?? review?.reportedReason ?? '',
    sourceIncidentUpdatedAt,
    sourceScopeId,
  }
}

export function useWorkerV5ScopeChangeDraft(
  deal: LocalDeal | null,
  routeJobId?: string | null,
) {
  const resolvedOwnerKey = routeJobId?.trim() || deal?.broadcast?.jobId || deal?.id || null
  const initialOwnerKey = resolvedOwnerKey ?? 'no-active-job'
  const [stored, setStored] = useState<WorkerV5StoredScopeChangeDraftState>(() => {
    const owner = { ownerKey: initialOwnerKey }
    return { owner, state: createWorkerV5ScopeChangeDraftState(initialOwnerKey, deal) }
  })
  const ownerKey = resolvedOwnerKey ?? stored.owner.ownerKey
  let visibleStored = stored
  if (stored.owner.ownerKey !== ownerKey) {
    visibleStored = {
      owner: { ownerKey },
      state: createWorkerV5ScopeChangeDraftState(ownerKey, deal),
    }
    setStored(visibleStored)
  }
  const owner = visibleStored.owner
  const activeOwnerRef = useRef<WorkerV5ScopeChangeDraftOwner | null>(null)

  useLayoutEffect(() => {
    activeOwnerRef.current = owner
  }, [owner])

  const state = resolveWorkerV5ScopeChangeDraftState(visibleStored.state, ownerKey, deal)

  const updateOwnerState = useCallback((
    targetOwnerKey: string,
    update: (current: WorkerV5ScopeChangeDraftState) => WorkerV5ScopeChangeDraftState,
  ) => {
    setStored((current) => {
      if (targetOwnerKey !== owner.ownerKey || activeOwnerRef.current !== owner) return current
      const ownedState = current.owner === owner
        ? resolveWorkerV5ScopeChangeDraftState(current.state, targetOwnerKey, deal)
        : createWorkerV5ScopeChangeDraftState(targetOwnerKey, deal)
      return { owner, state: update(ownedState) }
    })
  }, [deal, owner])

  return { ownerKey, state, updateOwnerState }
}
