import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

import { onReconnect, useConnectivity } from '../connectivity'
import {
  fetchResource,
  isResourceStale,
  peekResource,
  readResource,
  subscribeResources,
  type CacheEntry,
  type FetchOutcome,
} from './resource-cache'
import { hydrateResourceOwner } from './resource-cache-persistence'
import type { ResourceKey } from './resource-policies'

export type CachedResourceStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error'

export type CachedResource<T> = {
  data: T | null
  fetchedAt: number | null
  status: CachedResourceStatus
  refresh: () => Promise<boolean>
}

type CachedResourceInput<T> = {
  ownerId: string | null
  key: ResourceKey | null
  fetcher: () => Promise<FetchOutcome<T>>
  enabled?: boolean
}

// Stale-while-revalidate: a cached value renders immediately, the server is asked only when the
// value is stale, and a failed revalidation keeps the last value visible as `stale`, never as fresh.
export function useCachedResource<T>({ ownerId, key, fetcher, enabled = true }: CachedResourceInput<T>): CachedResource<T> {
  const active = Boolean(enabled && ownerId && key)
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  const snapshot = useCallback(
    () => (active ? peekResource<T>(ownerId!, key!) : null),
    [active, key, ownerId],
  )
  const peeked = useSyncExternalStore(subscribeResources, snapshot, snapshot)
  const connectivity = useConnectivity()
  const [request, setRequest] = useState<{ id: string | null; pending: boolean; failed: boolean }>({ id: null, pending: false, failed: false })
  const requestId = active ? `${ownerId}:${key}` : null
  const visibleRequest = request.id === requestId ? request : { id: requestId, pending: false, failed: false }

  const revalidate = useCallback(async (force: boolean) => {
    if (!active) return false
    const owner = ownerId!
    const resourceKey = key!
    if (!force && !isResourceStale(resourceKey, readResource(owner, resourceKey))) return true
    const id = `${owner}:${resourceKey}`
    setRequest({ id, pending: true, failed: false })
    const outcome = await fetchResource(owner, resourceKey, () => fetcherRef.current())
    setRequest((current) => (current.id === id ? { id, pending: false, failed: !outcome.success } : current))
    return outcome.success
  }, [active, key, ownerId])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void hydrateResourceOwner(ownerId!).then(() => {
      if (!cancelled) void revalidate(false)
    })
    return () => {
      cancelled = true
    }
  }, [active, ownerId, revalidate])

  useEffect(() => {
    if (!active) return
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void revalidate(false)
    })
    const reconnect = onReconnect(() => {
      void revalidate(false)
    })
    return () => {
      appState.remove()
      reconnect()
    }
  }, [active, revalidate])

  const invalidated = peeked?.invalidated === true
  useEffect(() => {
    if (active && invalidated) void revalidate(false)
  }, [active, invalidated, revalidate])

  const entry: CacheEntry<T> | null = peeked && active ? readResource<T>(ownerId!, key!) : null
  const refresh = useCallback(() => revalidate(true), [revalidate])

  return {
    data: entry?.data ?? null,
    fetchedAt: entry?.fetchedAt ?? null,
    status: resourceStatus(active, entry, visibleRequest.pending, visibleRequest.failed, connectivity === 'offline'),
    refresh,
  }
}

function resourceStatus(
  active: boolean,
  entry: CacheEntry | null,
  pending: boolean,
  failed: boolean,
  offline: boolean,
): CachedResourceStatus {
  if (!active) return 'idle'
  if (!entry) {
    if (failed || (offline && !pending)) return 'error'
    return 'loading'
  }
  if (failed || offline || entry.invalidated) return 'stale'
  return 'ready'
}
