import { useCallback, useEffect, useRef, useState } from 'react'

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
  const activeKey = id ? `${cacheKey}:${id}` : `${cacheKey}:none`
  const requestId = useRef(0)
  const [state, setState] = useState<DetailState<T>>(() => detailStateForKey<T>(activeKey, Boolean(id)))
  const current = state.key === activeKey ? state : detailStateForKey<T>(activeKey, Boolean(id))

  useEffect(() => {
    if (!id || detailCache.has(activeKey)) return
    const currentRequest = ++requestId.current
    let active = true
    void fetchDetail(id).then((result) => {
      if (!active || currentRequest !== requestId.current) return
      if (!result.success) {
        setState({ data: null, error: result.error || errorMessage, key: activeKey, loading: false })
        return
      }
      detailCache.set(activeKey, result.data)
      setState({ data: result.data, error: null, key: activeKey, loading: false })
    })
    return () => {
      active = false
      if (currentRequest === requestId.current) requestId.current += 1
    }
  }, [activeKey, errorMessage, fetchDetail, id])

  const load = useCallback(async () => {
    if (!id) return
    const currentRequest = ++requestId.current
    setState({ data: current.data, error: null, key: activeKey, loading: current.data === null })
    const result = await fetchDetail(id)
    if (currentRequest !== requestId.current) return
    if (!result.success) {
      setState({ data: current.data, error: result.error || errorMessage, key: activeKey, loading: false })
      return
    }
    detailCache.set(activeKey, result.data)
    setState({ data: result.data, error: null, key: activeKey, loading: false })
  }, [activeKey, current.data, errorMessage, fetchDetail, id])

  return { data: current.data, error: current.error, loading: current.loading, refresh: load, retry: load }
}

function detailStateForKey<T>(key: string, hasId: boolean): DetailState<T> {
  const cached = detailCache.get(key) as T | undefined
  return { data: cached ?? null, error: null, key, loading: hasId && !cached }
}
