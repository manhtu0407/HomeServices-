import { randomUUID } from 'node:crypto'

import type { Database } from '@nestscout/shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import { diagnosisScopeWithQuestion } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import { createMobileApiHandler } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../supabase/functions/mobile-api/_shared/kael/index'
import {
  EXPLANATION_ANSWER,
  HVAC_SYMPTOM_SLOT,
  HVAC_UNIT_QUESTION,
  HVAC_UNIT_SLOT,
  assistantReply,
  classifierReply,
  purposeOf,
  scriptedProviderFetch,
  unitAnswered,
} from '../kael-edge-runtime/harness'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveOrAnnounceSkip } from './integration-target'

export const PILLAR = {
  id: 'P400-kael-recurring-incident-local-db',
  invariant:
    'the HVAC incident exchange holds against a real local Postgres, PostgREST and Auth with per-user JWTs: the unit answer is stored, the WHY is explained without moving the Case or its recorded blocker, no Job is created, and another customer or a worker can neither read nor write the Case',
  authority: [
    'governance/RULES.md #6 (HVAC identity is retained)',
    'governance/RULES.md #7 (a clarification never crosses a confirmation gate)',
    'governance/RULES.md #0 (workflow writes go through the Edge boundary; RLS keeps other actors out)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts',
  layer: 'integration',
  siblings: ['P398-kael-recurring-incident-e2e', 'P10-per-actor-rls', 'P392-kael-case-context'],
  mutation:
    'drop the customer_id owner check in assertKaelSessionOwnership or the RLS policy on kael_chat_sessions - the stranger rows turn red; stop restoring the recorded blocker after an answered turn - the blocker-preserved row turns red',
} as const satisfies PillarManifest

const resolution = await resolveOrAnnounceSkip(PILLAR.id)
// This suite creates and deletes users and writes chat rows, so it never falls back to the repo's default
// local stack (other sessions may be using it). It runs only when an isolated loopback stack is named
// explicitly: KAEL_INCIDENT_LOCAL_DB=1 plus NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<port>.
const explicitIsolatedTarget = process.env.KAEL_INCIDENT_LOCAL_DB === '1' && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
if (!explicitIsolatedTarget) {
  console.warn(`[${PILLAR.id}] SKIPPED - set KAEL_INCIDENT_LOCAL_DB=1 and NEXT_PUBLIC_SUPABASE_URL to an isolated local stack`)
}
const describeLocal = explicitIsolatedTarget && resolution.ok && resolution.target.isLocal ? describe : describe.skip

const realFetch = globalThis.fetch.bind(globalThis)
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const sessionId = randomUUID()
const password = `Synthetic-${suffix}-Pw!`
const emails = {
  owner: `s04-owner-${suffix}@example.test`,
  stranger: `s04-stranger-${suffix}@example.test`,
  worker: `s04-worker-${suffix}@example.test`,
}
const ids: Record<'owner' | 'stranger' | 'worker', string> = { owner: '', stranger: '', worker: '' }
const clients = {} as Record<'owner' | 'stranger' | 'worker', SupabaseClient<Database>>
let admin: SupabaseClient<Database>
let calls: ReturnType<typeof scriptedProviderFetch>['calls'] = []

const UNIT_ANSWER = '2 máy treo tường 1HP.'
const WHY = 'Tại sao chưa đủ dữ kiện?'

function modelFor(call: { purpose: string; userContent: string }) {
  if (call.purpose === 'case_turn_intent') {
    if (call.userContent.includes('Tại sao')) return classifierReply({ intent: 'ask_question', confidence: 0.92 })
    return classifierReply({ intent: 'provide_information', confidence: 0.9, pending_slot_answer: unitAnswered('2 máy treo tường 1HP') })
  }
  if (call.purpose === 'normal_chat_response') return assistantReply()
  return { content: '{}' }
}

// Providers are scripted at the outbound boundary; everything else (PostgREST, Auth) goes to the real local stack.
function installProviderBoundary() {
  const scripted = scriptedProviderFetch({
    anthropic: (body) => modelFor({ purpose: purposeOf(body), userContent: '' }),
    deepseek: (body) => {
      const messages = (body.messages ?? []) as Array<{ role?: string; content?: unknown }>
      const user = [...messages].reverse().find((message) => message.role === 'user')
      return modelFor({ purpose: purposeOf(body), userContent: typeof user?.content === 'string' ? user.content : '' })
    },
    perplexity: () => ({ content: '{}' }),
  })
  calls = scripted.calls
  const providerHosts = new Set(['api.anthropic.com', 'api.deepseek.com', 'api.perplexity.ai'])
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return providerHosts.has(new URL(url).hostname) ? scripted.fetch(input, init) : realFetch(input, init)
  })
}

