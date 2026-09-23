import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { installEdgeRuntimeTestHooks } from '../kael-edge-runtime/harness'
import { deleteAccount } from '../../../../../supabase/functions/mobile-api/_shared/domains/account/account-deletion'
import { saveCustomerRefundAccount } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/refund-account'
import {
  createCustomerAvatarUpload,
  getCustomerAvatar,
  updateCustomerAvatar,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/avatar'

export const PILLAR = {
  id: 'P199-customer-service-owned-routes',
  invariant:
    'customer routes whose operations only the service role may perform — the refund-account RPC and its real-traffic guard, avatar storage and the profiles update, and account deletion with its RPCs, auth admin call and storage removal — reach them through the service client and never through the client carrying the caller token, which production refuses',
  authority: [
    'supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql (authenticated cannot write profiles; Edge writes through service_role)',
    'supabase/migrations/20260728110000_customer_refund_account_atomic.sql (upsert_customer_refund_payment_method is executable by service_role only)',
    'supabase/migrations/20260729210000_customer_account_deletion.sql (the deletion functions re-check auth.role() and are service_role only)',
    'supabase/migrations/20260729223000_customer_profile_avatar.sql (private avatar bucket with no policy; access is issued through mobile-api)',
    'governance/RULES.md #0 (Edge owns service-role access and sensitive validation)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/refund-account.ts',
  layer: 'security-negative',
  siblings: ['P195-customer-address-persistence', 'P40-role-aware-account-deletion'],
  mutation:
    'replace workflowDb(ctx) with db(ctx) in refund-account.ts, or workflowDb(ctx) with ctx.supabase in avatar.ts or account-deletion.ts — the matching case turns red because the operation lands on the refusing client. Each was observed',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const CUSTOMER = '11111111-1111-4111-8111-111111111111'
const WORKER = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const CLIENT_REQUEST_ID = '88888888-8888-4888-8888-888888888888'
const JOB_ID = '44444444-4444-4444-8444-444444444444'

type Reply = { data: unknown; error: unknown }

const refused = (name: string): Reply => ({
  data: null,
  error: { code: '42501', message: `permission denied for the ${name} client` },
})

/** Any chain of query-builder calls, awaited to one scripted reply. */
function chain(reply: () => Reply) {
  const query: unknown = new Proxy(() => undefined, {
    apply: () => query,
    get: (_target, property) =>
      property === 'then'
        ? (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(reply()).then(resolve, reject)
        : () => query,
  })
  return query
}

function jpegBlob() {
  const bytes = new Uint8Array(1234)
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0)
  bytes.set([0xff, 0xd9], bytes.length - 2)
  return new Blob([bytes], { type: 'image/jpeg' })
}

/**
 * A client that records every call. `allow: false` is the caller's own client as production has it:
 * no DML on profiles, no execute on the service functions, no policy on the private buckets, and
 * no auth admin — a double that accepted any of that would hide the defect this pillar guards.
 */
function client(
  name: 'service' | 'user',
  log: string[],
  options: { allow: boolean; tables?: Record<string, Reply[]>; rpc?: Record<string, Reply> },
) {
  const fallback = () => (options.allow ? { data: null, error: null } : refused(name))
  return {
    from: (table: string) => {
      log.push(`${name}:from:${table}`)
      return chain(() => options.tables?.[table]?.shift() ?? fallback())
    },
    rpc: (fn: string) => {
      log.push(`${name}:rpc:${fn}`)
      return Promise.resolve(options.rpc?.[fn] ?? fallback())
    },
    auth: {
      admin: {
        deleteUser: async () => {
          log.push(`${name}:auth.admin.deleteUser`)
          return options.allow ? { error: null } : { error: { code: 'not_admin', status: 403 } }
        },
      },
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async () => {
          log.push(`${name}:storage:${bucket}:createSignedUploadUrl`)
          return options.allow
            ? { data: { signedUrl: 'https://storage.test/upload', token: 'upload-token' }, error: null }
            : refused(name)
        },
        createSignedUrl: async () => {
          log.push(`${name}:storage:${bucket}:createSignedUrl`)
          return options.allow ? { data: { signedUrl: 'https://storage.test/read' }, error: null } : refused(name)
        },
        download: async () => {
          log.push(`${name}:storage:${bucket}:download`)
          return options.allow ? { data: jpegBlob(), error: null } : refused(name)
        },
        remove: async () => {
          log.push(`${name}:storage:${bucket}:remove`)
          return options.allow ? { data: [], error: null } : refused(name)
        },
      }),
    },
  }
}

function setup(serviceOptions: Partial<Parameters<typeof client>[2]> = {}, userOptions: Partial<Parameters<typeof client>[2]> = {}) {
  const log: string[] = []
  const service = client('service', log, { allow: true, ...serviceOptions })
  const user = client('user', log, { allow: false, ...userOptions })
  const context = (role: 'customer' | 'worker' = 'customer') => ({
    role,
    user: { id: role === 'worker' ? WORKER : CUSTOMER, lastSignInAt: new Date().toISOString() },
    supabase: user,
    privilegedSupabase: service,
  }) as never
  return { context, log, onlyService: () => log.filter((entry) => !entry.startsWith('service:')) }
}

const REFUND_ROW = {
  id: 'pm-1',
  bank_key: 'techcombank',
  bank_name: 'Techcombank',
  bank_account_masked: '****6789',
  status: 'pending_verification',
  is_default: true,
  verified_at: null,
  updated_at: '2026-09-21T00:00:00.000Z',
}
const REFUND_INPUT = { account_holder_name: 'PHAN MANH TU', bank_account: '123456789', bank_key: 'techcombank' } as never

describe('P199 refund account — the RPC and its guard run on the service client', () => {
  it('saves through the service RPC and reads cohort membership on the same client', async () => {
    const { context, log, onlyService } = setup({
      rpc: { upsert_customer_refund_payment_method: { data: [REFUND_ROW], error: null } },
      tables: { synthetic_matching_cohort_members: [{ data: null, error: null }] },
    })

    const result = await saveCustomerRefundAccount(context(), REFUND_INPUT)

    expect(result.refund_account).toMatchObject({ bank_key: 'techcombank', status: 'pending_verification' })
    expect(log, pillarWhy(PILLAR, 'the RPC is executable by service_role only')).toContain(
      'service:rpc:upsert_customer_refund_payment_method',
    )
    expect(log).toContain('service:from:synthetic_matching_cohort_members')
    expect(
      onlyService(),
      pillarWhy(PILLAR, 'the caller-token client is refused for both, so it must not be used'),
    ).toEqual([])
  })

  it('blocks a synthetic actor, which only the service client can see', async () => {
    const { context, log } = setup({
      rpc: { upsert_customer_refund_payment_method: { data: [REFUND_ROW], error: null } },
      tables: { synthetic_matching_cohort_members: [{ data: { cohort_id: 'synthetic-stage1-cohort-alpha' }, error: null }] },
    })

    await expect(
      saveCustomerRefundAccount(context(), REFUND_INPUT),
      pillarWhy(PILLAR, 'membership rows have RLS with no policy, so the caller-token client would let a synthetic actor through'),
    ).rejects.toMatchObject({ code: 'SYNTHETIC_COHORT_RESTRICTED', status: 403 })
    expect(log).not.toContain('service:rpc:upsert_customer_refund_payment_method')
  })
})

describe('P199 customer avatar — storage and the profile write run on the service client', () => {
  it('issues the signed upload URL from the service storage client', async () => {
    const { context, log, onlyService } = setup()

    const upload = await createCustomerAvatarUpload(context(), { mime_type: 'image/jpeg' } as never)

    expect(upload).toMatchObject({ bucket_id: 'customer-avatars', token: 'upload-token' })
    expect(upload.object_path.startsWith(`${CUSTOMER}/`), pillarWhy(PILLAR, 'the object path is bound to the caller id')).toBe(true)
    expect(log).toContain('service:storage:customer-avatars:createSignedUploadUrl')
    expect(onlyService(), pillarWhy(PILLAR, 'the private avatar bucket has no policy for the caller-token client')).toEqual([])
  })

  it('checks, records and signs the new avatar without touching the caller-token client', async () => {
    const { context, log, onlyService } = setup({
      tables: { profiles: [{ data: { avatar_url: null }, error: null }, { data: { id: CUSTOMER }, error: null }] },
    })

    const updated = await updateCustomerAvatar(context(), {
      avatar_ref: `supabase://customer-avatars/${CUSTOMER}/photo-a.jpg`,
    } as never)

    expect(updated).toMatchObject({ customer_id: CUSTOMER, avatar_url: 'https://storage.test/read' })
    expect(log).toEqual(expect.arrayContaining([
      'service:storage:customer-avatars:download',
      'service:from:profiles',
      'service:storage:customer-avatars:createSignedUrl',
    ]))
    expect(
      onlyService(),
      pillarWhy(PILLAR, 'authenticated has no UPDATE on profiles (20260518032000), so that write must not use its client'),
    ).toEqual([])
  })

  it('reads the profile row as the caller but signs the read URL on the service client', async () => {
    const { context, log } = setup({}, {
      tables: {
        profiles: [{ data: { avatar_url: `supabase://customer-avatars/${CUSTOMER}/photo-b.jpg`, updated_at: null }, error: null }],
      },
    })

    const avatar = await getCustomerAvatar(context())

    expect(avatar).toMatchObject({ customer_id: CUSTOMER, avatar_url: 'https://storage.test/read' })
    expect(log).toContain('service:storage:customer-avatars:createSignedUrl')
    expect(
      log.filter((entry) => entry.startsWith('user:storage')),
      pillarWhy(PILLAR, 'signing a URL for a private bucket needs the service client'),
    ).toEqual([])
  })
})

describe('P199 account deletion — the RPCs, storage removal and auth admin run on the service client', () => {
  const prepared = (extra: Record<string, unknown>): Record<string, Reply> => ({
    prepare_customer_account_deletion_v2: {
      data: [{ checkpoint: 'database_scrubbed', request_id: REQUEST_ID, request_status: 'processing', ...extra }],
      error: null,
    },
    complete_customer_account_deletion: {
      data: [{ checkpoint: 'completed', request_id: REQUEST_ID, request_status: 'completed' }],
      error: null,
    },
    prepare_worker_account_deletion: {
      data: [{ checkpoint: 'database_scrubbed', request_id: REQUEST_ID, request_status: 'processing', ...extra }],
      error: null,
    },
    complete_worker_account_deletion: {
      data: [{ checkpoint: 'completed', request_id: REQUEST_ID, request_status: 'completed' }],
      error: null,
    },
  })
  const input = { acknowledge_data_loss: true, client_request_id: CLIENT_REQUEST_ID, confirmation: 'XÓA TÀI KHOẢN' } as never

  it('deletes a customer end to end on the service client', async () => {
    const { context, log, onlyService } = setup({
      rpc: prepared({
        avatar_storage_ref: `supabase://customer-avatars/${CUSTOMER}/avatar.jpg`,
        storage_refs: [`supabase://job-media/${JOB_ID}/kael_reference/intake.jpg`],
      }),
    })

    await expect(deleteAccount(context(), input)).resolves.toMatchObject({ account_deleted: true, request_id: REQUEST_ID })

    expect(log, pillarWhy(PILLAR, 'the order is prepare, private storage, auth user, complete')).toEqual([
      'service:rpc:prepare_customer_account_deletion_v2',
      'service:storage:customer-avatars:remove',
      'service:storage:job-media:remove',
      'service:auth.admin.deleteUser',
      'service:rpc:complete_customer_account_deletion',
    ])
    expect(onlyService(), pillarWhy(PILLAR, 'the deletion functions and auth admin refuse the caller-token client')).toEqual([])
  })

  it('deletes a worker end to end on the service client', async () => {
    const { context, log, onlyService } = setup({
      rpc: prepared({ storage_refs: [`supabase://worker-avatars/${WORKER}/avatar.jpg`] }),
    })

    await expect(deleteAccount(context('worker'), input)).resolves.toMatchObject({ account_deleted: true })

    expect(log).toEqual([
      'service:rpc:prepare_worker_account_deletion',
      'service:storage:worker-avatars:remove',
      'service:auth.admin.deleteUser',
      'service:rpc:complete_worker_account_deletion',
    ])
    expect(onlyService()).toEqual([])
  })

  it('still fails closed when the service client cannot remove private storage', async () => {
    const { context, log } = setup({
      rpc: prepared({ avatar_storage_ref: `supabase://customer-avatars/${CUSTOMER}/avatar.jpg`, storage_refs: [] }),
    })
    // Make the service storage refuse removal, as an outage would.
    const serviceClient = (context() as unknown as { privilegedSupabase: { storage: { from: (bucket: string) => { remove: () => Promise<Reply> } } } }).privilegedSupabase
    serviceClient.storage.from = (bucket: string) => ({
      remove: async () => {
        log.push(`service:storage:${bucket}:remove`)
        return refused('service')
      },
    })

    await expect(
      deleteAccount(context(), input),
      pillarWhy(PILLAR, 'a private object that cannot be removed must stop the deletion before auth is touched'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_PROCESSING', status: 503 })
    expect(log).not.toContain('service:auth.admin.deleteUser')
  })
})
