import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { resetConnectivityForTests } from '../connectivity'
import {
  fetchResource,
  invalidateResource,
  readResource,
  resetResourceCacheForTests,
  writeResource,
  type FetchOutcome,
} from '../resource-cache/resource-cache'
import {
  RESOURCE_CACHE_STORAGE_KEY,
  flushResourcePersistenceForTests,
  forgetResourceOwner,
  hydrateResourceOwner,
  resetResourcePersistenceForTests,
} from '../resource-cache/resource-cache-persistence'
import { useCachedResource } from '../resource-cache/use-cached-resource'

export const PILLAR = {
  id: 'P325-resource-cache-owner-isolation',
  invariant: 'a cached resource is readable only by the account that fetched it, only display-grade families reach the disk, and sign-out leaves no cached data in memory or on disk',
  authority: [
    'governance/RULES.md Security Invariants (PII Handling)',
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'docs/architecture/code-ownership-map.md (Shared Mobile State: API transport)',
  ],
  target: 'apps/mobile/lib/resource-cache/resource-cache.ts',
  layer: 'security-negative',
  siblings: ['P326-transport-connectivity', 'P221-admin-activation-audit-isolation'],
  mutation: 'drop ownerId from entryKey, or mark customer.refund-account persist: true — the cross-owner read or the disk-leak case turns red',
} as const satisfies PillarManifest

const OWNER_A = 'owner-a'
const OWNER_B = 'owner-b'

function ok<T>(data: T): FetchOutcome<T> {
  return { success: true, data }
}

async function storedEnvelope() {
  const raw = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

beforeEach(async () => {
  resetResourceCacheForTests()
  resetResourcePersistenceForTests()
  resetConnectivityForTests()
  await AsyncStorage.clear()
})

describe('resource cache owner isolation', () => {
  it('never returns one owner\'s entry to another owner', async () => {
    await fetchResource(OWNER_A, 'customer.service-history', async () => ok(['job-a']))

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'customer.service-history')?.data).toEqual(['job-a'])
      expect(readResource(OWNER_B, 'customer.service-history')).toBeNull()
    }, 'owner B read the same key after owner A fetched it')
  })

  it('shares one in-flight request per owner and key, but not across owners', async () => {
    let resolve: (value: FetchOutcome<string>) => void = () => undefined
    const fetcher = jest.fn(() => new Promise<FetchOutcome<string>>((done) => { resolve = done }))
    const first = fetchResource(OWNER_A, 'customer.service-history', fetcher)
    const second = fetchResource(OWNER_A, 'customer.service-history', fetcher)
    const otherOwner = fetchResource(OWNER_B, 'customer.service-history', async () => ok('b'))
    resolve(ok('a'))
    await Promise.all([first, second, otherOwner])

    withPillarContext(PILLAR, () => {
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(readResource(OWNER_B, 'customer.service-history')?.data).toBe('b')
    }, 'duplicate concurrent reads must collapse to one request per owner')
  })

  it('discards a response that lands after its owner was signed out', async () => {
    let resolve: (value: FetchOutcome<string>) => void = () => undefined
    const pending = fetchResource(OWNER_A, 'customer.membership', () => new Promise<FetchOutcome<string>>((done) => { resolve = done }))
    await forgetResourceOwner(OWNER_A)
    resolve(ok('late'))
    await pending

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'customer.membership')).toBeNull()
    }, 'a late response re-populated a wiped owner')
  })

  it('hides values older than maxAge and keeps invalidated values visible but stale', () => {
    const now = Date.now()
    writeResource(OWNER_A, 'worker.earnings', { total: 1 }, now - 2 * 24 * 60 * 60_000)
    writeResource(OWNER_A, 'customer.service-history', ['job'], now)
    invalidateResource(OWNER_A, 'customer.service-history')

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'worker.earnings', now)).toBeNull()
      expect(readResource(OWNER_A, 'customer.service-history', now)).toMatchObject({ data: ['job'], invalidated: true })
    }, 'expired money data must never render; invalidated data must stay visible as stale')
  })
})