async function send(actor: 'owner' | 'stranger' | 'worker', message: string) {
  const role = actor === 'worker' ? ('worker' as const) : ('customer' as const)
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: ids[actor] },
      role,
      supabase: clients[actor],
      privilegedSupabase: admin,
      userSupabase: clients[actor],
    }) as never,
    services: createEdgeServices({
      deepseekApiKey: 'synthetic-deepseek-key',
      anthropicApiKey: 'synthetic-anthropic-key',
      perplexityApiKey: 'synthetic-perplexity-key',
      knowledgeRetrievalEnabled: false,
    } as never),
  })
  const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, language: 'vi' }),
  }))
  return { status: response.status, body: await response.json() as Record<string, any> }
}

async function caseRow() {
  const { data, error } = await admin.from('kael_chat_sessions').select('*').eq('id', sessionId).single()
  if (error || !data) throw new Error(`Case row unreadable: ${error?.message}`)
  return data as Record<string, any>
}

async function turnRows() {
  const { data, error } = await admin.from('kael_chat_turns').select('*').eq('session_id', sessionId).order('turn_index')
  if (error) throw new Error(`turns unreadable: ${error.message}`)
  return (data ?? []) as Array<Record<string, any>>
}

async function jobsOf(customerId: string) {
  const { count, error } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', customerId)
  if (error) throw new Error(`jobs unreadable: ${error.message}`)
  return count ?? 0
}

