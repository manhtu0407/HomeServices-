import { useCallback, useMemo } from 'react'

import type { CustomerServiceHistoryItem } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { useCachedResource } from '@/lib/resource-cache/use-cached-resource'
import { jobService } from '@/lib/services'

export type SavedWorkerSummary = Readonly<{
  avatarUrl: string | null
  displayName: string | null
  id: string
}>

export type SavedWorkersStatus = 'error' | 'loading' | 'ready'

const listServiceHistory = () => jobService.listMyServiceHistory()

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
  const { session } = useAuth()
  const history = useCachedResource({
    enabled: Boolean(candidateJobId),
    fetcher: listServiceHistory,
    key: 'customer.service-history',
    ownerId: session?.user.id ?? null,
  })
  const workers = useMemo(
    () => (history.data ? savedWorkerSummariesFromHistory(history.data.service_history) : []),
    [history.data],
  )
  const { refresh } = history
  const reload = useCallback(() => {
    void refresh()
  }, [refresh])

  if (!candidateJobId) return { status: 'ready' as SavedWorkersStatus, workers: [] as readonly SavedWorkerSummary[], reload }
  const status: SavedWorkersStatus = history.data
    ? 'ready'
    : history.status === 'error' || history.status === 'idle' ? 'error' : 'loading'
  return { status, workers, reload }
}
