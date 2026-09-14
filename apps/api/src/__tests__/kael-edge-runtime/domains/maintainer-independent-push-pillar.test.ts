import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P126-maintainer-independent-push',
  invariant: 'The real maintainer handler starts matching while push is pending and awaits push recovery even when matching fails',
  authority: ['governance/RULES.md #8', 'approved Production Agentic Transaction Readiness plan'],
  target: 'supabase/functions/kael-matching-maintainer/index.ts',
  layer: 'integration',
  siblings: ['P125-official-match-push-runtime', 'P101-matching-expiry-maintainer-runtime'],
  mutation: 'await push before starting matching, or omit the finally await; the independent-start or awaited-failure assertion turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({ createClient: vi.fn(), matching: vi.fn(),
  saved: vi.fn(), replacement: vi.fn(), expiry: vi.fn(), receipts: vi.fn() }))
// Edge's tsconfig path mapping reaches the ESM entry, not the test package's bare SDK import.
vi.mock('../../../../node_modules/@supabase/supabase-js/dist/index.mjs', () => ({ createClient: hooks.createClient }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/confirmation-outbox-dispatcher',
  () => ({ dispatchConfirmationMatchingOutbox: hooks.matching }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-preference',
  () => ({ reconcileExpiredSavedWorkerMatches: hooks.saved }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/matching/replacement-outbox',
  () => ({ dispatchWorkerReplacementOutbox: hooks.replacement }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/matching/expiry-maintenance',
  () => ({ reconcileExpiredMatchingLeases: hooks.expiry }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/platform/push', async (original) => ({
  ...await original<typeof import('../../../../../../supabase/functions/mobile-api/_shared/platform/push')>(),
  reconcileMatchingPushReceipts: hooks.receipts,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function setup(environment: string | null = 'production') {
  const claim = deferred<{ data: unknown; error: { message: string } | null }>()
  const database = makeSequenceClient([])
  const originalRpc = database.rpc.bind(database)
  Object.assign(database, {
    rpc(name: string, args?: Record<string, unknown>) {
      return name === 'claim_official_match_push' ? claim.promise : originalRpc(name, args)
    },
  })
  hooks.createClient.mockReturnValue(database)
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://iwevizmsedyqozxlawwl.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-key-not-a-credential',
    KAEL_MATCHING_MAINTAINER_SECRET: 'unit-test-maintainer-secret',
    HARNESS_RELEASE_ID: 'harness-126000000000-126000000000',
    ...(environment === null ? {} : { NESTSCOUT_ENVIRONMENT: environment }),
    DENO_DEPLOYMENT_ID: 'iwevizmsedyqozxlawwl_c1260000-0000-4000-8000-000000000058_1',
  }
  let handler: ((request: Request) => Promise<Response>) | undefined
  vi.stubGlobal('Deno', { env: { get: (name: string) => values[name] },
    serve: (value: (request: Request) => Promise<Response>) => { handler = value } })
  await import('../../../../../../supabase/functions/kael-matching-maintainer/index')
  if (!handler) throw new Error('Maintainer did not register its request handler')
  const pending = handler(new Request('https://edge.test/kael-matching-maintainer', {
    method: 'POST', headers: { 'x-kael-matching-maintainer-secret': values.KAEL_MATCHING_MAINTAINER_SECRET },
  }))
  expect(hooks.createClient, 'maintainer must use the injected database, never hosted credentials').toHaveBeenCalledTimes(1)
  return { pending, claim }
}

describe('maintainer request lifetime', () => {
  installEdgeRuntimeTestHooks()
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected provider access in maintainer lifetime test') }))
    hooks.createClient.mockReset()
    hooks.matching.mockReset().mockResolvedValue({ claimed: 0, completed: 0, retryScheduled: 0, deadLettered: 0, leaseLost: 0 })
    hooks.saved.mockReset().mockResolvedValue({ reconciled: 0, failed: 0 })
    hooks.replacement.mockReset().mockResolvedValue({ claimed: 0, completed: 0, deadLettered: 0 })
    hooks.expiry.mockReset().mockResolvedValue({ reconciled: 0 })
    hooks.receipts.mockReset().mockResolvedValue({ checked: 0, providerHandoffs: 0, failed: 0, unresolved: 0, tokensDisabled: 0 })
  })

  it('starts matching before the independent push claim resolves', async () => {
    const { pending, claim } = await setup()
    try {
      await vi.waitFor(() => expect(hooks.matching, pillarWhy(PILLAR)).toHaveBeenCalledTimes(1), { timeout: 500 })
    } finally {
      claim.resolve({ data: [], error: null })
    }
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, official_match_push: { claimed: 0 } })
  })

  it('does not end a failed matching request while notification recovery is still running', async () => {
    hooks.matching.mockRejectedValue(new Error('private matching detail'))
    const { pending, claim } = await setup()
    let settled = false
    void pending.then(() => { settled = true })
    try {
      await vi.waitFor(() => expect(hooks.matching).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(settled, pillarWhy(PILLAR)).toBe(false)
    } finally {
      claim.resolve({ data: [], error: null })
    }
    const response = await pending
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'MAINTAINER_FAILED' })
  })

  it('keeps matching active but reports failed notification maintenance as a non-green request', async () => {
    const { pending, claim } = await setup()
    claim.resolve({ data: null, error: { message: 'private database detail' } })
    const response = await pending
    expect(hooks.matching).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false,
      official_match_push: { error_code: 'OFFICIAL_MATCH_PUSH_DISPATCH_FAILED' } })
  })

  it.each([null, 'staging', 'preview', 'invented'])('refuses a missing or mismatched target environment: %j', async (environment) => {
    const { pending, claim } = await setup(environment)
    claim.resolve({ data: [], error: null })
    expect((await pending).status).toBe(500)
    expect(hooks.matching).not.toHaveBeenCalled()
  })
})