describe('resource cache persistence', () => {
  it('persists display-grade families only and never unknown or credential families', async () => {
    await hydrateResourceOwner(OWNER_A)
    writeResource(OWNER_A, 'customer.service-history', ['job-a'])
    writeResource(OWNER_A, 'customer.refund-account', { account: 'secret' })
    writeResource(OWNER_A, 'worker.payout-method', { account: 'secret' })
    writeResource(OWNER_A, 'kael.chat:session-1', { text: 'private' })
    await flushResourcePersistenceForTests()
    const envelope = await storedEnvelope()

    withPillarContext(PILLAR, () => {
      expect(envelope.ownerId).toBe(OWNER_A)
      expect(Object.keys(envelope.entries)).toEqual(['customer.service-history'])
    }, 'only persist: true families may be written to AsyncStorage')
  })

  it('restores the same owner after relaunch and drops another owner\'s envelope', async () => {
    await hydrateResourceOwner(OWNER_A)
    writeResource(OWNER_A, 'customer.service-history', ['job-a'])
    await flushResourcePersistenceForTests()

    resetResourceCacheForTests()
    resetResourcePersistenceForTests()
    await hydrateResourceOwner(OWNER_A)
    const restored = readResource(OWNER_A, 'customer.service-history')?.data

    resetResourceCacheForTests()
    resetResourcePersistenceForTests()
    await hydrateResourceOwner(OWNER_B)
    const diskAfterOwnerB = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)

    withPillarContext(PILLAR, () => {
      expect(restored).toEqual(['job-a'])
      expect(readResource(OWNER_B, 'customer.service-history')).toBeNull()
      expect(diskAfterOwnerB).toBeNull()
    }, 'owner B launch must neither read nor keep owner A\'s disk copy')
  })

  it('ignores an envelope written by a different schema version', async () => {
    await AsyncStorage.setItem(RESOURCE_CACHE_STORAGE_KEY, JSON.stringify({
      v: 0,
      ownerId: OWNER_A,
      entries: { 'customer.service-history': { data: ['old'], fetchedAt: Date.now(), invalidated: false } },
    }))
    await hydrateResourceOwner(OWNER_A)

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'customer.service-history')).toBeNull()
    }, 'a cache shape from another release must not be trusted')
  })

  it('does not resurrect a wiped owner when the same account signs straight back in', async () => {
    await hydrateResourceOwner(OWNER_A)
    writeResource(OWNER_A, 'auth.role', 'customer')
    await flushResourcePersistenceForTests()
    const wipe = forgetResourceOwner(OWNER_A)
    await hydrateResourceOwner(OWNER_A)
    await wipe

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'auth.role')).toBeNull()
    }, 'a hydrate racing the sign-out removal read the wiped envelope back')
  })

  it('wipes memory and disk on sign-out', async () => {
    await hydrateResourceOwner(OWNER_A)
    writeResource(OWNER_A, 'customer.service-history', ['job-a'])
    await flushResourcePersistenceForTests()
    await forgetResourceOwner(OWNER_A)
    const diskAfterSignOut = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)

    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A, 'customer.service-history')).toBeNull()
      expect(diskAfterSignOut).toBeNull()
    }, 'sign-out left cached data behind')
  })
})

function HistoryProbe({ ownerId, fetcher }: { ownerId: string; fetcher: () => Promise<FetchOutcome<string[]>> }) {
  const resource = useCachedResource({ ownerId, key: 'customer.service-history', fetcher })
  return (
    <>
      <Text testID="status">{resource.status}</Text>
      <Text testID="data">{resource.data?.join(',') ?? ''}</Text>
    </>
  )
}

describe('useCachedResource', () => {
  it('renders a fresh cached value immediately without asking the server again', async () => {
    writeResource(OWNER_A, 'customer.service-history', ['cached'])
    const fetcher = jest.fn(async () => ok(['fresh']))
    render(<HistoryProbe fetcher={fetcher} ownerId={OWNER_A} />)
    await act(async () => { await hydrateResourceOwner(OWNER_A) })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('data').props.children).toBe('cached')
      expect(screen.getByTestId('status').props.children).toBe('ready')
      expect(fetcher).not.toHaveBeenCalled()
    }, 'a tab re-entry within staleMs must not refetch')
  })

  it('keeps the last value as stale when revalidation fails, and reports error with no value', async () => {
    writeResource(OWNER_A, 'customer.service-history', ['cached'], Date.now() - 10 * 60_000)
    const failing = jest.fn(async (): Promise<FetchOutcome<string[]>> => ({ success: false, code: 'NETWORK_ERROR' }))
    const { unmount } = render(<HistoryProbe fetcher={failing} ownerId={OWNER_A} />)
    await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('stale'))
    expect(screen.getByTestId('data').props.children).toBe('cached')
    unmount()

    render(<HistoryProbe fetcher={failing} ownerId={OWNER_B} />)
    await waitFor(() => expect(screen.getByTestId('status').props.children).toBe('error'))

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('data').props.children).toBe('')
    }, 'a failed first load must be an honest error, never an empty success')
  })
})
