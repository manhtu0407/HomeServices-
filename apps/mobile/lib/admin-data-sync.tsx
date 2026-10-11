import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { subscribeToAdminDataRevisions } from './realtime'
import { readAdminDataRevisions, type AdminDataRevisions, type AdminDataSection } from './admin-data-sync-source'

type SyncState = {
  revisions: AdminDataRevisions
  signals: Record<AdminDataSection, number>
}

type AdminDataSyncContextValue = {
  signals: Record<AdminDataSection, number>
}

const EMPTY_SIGNALS: Record<AdminDataSection, number> = {
  finance: 0,
  operations: 0,
  overview: 0,
  system: 0,
  team: 0,
  workers: 0,
}

const AdminDataSyncContext = createContext<AdminDataSyncContextValue>({ signals: EMPTY_SIGNALS })

export function AdminDataSyncProvider({ children, enabled, ownerId }: {
  children: React.ReactNode
  enabled: boolean
  ownerId: string | null
}) {
  const [state, setState] = useState<SyncState>({ revisions: {}, signals: EMPTY_SIGNALS })
  const stateRef = useRef(state)
  const refresh = useCallback(async () => {
    const result = await readAdminDataRevisions()
    if (!result.success) return false
    const current = stateRef.current
    const next = mergeRevisionState(current, result.revisions)
    stateRef.current = next
    setState(next)
    return true
  }, [])

  useEffect(() => {
    if (!enabled || !ownerId) return () => undefined

    let active = true
    let foreground = AppState.currentState === 'active' || AppState.currentState == null
    let subscribed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let fallbackDelay = 4_000
    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const schedule = (delay = subscribed ? 60_000 : fallbackDelay) => {
      clearTimer()
      if (!foreground || !active) return
      timer = setTimeout(async () => {
        if (!active || !foreground) return
        const succeeded = await refresh()
        if (!subscribed) fallbackDelay = succeeded ? 4_000 : Math.min(fallbackDelay * 2, 30_000)
        schedule()
      }, delay)
    }
    const channel = subscribeToAdminDataRevisions(ownerId, (revision) => {
      if (!active) return
      const current = stateRef.current
      const previous = current.revisions[revision.section]
      if (previous !== undefined && revision.revision <= previous) return
      const next = mergeRevisionState(current, { [revision.section]: revision.revision })
      if (previous === undefined) next.signals[revision.section] += 1
      stateRef.current = next
      setState(next)
    }, (status) => {
      if (!active) return
      subscribed = status === 'SUBSCRIBED'
      if (subscribed) {
        fallbackDelay = 4_000
        // Read once after the server confirms the subscription so writes between
        // the initial snapshot and the Realtime handshake cannot be missed.
        void refresh().then(() => schedule())
      }
      else {
        void refresh()
        schedule(4_000)
      }
    })
    void refresh().then(() => schedule())
    const appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      foreground = next === 'active'
      if (foreground) {
        void refresh().then(() => schedule())
      } else {
        clearTimer()
      }
    })

    return () => {
      active = false
      clearTimer()
      appStateSubscription.remove()
      if (channel) void channel.unsubscribe()
    }
  }, [enabled, ownerId, refresh])

  return <AdminDataSyncContext.Provider value={{ signals: state.signals }}>{children}</AdminDataSyncContext.Provider>
}

function mergeRevisionState(current: SyncState, incoming: AdminDataRevisions): SyncState {
  const revisions = { ...current.revisions }
  const signals = { ...current.signals }
  for (const [section, revision] of Object.entries(incoming) as [AdminDataSection, number][]) {
    const previous = revisions[section]
    if (previous === undefined || revision > previous) {
      revisions[section] = revision
      if (previous !== undefined) signals[section] += 1
    }
  }
  return { revisions, signals }
}

export function useAdminSectionRevision(section: AdminDataSection) {
  return useContext(AdminDataSyncContext).signals[section]
}

export function useAdminSectionAutoRefresh(section: AdminDataSection, refresh: () => void | Promise<void>, retryWhen = false, retry = refresh) {
  const context = useContext(AdminDataSyncContext)
  useAdminAutoRefresh([section], context.signals[section], refresh, retryWhen, retry)
}

export function useAdminSectionsAutoRefresh(sections: readonly AdminDataSection[], refresh: () => void | Promise<void>, retryWhen = false, retry = refresh) {
  const context = useContext(AdminDataSyncContext)
  const scope = sections.join('|')
  const signal = sections.map((section) => context.signals[section]).join('|')
  useAdminAutoRefresh(sections, signal, refresh, retryWhen, retry, scope)
}

function useAdminAutoRefresh(
  sections: readonly AdminDataSection[],
  signal: string | number,
  refresh: () => void | Promise<void>,
  retryWhen: boolean,
  retry: () => void | Promise<void> = refresh,
  scope = sections.join('|'),
) {
  const refreshRef = useRef(refresh)
  const retryRef = useRef(retry)
  const retryWhenRef = useRef(retryWhen)
  const seenSignal = useRef({ scope, signal })
  refreshRef.current = refresh
  retryRef.current = retry
  retryWhenRef.current = retryWhen

  useEffect(() => {
    if (seenSignal.current.scope !== scope) {
      seenSignal.current = { scope, signal }
      return
    }
    if (seenSignal.current.signal === signal) return
    seenSignal.current = { scope, signal }
    const timer = setTimeout(() => {
      void Promise.resolve().then(() => refreshRef.current()).catch(() => undefined)
    }, 150)
    return () => clearTimeout(timer)
  }, [scope, signal])

  useEffect(() => {
    if (!retryWhen) return () => undefined
    let active = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (!active || !retryWhenRef.current) return
      const delay = Math.min(1_000 * (2 ** attempt), 30_000)
      attempt += 1
      timer = setTimeout(async () => {
        if (!active) return
        try {
          await retryRef.current()
        } catch {
          // The owning surface keeps the user-facing error state and retries in the background.
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      active = false
      if (timer !== null) clearTimeout(timer)
    }
  }, [retryWhen, scope])
}

