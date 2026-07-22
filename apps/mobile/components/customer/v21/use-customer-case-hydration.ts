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
  hydrate,
  routeJobId,
}: {
  active: boolean
  hydrate: ((jobId: string) => Promise<boolean>) | null | undefined
  routeJobId: string | null
}) {
  const targetJobId = active && hydrate && routeJobId
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
    void hydrate(owner.targetJobId).then((hydrated) => {
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
    failed: visibleSnapshot.status === 'failed',
    hydrating: Boolean(owner && !visibleSnapshot.status),
  }
}
