import { useLayoutEffect, useRef, useState } from 'react'
import type { LocalDeal } from '@nestscout/shared'
import type { JobIncidentResponse } from '@/lib/api-types'
import type { WorkerV5PrivateKaelMediaPreview } from '../chat/use-worker-kael-orb-chat'

export type WorkerV5ScopeChangeDraftState = {
  description: string
  evidenceOpenLocal: boolean
  evidenceSent: boolean
  incident: JobIncidentResponse['incident']
  mediaNotice: string | null
  ownerKey: string
  photos: WorkerV5PrivateKaelMediaPreview[]
  proposing: boolean
  reason: string
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
  scope: LocalDeal['scopeChange'],
): WorkerV5ScopeChangeDraftState {
  return {
    description: scope?.requestedDescription ?? '',
    evidenceOpenLocal: false,
    evidenceSent: false,
    incident: null,
    mediaNotice: null,
    ownerKey,
    photos: [],
    proposing: false,
    reason: scope?.reason ?? '',
    sourceScopeId: scope?.id ?? null,
    submitting: false,
    uploadedEvidenceRefs: [],
  }
}

function resolveWorkerV5ScopeChangeDraftState(
  state: WorkerV5ScopeChangeDraftState,
  ownerKey: string,
  scope: LocalDeal['scopeChange'],
) {
  if (state.ownerKey !== ownerKey) {
    return createWorkerV5ScopeChangeDraftState(ownerKey, scope)
  }
  const sourceScopeId = scope?.id ?? null
  if (!scope || sourceScopeId === state.sourceScopeId) return state
  return {
    ...state,
    description: state.description.trim() ? state.description : scope.requestedDescription ?? '',
    reason: state.reason.trim() ? state.reason : scope.reason ?? '',
    sourceScopeId,
  }
}

export function useWorkerV5ScopeChangeDraft(deal: LocalDeal | null) {
  const scope = deal?.scopeChange ?? null
  const ownerKey = deal?.broadcast?.jobId ?? deal?.id ?? 'no-active-job'
  const [stored, setStored] = useState<WorkerV5StoredScopeChangeDraftState>(() => {
    const owner = { ownerKey }
    return { owner, state: createWorkerV5ScopeChangeDraftState(ownerKey, scope) }
  })
  let visibleStored = stored
  if (stored.owner.ownerKey !== ownerKey) {
    visibleStored = {
      owner: { ownerKey },
      state: createWorkerV5ScopeChangeDraftState(ownerKey, scope),
    }
    setStored(visibleStored)
  }
  const owner = visibleStored.owner
  const activeOwnerRef = useRef(owner)

  useLayoutEffect(() => {
    activeOwnerRef.current = owner
  }, [owner])

  const state = resolveWorkerV5ScopeChangeDraftState(visibleStored.state, ownerKey, scope)

  const updateOwnerState = (
    targetOwnerKey: string,
    update: (current: WorkerV5ScopeChangeDraftState) => WorkerV5ScopeChangeDraftState,
  ) => {
    setStored((current) => {
      if (targetOwnerKey !== owner.ownerKey || activeOwnerRef.current !== owner) return current
      const ownedState = current.owner === owner
        ? resolveWorkerV5ScopeChangeDraftState(current.state, targetOwnerKey, scope)
        : createWorkerV5ScopeChangeDraftState(targetOwnerKey, scope)
      return { owner, state: update(ownedState) }
    })
  }

  return { ownerKey, state, updateOwnerState }
}
