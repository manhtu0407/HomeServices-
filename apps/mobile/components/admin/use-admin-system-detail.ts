import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth } from '@/lib/auth-provider'
import { useAdminSectionAutoRefresh } from '@/lib/admin-data-sync'

type ApiResult<T> = { success: true; data: T } | { success: false; error?: string }
type DetailState<T> = {
  data: T | null
  error: string | null
  key: string
  loading: boolean
}

const detailCache = new Map<string, unknown>()

export function useAdminSystemDetail<T>({ cacheKey, errorMessage, fetchDetail, id }: {
  cacheKey: string
  errorMessage: string
  fetchDetail: (id: string) => Promise<ApiResult<T>>
  id: string | null
}) {
  const { session } = useAuth()
  const ownerId = session?.user.id ?? 'anonymous'
  const activeKey = `${ownerId}:${id ? `${cacheKey}:${id}` : `${cacheKey}:none`}`
  const requestId = useRef(0)
  const [state, setState] = useState<DetailState<T>>(() => detailStateForKey<T>(activeKey, Boolean(id)))
  const current = state.key === activeKey ? state : detailStateForKey<T>(activeKey, Boolean(id))

  useEffect(() => {
    if (!id) return
    const currentRequest = ++requestId.current
    let active = true
    const loadInitial = async (): Promise<void> => {
      try {
        const result = await fetchDetail(id)
        if (!active || currentRequest !== requestId.current) return
        if (!result.success) {
          setState({ data: null, error: result.error || errorMessage, key: activeKey, loading: false })
          return
        }
        detailCache.set(activeKey, result.data)
        setState({ data: result.data, error: null, key: activeKey, loading: false })
      } catch {
        if (!active || currentRequest !== requestId.current) return
        setState({ data: detailStateForKey<T>(activeKey, true).data, error: errorMessage, key: activeKey, loading: false })
      }
    }
    void loadInitial()
    return () => {
      active = false
      if (currentRequest === requestId.current) requestId.current += 1
    }
  }, [activeKey, errorMessage, fetchDetail, id])

  const load = useCallback(async () => {
    if (!id) return
    const currentRequest = ++requestId.current
    setState({ data: current.data, error: current.error, key: activeKey, loading: current.data === null })
    try {
      const result = await fetchDetail(id)
      if (currentRequest !== requestId.current) return
      if (!result.success) {
        setState({ data: current.data, error: result.error || errorMessage, key: activeKey, loading: false })
        return
      }
      detailCache.set(activeKey, result.data)
      setState({ data: result.data, error: null, key: activeKey, loading: false })
    } catch {
      if (currentRequest !== requestId.current) return
      setState({ data: current.data, error: errorMessage, key: activeKey, loading: false })
    }
  }, [activeKey, current.data, errorMessage, fetchDetail, id])

  useAdminSectionAutoRefresh('system', load, Boolean(current.error))

  return { data: current.data, error: current.error, loading: current.loading, refresh: load, retry: load }
}

function detailStateForKey<T>(key: string, hasId: boolean): DetailState<T> {
  const cached = detailCache.get(key) as T | undefined
  return { data: cached ?? null, error: null, key, loading: hasId && !cached }
}
