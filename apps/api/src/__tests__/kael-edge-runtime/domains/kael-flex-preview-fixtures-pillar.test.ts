import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P374-kael-flex-preview-fixtures',
  invariant:
    'the payloads the Preview mock serves for the price-gap, question and worker-quote states are exactly what the real Edge code produces for the Production shelf case, so a Preview check cannot pass on a shape the server never sends',
  authority: [
    'governance/protocols/frontend-test.md (preview evidence must reflect real contracts)',
    'governance/RULES.md #8 (no fake success: the mock replays real server output)',
  ],
  target: 'scripts/preview/kael-flex/fixtures',
  layer: 'integration',
  siblings: ['P363-kael-turn-intent-router', 'P364-kael-evidence-gap-options', 'P365-kael-rfq-fallback-edge'],
  mutation:
    'edit any value in a fixture JSON — the matching state differs and turns red; change the gap reply copy in evidence-gap-response.ts without regenerating — the gap state turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({ answer: vi.fn() }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/customer/assistant.ts', () => ({
  answerKaelAssistant: (...args: unknown[]) => hooks.answer(...args),
}))

import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import { buildPriceEvidenceUnavailableArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { emitEvidenceGapStep } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-response'
import { getKaelChat } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/read.service'
import { routeKaelChatTurnIntent } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/turn-intent-router'

const FIXTURE_DIR = resolve(process.cwd(), '../../scripts/preview/kael-flex/fixtures')
const WRITE = process.env.KAEL_FLEX_FIXTURES_WRITE === '1'
const SESSION_ID = 'a3740000-0000-4000-8000-000000000001'
const CUSTOMER_ID = '0b6f5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5a'
const PROBLEM_ID = 'a3740000-0000-4000-8000-000000000002'

function seed() {
  const artifact = buildInitialDiagnosisScopeArtifact({
    serviceType: 'handyman',
    customerGoal: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.',
  })
  const scope = { ...artifact, facts: { ...artifact.facts, latest_customer_detail: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.' } }
  return memoryDb({
    kael_chat_sessions: [{
      id: SESSION_ID,
      job_id: null,
      customer_id: CUSTOMER_ID,
      service_type: 'handyman',
      status: 'active',
      case_phase: 'analysis',
      diagnosis_scope: scope,
      scheduled_at: '2026-10-13T02:00:00.000Z',
      started_at: '2026-10-12T02:07:12.000Z',
      estimate_ready_at: null,
      total_turns: 2,
      total_cost_usd: 0,
      created_at: '2026-10-12T02:07:12.000Z',
      safe_metadata: {
        language: 'vi',
        address_district: 'Quận 9',
        address_label: 'S1.07 Vinhomes Grand Park',
        problem_chips: ['Khoan/lắp kệ'],
      },
    }],
    kael_chat_turns: [
      { id: 'a3740000-0000-4000-8000-000000000101', session_id: SESSION_ID, turn_index: 1, role: 'customer', content_type: 'text', text_content: 'Dịch vụ: Sửa vặt & Lắp đặt\nVấn đề: Khoan/lắp kệ\nKhu vực: S1.07 Vinhomes Grand Park\nThời gian: T3 13/10 · Bắt đầu lúc 09:00\nMô tả: Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.', media_refs: [], safe_metadata: {}, created_at: '2026-10-12T02:07:12.000Z' },
      { id: 'a3740000-0000-4000-8000-000000000102', session_id: SESSION_ID, turn_index: 2, role: 'customer', content_type: 'text', text_content: 'Cứ đưa giá tham khảo để xem thử', media_refs: [], safe_metadata: {}, created_at: '2026-10-12T02:09:00.000Z' },
    ],
    service_problems: [{ id: PROBLEM_ID, slug: 'drill_or_mount_shelf' }],
    service_intake_policies: [{
      id: 'a3740000-0000-4000-8000-000000000003',
      version: 4,
      service_problem_id: PROBLEM_ID,
      status: 'active',
      quote_mode: 'kael_auto_quote',
      tier_a_fields: ['service_type', 'problem_slug', 'address_district', 'address_label', 'scheduled_at', 'description_min'],
      tier_b_slots: [
        { key: 'item_dimensions_weight_and_quantity', enabled: true, required_for_quote: false },
        { key: 'wall_surface_or_substrate', enabled: true, required_for_quote: false },
      ],
      question_overrides: {},
      safety_requirements: ['handyman_structural_or_concealed_service_risk', 'handyman_specialist_boundary'],
      capability_requirements: ['safe_drilling_and_mounting'],
      evidence_requirements: { minimum_source_count: 2, minimum_high_trust_source_count: 2, requires_active_baseline: false, allow_live_market_evidence: true, evidence_unavailable_fallback: 'rfq' },
    }],
  })
}

const ctx = (client: unknown) => ({ success: true, user: { id: CUSTOMER_ID }, role: 'customer', supabase: client }) as never

function compare(name: string, actual: unknown) {
  const file = resolve(FIXTURE_DIR, `${name}.json`)
  const serialized = `${JSON.stringify(actual, null, 2)}\n`
  if (WRITE) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, serialized)
  }
  expect(existsSync(file), pillarWhy(PILLAR, `missing fixture ${name}.json; run with KAEL_FLEX_FIXTURES_WRITE=1`)).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8')), pillarWhy(PILLAR, `${name} drifted from the real Edge output`)).toEqual(JSON.parse(serialized))
}

describe(`${PILLAR.id}: Preview replays real Edge payloads`, () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T02:10:00.000Z'))
  })
  afterAll(() => vi.useRealTimers())

  it('produces the gap, question and worker-quote states of the shelf case', async () => {
    hooks.answer.mockResolvedValue({
      answer: 'Kael chỉ báo giá khi có ít nhất 2 nguồn giá đáng tin cùng loại việc. Với việc khoan lắp kệ này, các nguồn tìm được chênh nhau quá nhiều nên Kael chưa chốt giá. Bạn có thể nhờ thợ phù hợp xem ảnh và báo giá chính xác.',
      safety_notes: [],
      fallback_used: false,
    })
    const db = seed()
    const unavailable = buildPriceEvidenceUnavailableArtifact(db.tables.kael_chat_sessions[0].diagnosis_scope as never, {
      customerDetail: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.',
      scopeSummary: 'Khoan lắp kệ gỗ 30x20cm lên tường gạch.',
    })
    await emitEvidenceGapStep({
      client: db.client as never,
      sessionId: SESSION_ID,
      progressTarget: { table: 'kael_chat_sessions', id: SESSION_ID },
      artifact: unavailable,
      stageLogs: [{
        stage: 'market',
        latencyMs: 1200,
        success: false,
        fallbackUsed: true,
        safeMetadata: {
          source_trust_aggregation_result: 'insufficient_tier_1_2_quorum',
          source_trust_tier_1_2_count: 0,
          source_trust_reference_sources: [
            { domain: 'thosuachua247.vn', verified_url: 'https://thosuachua247.vn/bang-gia-khoan-tuong', price_min: 100000, price_max: 200000, unit: 'per_item', date: '2026-08-01' },
            { domain: 'dichvutainha.vn', verified_url: 'https://dichvutainha.vn/khoan-lap-ke', price_min: 150000, price_max: 350000, unit: 'per_item', date: '2026-07-15' },
          ],
        },
      }],
      language: 'vi',
      responseSafetySignals: [],
      serviceProblemId: PROBLEM_ID,
      extraMetadata: { stage1_runtime_behavior: 'governed', fallback_used: true },
    })
    const gap = await getKaelChat(ctx(db.client), SESSION_ID)
    expect(gap.turns.at(-1)?.next_actions?.map((action) => action.kind)).toEqual(['request_worker_quote', 'attach_photo', 'provide_detail', 'ask_question'])
    compare('01-price-gap', gap)

    // sendKaelChatTurn stores the customer's message before the router runs; the thread shows it too.
    const routeChip = (intent: string, message: string) => {
      const session = db.tables.kael_chat_sessions[0]
      const turnIndex = Number(session.total_turns) + 1
      db.tables.kael_chat_turns.push({
        id: `a3740000-0000-4000-8000-${String(100 + turnIndex).padStart(12, '0')}`,
        session_id: SESSION_ID,
        turn_index: turnIndex,
        role: 'customer',
        content_type: 'text',
        text_content: message,
        media_refs: [],
        safe_metadata: {},
        created_at: new Date().toISOString(),
      })
      session.total_turns = turnIndex
      return routeKaelChatTurnIntent({
        ctx: ctx(db.client),
        client: db.client as never,
        sessionId: SESSION_ID,
        session: { ...session },
        persistedMetadata: session.safe_metadata as Record<string, unknown>,
        message,
        language: 'vi',
        chipIntent: intent,
        secrets: {} as never,
      })
    }
    expect(await routeChip('ask_question', 'Vì sao Kael chưa đưa ra giá cho việc này?')).toBe(true)
    compare('02-question-answered', await getKaelChat(ctx(db.client), SESSION_ID))

    expect(await routeChip('request_worker_quote', 'Gửi yêu cầu để thợ phù hợp xem ảnh và báo giá giúp mình.')).toBe(true)
    const rfq = await getKaelChat(ctx(db.client), SESSION_ID)
    expect(rfq.session.status).toBe('estimate_ready')
    expect(rfq.session.intake_coverage?.confirmation_kind).toBe('rfq_request')
    compare('03-worker-quote-ready', rfq)
  })
})
