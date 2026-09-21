import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { installEdgeRuntimeTestHooks } from '../kael-edge-runtime/harness'
import { saveCustomerFavoriteWorker } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/favorite-worker'
import { submitCustomerKaelFeedback } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/feedback'
import {
  deleteMyKaelMemory,
  getMyKaelMemory,
  updateMyKaelMemory,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/memory'
import {
  acknowledgeMatchingPushDelivery,
  markNotificationRead,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/notification/notifications-inbox'

export const PILLAR = {
  id: 'P200-user-routes-service-owned-writes',
  invariant:
    'the me.* and notifications.* routes that save a favorite worker, mark a notification read, register, unregister or acknowledge a device push token, edit or delete Kael memory, write its audit row, or submit Kael feedback do that write through the service client and key it to the authenticated caller — the client carrying the caller token may read its own rows but holds no INSERT, UPDATE or DELETE on those tables and no EXECUTE on those functions, so on it every one of these routes answers a 42501',
  authority: [
    'supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql (authenticated cannot update notifications; Edge writes through service_role)',
    'supabase/migrations/20260714084815_device_push_token_single_owner.sql (register and unregister device token RPCs are executable by service_role only)',
    'supabase/migrations/20260823150000_matching_push_provider_receipts.sql (acknowledge_matching_push_delivery is executable by service_role only)',
    'supabase/migrations/20260602090000_customer_kael_feedback.sql (customer feedback rows are written by mobile-api)',
    'supabase/migrations/20260525091142_customer_kael_memory.sql (customer Kael memory is written by mobile-api)',
    'supabase/migrations/20260525091146_kael_audit_tables.sql (kael_memory_audit accepts service_role inserts only)',
    'governance/RULES.md #0 (Edge owns service-role access and sensitive validation)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/notification/notifications-inbox.ts',
  layer: 'security-negative',
  siblings: ['P199-customer-service-owned-routes', 'P195-customer-address-persistence'],
  mutation:
    'replace workflowDb(ctx) with db(ctx) in favorite-worker.ts (save), in notifications-inbox.ts (mark read, register, unregister, acknowledge), in feedback.ts (customer feedback), or in memory.ts (the update and delete client, or the audit call in getMyKaelMemory) — the matching case turns red because the write, RPC or audit row lands on the client production refuses. Each was observed',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const CUSTOMER = '11111111-1111-4111-8111-111111111111'
const WORKER = '33333333-3333-4333-8333-333333333333'
const NOTIFICATION = '55555555-5555-4555-8555-555555555555'
const DELIVERY = '66666666-6666-4666-8666-666666666666'
const TOKEN_ID = '99999999-9999-4999-8999-999999999999'
const STAMP = '2026-09-21T00:00:00.000Z'

type Reply = { data: unknown; error: unknown }

const refused = (name: string): Reply => ({
  data: null,
  error: { code: '42501', message: `permission denied for the ${name} client` },
})
const WRITES = new Set(['insert', 'update', 'upsert', 'delete'])
const ok: Reply = { data: null, error: null }

/** A query builder that records every call and resolves once awaited. */
function chain(reply: (methods: string[]) => Reply, onCall: (method: string, args: unknown[]) => void) {
  const methods: string[] = []
  const query: unknown = new Proxy(() => undefined, {
    apply: () => query,
    get: (_target, property) => {
      if (property === 'then') {
        return (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(reply(methods)).then(resolve, reject)
      }
      return (...args: unknown[]) => {
        methods.push(String(property))
        onCall(String(property), args)
        return query
      }
    },
  })
  return query
}

/**
 * `canWrite: false` is the caller's own client as production has it: it reads its own rows, but any
 * insert, update, upsert or delete and every rpc is refused with 42501. A double that accepted those
 * would hide the defect this pillar guards.
 */
function client(
  name: 'service' | 'user',
  log: string[],
  options: { canWrite: boolean; tables?: Record<string, Reply[]>; rpc?: Record<string, Reply> },
) {
  return {
    from: (table: string) => {
      log.push(`${name}:from:${table}`)
      return chain(
        (methods) =>
          !options.canWrite && methods.some((method) => WRITES.has(method))
            ? refused(name)
            : options.tables?.[table]?.shift() ?? ok,
        (method, args) => log.push(`${name}:${table}.${method}(${args.map((arg) => JSON.stringify(arg)).join(',')})`),
      )
    },
    rpc: (fn: string, args: unknown) => {
      log.push(`${name}:rpc:${fn}(${JSON.stringify(args)})`)
      return Promise.resolve(options.canWrite ? options.rpc?.[fn] ?? ok : refused(name))
    },
  }
}

function setup(
  service: { tables?: Record<string, Reply[]>; rpc?: Record<string, Reply> } = {},
  user: { tables?: Record<string, Reply[]> } = {},
) {
  const log: string[] = []
  const serviceClient = client('service', log, { canWrite: true, ...service })
  const userClient = client('user', log, { canWrite: false, ...user })
  const context = (role: 'customer' | 'worker' = 'customer') => ({
    role,
    user: { id: role === 'worker' ? WORKER : CUSTOMER },
    supabase: userClient,
    privilegedSupabase: serviceClient,
  }) as never
  const userWrites = () => log.filter((entry) => entry.startsWith('user:') && /\.(insert|update|upsert|delete)\(|:rpc:/.test(entry))
  const calls = (clientName: string, target: string) => log.filter((entry) => entry.startsWith(`${clientName}:${target}(`) || entry.startsWith(`${clientName}:${target}.`))
  return { context, log, userWrites, calls }
}

describe('P200 favorites — saving a worker runs on the service client', () => {
  it('looks the worker up and saves the favorite as the caller, and the caller token client touches nothing', async () => {
    const { context, log, userWrites, calls } = setup({
      tables: { worker_profiles: [{ data: { id: WORKER }, error: null }] },
    })

    await expect(saveCustomerFavoriteWorker(context(), WORKER)).resolves.toEqual({ worker_id: WORKER, is_favorite: true })

    expect(
      calls('service', 'customer_favorite_workers.upsert'),
      pillarWhy(PILLAR, 'the row is keyed to the authenticated caller, never to a body field'),
    ).toEqual([`service:customer_favorite_workers.upsert({"customer_id":"${CUSTOMER}","worker_id":"${WORKER}"})`])
    expect(
      log.filter((entry) => entry.startsWith('service:from:worker_profiles')),
      pillarWhy(PILLAR, 'a customer cannot read worker_profiles, so the lookup has to run on the service client too'),
    ).toHaveLength(1)
    expect(
      log.filter((entry) => entry.startsWith('user:')),
      pillarWhy(PILLAR, 'the caller token client is refused the write and cannot see the worker, so it must not be used at all'),
    ).toEqual([])
    expect(userWrites()).toEqual([])
  })

  it('still answers 404 for a worker who is not approved, and writes nothing', async () => {
    const { context, calls } = setup({ tables: { worker_profiles: [{ data: null, error: null }] } })

    await expect(saveCustomerFavoriteWorker(context(), WORKER)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(
      calls('service', 'customer_favorite_workers.upsert'),
      pillarWhy(PILLAR, 'moving to the service client must not skip the approved and not-suspended check'),
    ).toEqual([])
  })

  it('refuses to save the caller as their own favorite', async () => {
    const { context, calls } = setup({ tables: { worker_profiles: [{ data: { id: CUSTOMER }, error: null }] } })

    await expect(saveCustomerFavoriteWorker(context(), CUSTOMER)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(calls('service', 'customer_favorite_workers.upsert')).toEqual([])
  })
})

describe('P200 notifications — read state and device tokens run on the service client', () => {
  it('marks one notification read on the service client, scoped to the caller', async () => {
    const { context, userWrites, calls } = setup({
      tables: { notifications: [{ data: { id: NOTIFICATION, read_at: STAMP }, error: null }] },
    })

    await expect(markNotificationRead(context(), NOTIFICATION)).resolves.toMatchObject({
      notification_id: NOTIFICATION,
      status: 'read',
    })
    expect(
      calls('service', 'notifications.eq'),
      pillarWhy(PILLAR, 'the service client bypasses RLS, so the update must still be scoped to the caller'),
    ).toEqual([`service:notifications.eq("id","${NOTIFICATION}")`, `service:notifications.eq("user_id","${CUSTOMER}")`])
    expect(userWrites(), pillarWhy(PILLAR, 'authenticated holds no UPDATE on notifications')).toEqual([])
  })

  it('answers 404 when the notification is not the caller’s', async () => {
    const { context } = setup({ tables: { notifications: [{ data: null, error: null }] } })

    await expect(markNotificationRead(context(), NOTIFICATION)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('registers a device token through the service RPC with the caller id taken from ctx', async () => {
    const { context, userWrites, calls } = setup({
      rpc: {
        register_device_push_token_atomic: {
          data: [{ token_id: TOKEN_ID, enabled_out: true, updated_at_ts: STAMP }],
          error: null,
        },
      },
    })

    await expect(
      registerDevicePushToken(context('worker'), {
        platform: 'ios',
        push_token: 'ExponentPushToken[abc]',
        permission_status: 'granted',
        safe_metadata: { project_id_available: true },
      } as never),
    ).resolves.toEqual({ token_id: TOKEN_ID, enabled: true, updated_at: STAMP })
    expect(calls('service', 'rpc:register_device_push_token_atomic')).toHaveLength(1)
    expect(
      calls('service', 'rpc:register_device_push_token_atomic')[0],
      pillarWhy(PILLAR, 'the RPC takes the user id as an argument, so it must be the authenticated one'),
    ).toContain(`"p_user_id":"${WORKER}"`)
    expect(userWrites(), pillarWhy(PILLAR, 'authenticated has no EXECUTE on the device-token RPCs')).toEqual([])
  })

  it('unregisters a device token through the service RPC', async () => {
    const { context, userWrites, calls } = setup({
      rpc: {
        unregister_device_push_token_atomic: {
          data: [{ token_id: TOKEN_ID, unregistered_out: true, updated_at_ts: STAMP }],
          error: null,
        },
      },
    })

    await expect(
      unregisterDevicePushToken(context(), { push_token: 'ExponentPushToken[abc]' } as never),
    ).resolves.toMatchObject({ unregistered: true })
    expect(calls('service', 'rpc:unregister_device_push_token_atomic')[0]).toContain(`"p_user_id":"${CUSTOMER}"`)
    expect(userWrites()).toEqual([])
  })

  it('acknowledges a matching delivery as the calling worker through the service RPC', async () => {
    const { context, userWrites, calls } = setup({
      rpc: { acknowledge_matching_push_delivery: { data: [{ id: DELIVERY, delivered_at: STAMP }], error: null } },
    })

    await expect(
      acknowledgeMatchingPushDelivery(context('worker'), {
        matching_delivery_id: DELIVERY,
        device_push_token_id: TOKEN_ID,
        device_push_token_updated_at: STAMP,
      } as never),
    ).resolves.toEqual({ acknowledged: true, delivery_id: DELIVERY, delivered_at: STAMP })
    expect(
      calls('service', 'rpc:acknowledge_matching_push_delivery')[0],
      pillarWhy(PILLAR, 'the delivery is acknowledged for the authenticated worker, not for an id from the body'),
    ).toContain(`"p_worker_id":"${WORKER}"`)
    expect(userWrites()).toEqual([])
  })

  it('fails closed when the service RPC reports an error', async () => {
    const { context } = setup({
      rpc: { register_device_push_token_atomic: { data: null, error: { code: 'XX000', message: 'boom' } } },
    })

    await expect(
      registerDevicePushToken(context(), {
        platform: 'android',
        push_token: 'ExponentPushToken[abc]',
        permission_status: 'granted',
        safe_metadata: {},
      } as never),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })
})

const MEMORY_ROW = {
  customer_id: CUSTOMER,
  language: 'en',
  preference_summary: 'Prefers weekday mornings',
  service_preferences: {},
  trust_signals: {},
  memory_version: 1,
  last_observed_at: null,
}

describe('P200 Kael memory and feedback — writes and their audit row run on the service client', () => {
  it('saves a customer memory edit and its audit row on the service client, then reads it back as the caller', async () => {
    const { context, log, userWrites, calls } = setup(
      { tables: { customer_kael_memory: [ok], kael_memory_audit: [ok, ok] } },
      { tables: { customer_kael_memory: [{ data: MEMORY_ROW, error: null }] } },
    )

    await expect(
      updateMyKaelMemory(context(), { language: 'en', preference_summary: 'Prefers weekday mornings' } as never),
    ).resolves.toMatchObject({ subject_type: 'customer' })

    const upsert = calls('service', 'customer_kael_memory.upsert')
    expect(upsert, pillarWhy(PILLAR, 'authenticated holds no INSERT or UPDATE on customer_kael_memory')).toHaveLength(1)
    expect(upsert[0], pillarWhy(PILLAR, 'the row is keyed to the authenticated caller')).toContain(`"customer_id":"${CUSTOMER}"`)
    expect(
      calls('service', 'kael_memory_audit.insert'),
      pillarWhy(PILLAR, 'kael_memory_audit takes service_role inserts only, and a refused audit is swallowed, so it would silently never land'),
    ).toHaveLength(2)
    expect(log.some((entry) => entry.startsWith('user:from:customer_kael_memory')), 'the read-back stays on the caller token client').toBe(true)
    expect(userWrites()).toEqual([])
  })

  it('deletes a customer memory keyed to the caller, and a worker memory keyed to the worker', async () => {
    const customer = setup({ tables: { customer_kael_memory: [ok], kael_memory_audit: [ok] } })
    await expect(deleteMyKaelMemory(customer.context())).resolves.toEqual({ subject_type: 'customer', deleted: true })
    expect(customer.calls('service', 'customer_kael_memory.eq')).toEqual([`service:customer_kael_memory.eq("customer_id","${CUSTOMER}")`])
    expect(customer.calls('service', 'customer_kael_memory.delete')).toHaveLength(1)
    expect(customer.userWrites(), pillarWhy(PILLAR, 'authenticated holds no DELETE on customer_kael_memory')).toEqual([])

    const worker = setup({ tables: { worker_kael_memory: [ok], kael_memory_audit: [ok] } })
    await expect(deleteMyKaelMemory(worker.context('worker'))).resolves.toEqual({ subject_type: 'worker', deleted: true })
    expect(worker.calls('service', 'worker_kael_memory.eq')).toEqual([`service:worker_kael_memory.eq("worker_id","${WORKER}")`])
    expect(worker.userWrites()).toEqual([])
  })

  it('leaves the audit row of a memory read on the service client while the read itself stays on the caller token', async () => {
    const { context, log, userWrites, calls } = setup(
      { tables: { kael_memory_audit: [ok] } },
      { tables: { customer_kael_memory: [{ data: MEMORY_ROW, error: null }] } },
    )

    await getMyKaelMemory(context())

    expect(
      calls('service', 'kael_memory_audit.insert'),
      pillarWhy(PILLAR, 'a view of the memory is audited even though the read needs no service access'),
    ).toHaveLength(1)
    expect(log.some((entry) => entry.startsWith('user:from:customer_kael_memory'))).toBe(true)
    expect(userWrites()).toEqual([])
  })

  it('submits a plain customer feedback as an insert keyed to the caller', async () => {
    const { context, userWrites, calls } = setup({
      tables: { customer_kael_feedback: [{ data: { id: 'f-1', created_at: STAMP }, error: null }] },
    })

    await expect(
      submitCustomerKaelFeedback(context(), { language: 'vi', message: 'Kael trả lời rất hữu ích', source: 'profile' } as never),
    ).resolves.toEqual({ feedback_id: 'f-1', status: 'new', created_at: STAMP })
    const insert = calls('service', 'customer_kael_feedback.insert')
    expect(insert, pillarWhy(PILLAR, 'authenticated holds no INSERT on customer_kael_feedback')).toHaveLength(1)
    expect(insert[0]).toContain(`"customer_id":"${CUSTOMER}"`)
    expect(userWrites()).toEqual([])
  })

  it('submits a structured rating as an upsert on the customer and response pair', async () => {
    const { context, userWrites, calls } = setup({
      tables: { customer_kael_feedback: [{ data: { id: 'f-2', created_at: STAMP }, error: null }] },
    })

    await submitCustomerKaelFeedback(context(), {
      language: 'en',
      response_id: 'response-1',
      rating: 'useful',
      source: 'customer_chat',
    } as never)

    const upsert = calls('service', 'customer_kael_feedback.upsert')
    expect(upsert).toHaveLength(1)
    expect(upsert[0], pillarWhy(PILLAR, 'a repeated rating updates the same row instead of adding another')).toContain('"onConflict":"customer_id,response_id"')
    expect(userWrites()).toEqual([])
  })

  it('fails closed when the service write reports an error', async () => {
    const { context } = setup({
      tables: { customer_kael_feedback: [{ data: null, error: { code: 'XX000', message: 'boom' } }] },
    })

    await expect(
      submitCustomerKaelFeedback(context(), { language: 'vi', message: 'Kael trả lời rất hữu ích', source: 'profile' } as never),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })
})
