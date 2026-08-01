import { useCallback, useEffect, useState } from 'react'

import type { CustomerServiceHistoryItem } from '@/lib/api-types'
import { jobService } from '@/lib/services'

export type SavedWorkerSummary = Readonly<{
  avatarUrl: string | null
  displayName: string | null
  id: string
}>

export type SavedWorkersStatus = 'error' | 'loading' | 'ready'

type SavedWorkersSnapshot = Readonly<{
  jobId: string | null
  reloadVersion: number
  status: SavedWorkersStatus
  workers: readonly SavedWorkerSummary[]
}>

const emptySavedWorkersSnapshot: SavedWorkersSnapshot = {
  jobId: null,
  reloadVersion: 0,
  status: 'ready',
  workers: [],
}

export function savedWorkerSummariesFromHistory(
  history: readonly CustomerServiceHistoryItem[],
): SavedWorkerSummary[] {
  const seenWorkerIds = new Set<string>()
  const savedWorkers: SavedWorkerSummary[] = []
  const newestFirst = [...history].sort((left, right) => right.ended_at.localeCompare(left.ended_at))

  for (const item of newestFirst) {
    const worker = item.worker
    if (!worker || seenWorkerIds.has(worker.id)) continue
    seenWorkerIds.add(worker.id)
    if (!worker.is_favorite) continue
    savedWorkers.push({
      avatarUrl: worker.avatar_url,
      displayName: worker.display_name?.trim() || null,
      id: worker.id,
    })
  }

  return savedWorkers
}

export function useCustomerSavedWorkers(candidateJobId: string | null) {
  const [reloadVersion, setReloadVersion] = useState(0)
  const [snapshot, setSnapshot] = useState<SavedWorkersSnapshot>({
    jobId: candidateJobId,
    reloadVersion: 0,
    status: candidateJobId ? 'loading' : 'ready',
    workers: [],
  })
  const reload = useCallback(() => setReloadVersion((version) => version + 1), [])

  useEffect(() => {
    if (!candidateJobId) {
      return
    }

    let active = true
    void jobService.listMyServiceHistory().then((result) => {
      if (!active) return
      if (!result.success) {
        setSnapshot({ jobId: candidateJobId, reloadVersion, status: 'error', workers: [] })
        return
      }
      setSnapshot({
        jobId: candidateJobId,
        reloadVersion,
        status: 'ready',
        workers: savedWorkerSummariesFromHistory(result.data.service_history),
      })
    }).catch(() => {
      if (active) setSnapshot({ jobId: candidateJobId, reloadVersion, status: 'error', workers: [] })
    })

    return () => {
      active = false
    }
  }, [candidateJobId, reloadVersion])

  const snapshotMatchesRequest = snapshot.jobId === candidateJobId && snapshot.reloadVersion === reloadVersion
  const visibleSnapshot = candidateJobId
    ? snapshotMatchesRequest
      ? snapshot
      : { ...snapshot, jobId: candidateJobId, reloadVersion, status: 'loading' as const }
    : emptySavedWorkersSnapshot

  return {
    status: visibleSnapshot.status,
    workers: visibleSnapshot.workers,
    reload,
  }
}
