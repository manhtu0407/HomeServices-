import { useCallback, useEffect, useRef, useState } from 'react'

type ApiResult<T> = { success: true; data: T } | { success: false; error?: string }
type ListEnvelope<TRecord, TSummary> = {
  generated_at: string
  data_quality: 'available' | 'partial' | 'unavailable'
  summary: TSummary
  records: TRecord[]
  has_more: boolean
  next_cursor: string | null
}
type ResourceState<TRecord, TSummary, TEnvelope> = {
  dataQuality: ListEnvelope<TRecord, TSummary>['data_quality']
  error: string | null
  generatedAt: string | null
  key: string
  loading: boolean
  loadingMore: boolean
  records: TRecord[]
  refreshing: boolean
  response: TEnvelope | null
  summary: TSummary | null
}

const sessionCache = new Map<string, unknown>()

export function useAdminSystemResource<TRecord, TSummary, TEnvelope extends ListEnvelope<TRecord, TSummary> = ListEnvelope<TRecord, TSummary>>({
  cacheKey,
  errorMessage,
  fetchPage,
  query,
}: {
  cacheKey: string
  errorMessage: string
  fetchPage: (input: { cursor?: string; query: string }) => Promise<ApiResult<TEnvelope>>
  query: string
}) {
  const debouncedQuery = useDebouncedValue(query, 300)
  const activeKey = `${cacheKey}:${debouncedQuery}`
  const requestId = useRef(0)
  const [state, setState] = useState<ResourceState<TRecord, TSummary, TEnvelope>>(() => resourceStateForKey<TRecord, TSummary, TEnvelope>(activeKey))
  const current = state.key === activeKey ? state : resourceStateForKey<TRecord, TSummary, TEnvelope>(activeKey)

  useEffect(() => {
    if (sessionCache.has(activeKey)) return
    const currentRequest = ++requestId.current
    let active = true
    void fetchPage({ query: debouncedQuery }).then((result) => {
      if (!active || currentRequest !== requestId.current) return
      if (!result.success) {
        setState({ ...resourceStateForKey<TRecord, TSummary, TEnvelope>(activeKey), error: result.error || errorMessage, loading: false })
        return
      }
      sessionCache.set(activeKey, result.data)
      setState(resourceStateFromEnvelope(activeKey, result.data))
    })
    return () => {
      active = false
      if (currentRequest === requestId.current) requestId.current += 1
    }
  }, [activeKey, debouncedQuery, errorMessage, fetchPage])

  const load = useCallback(async ({ append = false, refresh = false }: { append?: boolean; refresh?: boolean } = {}) => {
    const currentRequest = ++requestId.current
    setState({
      ...current,
      error: null,
      key: activeKey,
      loading: !append && !refresh && current.records.length === 0,
      loadingMore: append,
      refreshing: refresh,
    })
    const cursor = append ? current.response?.next_cursor ?? undefined : undefined
    const result = await fetchPage({ cursor, query: debouncedQuery })
    if (currentRequest !== requestId.current) return
    if (!result.success) {
      setState({ ...current, error: result.error || errorMessage, key: activeKey, loading: false, loadingMore: false, refreshing: false })
      return
    }
    const response = append
      ? { ...result.data, records: [...current.records, ...result.data.records] } as TEnvelope
      : result.data
    sessionCache.set(activeKey, response)
    setState(resourceStateFromEnvelope(activeKey, response))
  }, [activeKey, current, debouncedQuery, errorMessage, fetchPage])

  return {
    dataQuality: current.dataQuality,
    error: current.error,
    generatedAt: current.generatedAt,
    hasMore: current.response?.has_more === true && current.response.next_cursor !== null,
    loadMore: () => load({ append: true }),
    loading: current.loading,
    loadingMore: current.loadingMore,
    records: current.records,
    refresh: () => load({ refresh: true }),
    refreshing: current.refreshing,
    response: current.response,
    retry: () => load(),
    summary: current.summary,
  }
}

function resourceStateForKey<TRecord, TSummary, TEnvelope extends ListEnvelope<TRecord, TSummary>>(key: string): ResourceState<TRecord, TSummary, TEnvelope> {
  const cached = sessionCache.get(key) as TEnvelope | undefined
  return cached ? resourceStateFromEnvelope(key, cached) : {
    dataQuality: 'unavailable',
    error: null,
    generatedAt: null,
    key,
    loading: true,
    loadingMore: false,
    records: [],
    refreshing: false,
    response: null,
    summary: null,
  }
}

function resourceStateFromEnvelope<TRecord, TSummary, TEnvelope extends ListEnvelope<TRecord, TSummary>>(key: string, response: TEnvelope): ResourceState<TRecord, TSummary, TEnvelope> {
  return {
    dataQuality: response.data_quality,
    error: null,
    generatedAt: response.generated_at,
    key,
    loading: false,
    loadingMore: false,
    records: response.records,
    refreshing: false,
    response,
    summary: response.summary,
  }
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeout)
  }, [delayMs, value])
  return debounced
}
