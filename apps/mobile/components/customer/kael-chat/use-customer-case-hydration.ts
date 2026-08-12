import { useEffect, useRef, useState } from 'react'

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

  // Supabase hands out a new access token on every refresh. The token is a credential for the
  // request, not a reason to re-fetch the job, so it is read at call time instead of being a
  // dependency — otherwise every silent refresh replays a hydration that already resolved.
  // Declared before the hydration effect so a commit that changes both the token and the owner
  // refreshes the credential first.
  const sessionAccessTokenRef = useRef(sessionAccessToken)
  useEffect(() => {
    sessionAccessTokenRef.current = sessionAccessToken
  }, [sessionAccessToken])

  useEffect(() => {
    if (!hydrate || !owner) return undefined

    let cancelled = false
    const accessToken = sessionAccessTokenRef.current
    const request = accessToken
      ? hydrate(owner.targetJobId, accessToken)
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
  }, [hydrate, owner])

  return {
    authRequired,
    failed: visibleSnapshot.status === 'failed',
    hydrating: Boolean(owner && !visibleSnapshot.status),
  }
}
