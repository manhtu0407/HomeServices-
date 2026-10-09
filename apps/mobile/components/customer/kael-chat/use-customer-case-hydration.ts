import { useEffect, useState } from 'react'

type CustomerCaseHydrationSnapshot = {
  owner: CustomerCaseHydrationOwner | null
  status: 'failed' | 'resolved' | null
}

type CustomerCaseHydrationOwner = {
  targetJobId: string
  token: string | undefined
}

export function useCustomerCaseHydration({
  active,
  authLoading = false,
  hydrate,
  routeJobId,
  sessionAccessToken,
}: {
  active: boolean
  authLoading?: boolean
  hydrate: ((jobId: string, accessToken?: string) => Promise<boolean>) | null | undefined
  routeJobId: string | null
  sessionAccessToken: string | undefined
}) {
  const hasSessionAccessToken = Boolean(sessionAccessToken?.trim())
  const needsRouteHydration = Boolean(active && hydrate && routeJobId)
  const authRequired = needsRouteHydration && !authLoading && !hasSessionAccessToken
  const targetJobId = needsRouteHydration && hasSessionAccessToken
    ? routeJobId
    : null
  const [snapshot, setSnapshot] = useState<CustomerCaseHydrationSnapshot>(() => ({
    owner: targetJobId ? { targetJobId, token: sessionAccessToken } : null,
    status: null,
  }))
  let visibleSnapshot = snapshot
  if ((snapshot.owner?.targetJobId ?? null) !== targetJobId || (snapshot.owner && snapshot.owner.token !== sessionAccessToken)) {
    visibleSnapshot = {
      owner: targetJobId ? { targetJobId, token: sessionAccessToken } : null,
      status: null,
    }
    setSnapshot(visibleSnapshot)
  }
  const owner = visibleSnapshot.owner

  useEffect(() => {
    if (!hydrate || !owner) return undefined

    let cancelled = false
    // Let the provider activate its session before a newly mounted Case reads it.
    const request = Promise.resolve().then(() => cancelled
      ? false
      : hydrate(owner.targetJobId, sessionAccessToken))
    void request.then((hydrated) => {
      if (cancelled) return
      setSnapshot({
        owner,
        status: hydrated ? 'resolved' : 'failed',
      })
    }).catch(() => {
      if (cancelled) return
      setSnapshot({ owner, status: 'failed' })
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, hydrate, owner, sessionAccessToken])

  return {
    authRequired,
    failed: visibleSnapshot.status === 'failed',
    hydrating: Boolean(owner && !visibleSnapshot.status),
    retry: () => {
      if (!owner || visibleSnapshot.status !== 'failed') return
      setSnapshot({ owner: { ...owner }, status: null })
    },
  }
}
