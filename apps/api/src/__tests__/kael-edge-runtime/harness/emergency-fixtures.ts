// Case builders for the emergency pillars: an ordinary Case, a Case whose booking confirmation is pending, and a
// Case waiting for required evidence. Each one enforces the real table's unique (session, turn_index).

import { expect } from 'vitest'

import { buildInitialDiagnosisScopeArtifact, getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { buildKaelIntakeConfirmation } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation'
import {
  OWNER,
  assistantReply,
  classifierReply,
  createCaseWorld,
  unitAnswered,
  type ModelReplyFn,
} from './case-world'

export type Service = 'electrical' | 'plumbing' | 'cleaning' | 'hvac' | 'upholstery' | 'handyman'

export const healthyModel: ModelReplyFn = (call) => {
  if (call.purpose === 'case_turn_intent') {
    return classifierReply({ intent: 'provide_information', confidence: 0.9, pending_slot_answer: unitAnswered('1 máy') })
  }
  if (call.purpose === 'normal_chat_response') return assistantReply()
  return { content: '{}' }
}

export const PROBLEM_CHIP: Record<Service, string> = {
  electrical: 'other_electrical',
  plumbing: 'other_plumbing',
  cleaning: 'other_cleaning',
  hvac: 'other_hvac',
  upholstery: 'other_upholstery',
  handyman: 'other_handyman',
}

export function activeWorld(
  service: Service = 'hvac',
  options: { env?: Record<string, string>; status?: string; artifact?: unknown; sessionPatch?: Record<string, unknown> } = {},
) {
  const world = createCaseWorld({
    service,
    artifact: options.artifact ?? buildInitialDiagnosisScopeArtifact({ serviceType: service, customerGoal: 'Cần hỗ trợ' }),
    model: healthyModel,
    env: options.env,
    status: options.status,
    uniqueTurnIndex: true,
  })
  Object.assign(world.session(), options.sessionPatch ?? {})
  return world
}

// A booking Case whose intake confirmation is waiting for the customer, built by the builder the server uses.
export function pendingWorld(service: Service = 'hvac') {
  const world = activeWorld(service)
  const profile = getKaelPerformanceProfile(service)
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const scheduledAt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 9 - 7, 0)).toISOString()
  const confirmation = buildKaelIntakeConfirmation({
    actorId: OWNER.id,
    serviceType: service,
    profileId: profile!.id,
    description: 'Cần thợ xem giúp thiết bị trong căn hộ vào cuối tuần',
    problemChips: [PROBLEM_CHIP[service]],
    addressLabel: 'Căn hộ thử nghiệm',
    addressDistrict: 'Quận 7',
    scheduledAt,
    scheduleWindow: { date, start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
    language: 'vi',
  } as never)
  expect(confirmation.status, 'the fixture confirmation must be pending').toBe('pending')
  world.session().safe_metadata = { ...world.session().safe_metadata, intake_confirmation: confirmation }
  return world
}

// A world with no Case yet, for a request that creates one. The Case-to-conversation link is unrelated to safety and
// uses PostgREST calls the in-memory stand-in lacks, and the stand-in applies none of the column defaults the real
// table does.
export function newCaseWorld(service: Service = 'hvac') {
  const world = activeWorld(service)
  world.db.tables.kael_chat_sessions.length = 0
  world.db.tables.kael_chat_turns.length = 0
  const inert: unknown = new Proxy(function () {}, {
    get: (_target, property) => property === 'then'
      ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: { id: 'conversation-stub' }, error: null }).then(resolve)
      : () => inert,
    apply: () => inert,
  })
  const client = world.db.client as unknown as { from: (table: string) => unknown }
  const original = client.from.bind(client)
  const sessionDefaults = {
    job_id: null, status: 'active', case_phase: 'analysis', total_turns: 0, total_cost_usd: 0,
    diagnosis_scope: null, started_at: '2026-10-20T00:00:00.000Z', created_at: '2026-10-20T00:00:00.000Z',
    estimate_ready_at: null, scheduled_at: null, safe_metadata: {},
  }
  client.from = (table: string) => {
    if (table === 'kael_customer_conversations') return inert
    const query = original(table) as { insert: (value: Record<string, unknown>) => unknown }
    if (table !== 'kael_chat_sessions') return query
    const insert = query.insert.bind(query)
    query.insert = (value) => insert({ ...sessionDefaults, ...value })
    return query
  }
  return world
}

// A Case that has asked for required evidence and is waiting for it.
export function evidenceWorld(options: { env?: Record<string, string> } = {}) {
  const base = buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Cần hỗ trợ' })
  const artifact = {
    ...base,
    next_action: { kind: 'request_evidence', evidence_kind: 'any', prompt: 'Gửi thêm ảnh hoặc ghi chú về máy lạnh', required: true },
  }
  return activeWorld('hvac', { status: 'collecting_evidence', artifact, env: options.env })
}

type Writer = {
  from: (table: string) => any
}

// Holds every customer-turn insert until the next macrotask, so requests sent together have all read the session
// before any of them writes. That is the interleaving a double tap produces; without it the requests can happen to
// run one after the other and the race never shows.
export function holdCustomerInserts(world: { db: { client: unknown } }) {
  const client = world.db.client as Writer
  const original = client.from.bind(client)
  const held = (pending: any) => {
    const proxy: any = new Proxy({}, {
      get: (_target, property) => property === 'then'
        ? (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          new Promise((release) => setTimeout(release, 0)).then(() => pending.then(resolve, reject))
        : (...args: unknown[]) => {
          pending[property as string](...args)
          return proxy
        },
    })
    return proxy
  }
  client.from = (table: string) => {
    const query = original(table)
    if (table !== 'kael_chat_turns') return query
    return {
      ...query,
      insert: (value: Record<string, unknown>) => (value.role === 'customer' ? held(query.insert(value)) : query.insert(value)),
    }
  }
}

// Makes the next writes fail the way a dropped connection does, so a request can be cut half-way through its writes.
export function armWriteFailures(
  world: { db: { client: unknown } },
  arm: { sessionUpdates?: number; replyInserts?: number; customerInserts?: number },
) {
  const client = world.db.client as Writer
  const original = client.from.bind(client)
  const counts = { sessionUpdates: 0, turnInserts: 0 }
  const failing = () => {
    const failed: any = {
      select: () => failed,
      eq: () => failed,
      single: () => failed,
      maybeSingle: () => failed,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { code: 'XX000', message: 'write failed' } }).then(resolve),
    }
    return failed
  }
  const remaining = { ...arm }
  client.from = (table: string) => {
    const query = original(table)
    if (table === 'kael_chat_sessions') {
      return {
        ...query,
        update: (value: Record<string, unknown>) => {
          counts.sessionUpdates += 1
          if ((remaining.sessionUpdates ?? 0) > 0) {
            remaining.sessionUpdates = (remaining.sessionUpdates ?? 0) - 1
            return failing()
          }
          return query.update(value)
        },
      }
    }
    if (table === 'kael_chat_turns') {
      return {
        ...query,
        insert: (value: Record<string, unknown>) => {
          counts.turnInserts += 1
          const key = value.role === 'kael' ? 'replyInserts' : 'customerInserts'
          if ((remaining[key] ?? 0) > 0) {
            remaining[key] = (remaining[key] ?? 0) - 1
            return failing()
          }
          return query.insert(value)
        },
      }
    }
    return query
  }
  return counts
}
