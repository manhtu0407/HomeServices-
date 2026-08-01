import { useEffect, useState } from 'react'

type CustomerCaseHydrationSnapshot = {
  owner: CustomerCaseHydrationOwner | null
  status: 'failed' | 'resolved' | null
}

type CustomerCaseHydrationOwner = {
  targetJobId: string
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
    owner: targetJobId ? { targetJobId } : null,
    status: null,
  }))
  let visibleSnapshot = snapshot
  if ((snapshot.owner?.targetJobId ?? null) !== targetJobId) {
    visibleSnapshot = {
      owner: targetJobId ? { targetJobId } : null,
      status: null,
    }
    setSnapshot(visibleSnapshot)
  }
  const owner = visibleSnapshot.owner

  useEffect(() => {
    if (!hydrate || !owner) return undefined

    let cancelled = false
    const request = sessionAccessToken
      ? hydrate(owner.targetJobId, sessionAccessToken)
      : hydrate(owner.targetJobId)
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
  }
}