describeLocal('P400 HVAC incident against a real local database', () => {
  beforeAll(async () => {
    if (!resolution.ok) return
    vi.stubGlobal('Deno', { env: { get: (name: string) => ({ KAEL_AUTONOMY_FULL_ENABLED: 'true', DENO_DEPLOYMENT_ID: 'synthetic-deployment' } as Record<string, string>)[name] } })
    const { url, serviceRoleKey, anonKey } = resolution.target
    const options = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: realFetch } }
    admin = createClient<Database>(url, serviceRoleKey, options)
    for (const actor of ['owner', 'stranger', 'worker'] as const) {
      const created = await admin.auth.admin.createUser({
        email: emails[actor],
        password,
        email_confirm: true,
        user_metadata: { full_name: `S04 synthetic ${actor}` },
      })
      if (created.error || !created.data.user) throw new Error(`synthetic ${actor} provisioning failed: ${created.error?.message}`)
      ids[actor] = created.data.user.id
      clients[actor] = createClient<Database>(url, anonKey, options)
      const signedIn = await clients[actor].auth.signInWithPassword({ email: emails[actor], password })
      if (signedIn.error) throw new Error(`synthetic ${actor} sign-in failed: ${signedIn.error.message}`)
    }
    const roleUpdate = await admin.from('profiles').update({ role: 'worker' }).eq('id', ids.worker)
    if (roleUpdate.error) throw new Error(`synthetic worker role failed: ${roleUpdate.error.message}`)

    const artifact = diagnosisScopeWithQuestion(
      buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Vệ sinh hai máy lạnh' }),
      [HVAC_UNIT_SLOT, HVAC_SYMPTOM_SLOT],
      HVAC_UNIT_QUESTION,
      0.4,
    )
    const inserted = await admin.from('kael_chat_sessions').insert({
      id: sessionId,
      customer_id: ids.owner,
      service_type: 'hvac',
      status: 'active',
      case_phase: 'analysis',
      total_turns: 2,
      diagnosis_scope: artifact as never,
      safe_metadata: { language: 'vi', address_district: 'Quận 7', address_label: 'Căn hộ thử nghiệm', slot_ask_counts: { [HVAC_UNIT_SLOT]: 1 } },
    })
    if (inserted.error) throw new Error(`synthetic Case insert failed: ${inserted.error.message}`)
    const turns = await admin.from('kael_chat_turns').insert([
      { id: randomUUID(), session_id: sessionId, turn_index: 1, role: 'customer', content_type: 'text', text_content: 'Mình cần vệ sinh máy lạnh trong nhà.', media_refs: [], safe_metadata: {} },
      { id: randomUUID(), session_id: sessionId, turn_index: 2, role: 'kael', content_type: 'clarification', text_content: HVAC_UNIT_QUESTION, media_refs: [], safe_metadata: {} },
    ])
    if (turns.error) throw new Error(`synthetic turns insert failed: ${turns.error.message}`)
    installProviderBoundary()
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    if (!admin) return
    await admin.from('kael_chat_turns').delete().eq('session_id', sessionId)
    await admin.from('kael_chat_sessions').delete().eq('id', sessionId)
    for (const actor of ['owner', 'stranger', 'worker'] as const) {
      if (ids[actor]) await admin.auth.admin.deleteUser(ids[actor])
    }
  })

  it('T1-1 stores the unit answer and keeps HVAC through the real database', async () => {
    const result = await send('owner', UNIT_ANSWER)
    const row = await caseRow()
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(row.service_type, why).toBe('hvac')
    expect(row.diagnosis_scope.service_type, why).toBe('hvac')
    expect(row.diagnosis_scope.facts[HVAC_UNIT_SLOT], why).toContain('2 máy treo tường 1HP')
    expect(row.diagnosis_scope.missing_facts, why).not.toContain(HVAC_UNIT_SLOT)
    expect(row.job_id, why).toBeNull()
    expect(await jobsOf(ids.owner), why).toBe(0)
  })

  it('T1-2 explains the WHY, keeps the recorded blocker and writes nothing but chat rows', async () => {
    const before = await caseRow()
    expect(before.diagnosis_scope.next_action.kind, pillarWhy(PILLAR, `turn 1 left no recorded hold: ${JSON.stringify(before.diagnosis_scope.next_action)} blockers=${JSON.stringify(before.diagnosis_scope.quote_blockers)}`)).not.toBe('wait')
    const turnsBefore = (await turnRows()).length
    const callsBefore = calls.length

    const result = await send('owner', WHY)
    const after = await caseRow()
    const turns = await turnRows()
    const reply = turns.at(-1)
    const why = pillarWhy(PILLAR, `status=${result.status} reply=${JSON.stringify(String(reply?.text_content).slice(0, 120))}`)
    expect(result.status, why).toBe(200)
    expect(turns.length - turnsBefore, `${why} (one customer turn and one Kael reply)`).toBe(2)
    expect(reply?.role, why).toBe('kael')
    expect(reply?.text_content, why).toBe(EXPLANATION_ANSWER)
    expect(calls.slice(callsBefore).map((call) => purposeOf(call.body)), why).toEqual(['case_turn_intent', 'normal_chat_response'])
    expect(after.diagnosis_scope.facts, why).toEqual(before.diagnosis_scope.facts)
    expect(after.diagnosis_scope.missing_facts, why).toEqual(before.diagnosis_scope.missing_facts)
    expect(after.diagnosis_scope.quote_blockers, `${why} (the recorded blocker survives an explanation)`).toEqual(before.diagnosis_scope.quote_blockers)
    expect(after.diagnosis_scope.next_action, why).toEqual(before.diagnosis_scope.next_action)
    expect(after.service_type, why).toBe('hvac')
    expect(after.job_id, why).toBeNull()
    expect(await jobsOf(ids.owner), why).toBe(0)
    expect(String(reply?.text_content), why).not.toMatch(/ngoài sáu dịch vụ|ngoài phạm vi sáu nhóm/)
  })

  it('T2-1 a second customer is refused by the route and cannot read the Case under RLS', async () => {
    const turnsBefore = await turnRows()
    const callsBefore = calls.length

    const result = await send('stranger', WHY)
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(404)
    expect(calls.length, `${why} (no model is reached for a refused actor)`).toBe(callsBefore)
    expect((await turnRows()).length, why).toBe(turnsBefore.length)

    const direct = await clients.stranger.from('kael_chat_sessions').select('id').eq('id', sessionId)
    expect(direct.error, why).toBeNull()
    expect(direct.data, `${why} (RLS hides another customer's Case)`).toEqual([])
    const directTurns = await clients.stranger.from('kael_chat_turns').select('id').eq('session_id', sessionId)
    expect(directTurns.data ?? [], why).toEqual([])
  })

  it('T2-2 a worker is refused by the route and cannot read or change the Case under RLS', async () => {
    const before = await caseRow()
    const result = await send('worker', WHY)
    expect(result.status, pillarWhy(PILLAR, 'worker on the Customer turn route')).toBe(403)

    const direct = await clients.worker.from('kael_chat_sessions').select('id').eq('id', sessionId)
    expect(direct.data ?? [], pillarWhy(PILLAR, 'worker direct read')).toEqual([])
    const write = await clients.worker.from('kael_chat_sessions').update({ service_type: 'plumbing' }).eq('id', sessionId).select('id')
    expect(write.data ?? [], pillarWhy(PILLAR, 'worker direct write must change no row')).toEqual([])
    expect((await caseRow()).service_type, pillarWhy(PILLAR, 'service unchanged')).toBe(before.service_type)
  })

  it('T2-3 the owner cannot move the Case into another service or link a Job through the data API', async () => {
    const attempt = await clients.owner.from('kael_chat_sessions').update({ service_type: 'plumbing', job_id: randomUUID() }).eq('id', sessionId).select('id')
    const row = await caseRow()
    const why = pillarWhy(PILLAR, `direct update error=${attempt.error?.message ?? 'none'} rows=${JSON.stringify(attempt.data)}`)
    expect(row.service_type, why).toBe('hvac')
    expect(row.job_id, why).toBeNull()
  })
})
