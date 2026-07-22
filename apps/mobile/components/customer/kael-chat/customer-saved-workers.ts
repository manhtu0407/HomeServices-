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
  status: SavedWorkersStatus
  workers: readonly SavedWorkerSummary[]
}>

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
    status: candidateJobId ? 'loading' : 'ready',
    workers: [],
  })
  const reload = useCallback(() => setReloadVersion((version) => version + 1), [])

  useEffect(() => {
    if (!candidateJobId) {
      setSnapshot({ status: 'ready', workers: [] })
      return
    }

    let active = true
    setSnapshot((current) => ({ status: 'loading', workers: current.workers }))
    void jobService.listMyServiceHistory().then((result) => {
      if (!active) return
      if (!result.success) {
        setSnapshot({ status: 'error', workers: [] })
        return
      }
      setSnapshot({
        status: 'ready',
        workers: savedWorkerSummariesFromHistory(result.data.service_history),
      })
    }).catch(() => {
      if (active) setSnapshot({ status: 'error', workers: [] })
    })

    return () => {
      active = false
    }
  }, [candidateJobId, reloadVersion])

  return { ...snapshot, reload }
}
