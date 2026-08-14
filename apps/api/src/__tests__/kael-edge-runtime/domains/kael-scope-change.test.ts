import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, attachDefaultJobMediaStorage } from '../harness'
import { testBaselineEvidenceDocument, testSourceTrustRegistryRows } from './kael-scope-change-source-fixtures'

describe('scope-change', () => {
  installEdgeRuntimeTestHooks()

  it('blocks the legacy direct scope route before AI spend or customer review', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = typeof url === 'string' ? url : url.toString()
      if (target.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_slug: 'replace_cabinet_hinges',
              complexity_assessment: 'small',
              confidence: 0.42,
              confirmed_facts: ['Đúng hai bản lề', 'Lối tiếp cận bình thường', 'Gỗ và cánh tủ còn nguyên'],
              unknowns: [],
              pricing_factors: {
                quantity: 2,
                access_condition: 'normal',
                secondary_damage: 'none_confirmed',
                material_tier: 'standard',
              },
              problem_summary: 'Phần phát sinh: ống chính cần thay đoạn lớn.',
              advisory: 'Cần Kael quyết định trước khi thợ tiếp tục.',
            }),
          }],
          usage: { input_tokens: 120, output_tokens: 48 },
        }))
      }
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'handyman',
          description: 'Một cánh tủ, hai bản lề, lối tiếp cận bình thường',
          kael_problem_identified: 'Căn chỉnh hai bản lề tủ',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          reason: null,
          validated_refs: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        }],
        error: null,
      },
      {
        data: [{ ok: true, error_code: null, claimed: true, replayed: false }],
        error: null,
      },
      {
        data: [{ id: 'problem-hinge-replacement', default_complexity: 'small' }],
        error: null,
      },
      {
        data: [{
          complexity: 'small',
          district_code: 'hcmc_all',
          price_min: 240000,
          price_max: 360000,
          source: 'daiphong_cabinet_hinge_replacement_per_piece_x2_2026_08',
        }],
        error: null,
      },
      { data: { scope_change_rate: 0.4 }, error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          scope_change_id: 'scope-1',
          scope_status: 'waiting_customer_decision',
          created_at_ts: '2026-05-20T00:00:00.000Z',
          side_effects_state: {
            database: { effect_id: '11111111-1111-4111-8111-111111111111', state: 'pending' },
            learning: { effect_id: '22222222-2222-4222-8222-222222222222', state: 'pending' },
            push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'pending' },
          },
        }],
        error: null,
      },
      { data: [{ ok: true, completed: true }], error: null },
      { data: [{ ok: true, completed: true }], error: null },
      {
        data: [{
          ok: true,
          claimed: true,
          completed: false,
          effect_id: '33333333-3333-4333-8333-333333333333',
          customer_id: 'customer-1',
        }],
        error: null,
      },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: [{ completed: true }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ anthropicApiKey: 'test-anthropic-key' }).requestScopeChange(ctx, 'job-1', {
      client_request_id: 'c5100000-0000-4000-8000-000000000001',
      new_description: 'Add repair scope after onsite inspection',
      reason: 'Found additional damaged part that needs immediate handling',
      photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
    })).rejects.toMatchObject({
      code: 'WORKER_QUOTE_CONFIRMATION_REQUIRED',
      status: 409,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.calls.some((call) => call.table === 'rpc:request_scope_change_atomic')).toBe(false)
  })

  it('previews the exact customer total, platform fee, and worker net before proposal', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((name: string) => name === 'KAEL_SOURCE_TRUST_HIGH_VALUE_VND'
          ? '1000000'
          : name === 'KAEL_AUTONOMY_FULL_ENABLED'
          ? 'true'
          : undefined),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [{
        type: 'text',
        text: JSON.stringify({
          problem_slug: 'replace_cabinet_hinges',
          complexity_assessment: 'small',
          confidence: 0.88,
          confirmed_facts: ['Đúng hai bản lề', 'Gỗ và cánh tủ còn nguyên', 'Lối tiếp cận bình thường'],
          unknowns: [],
          pricing_factors: {
            quantity: 2,
            access_condition: 'normal',
            secondary_damage: 'none_confirmed',
            material_tier: 'standard',
          },
          problem_summary: 'Hai bản lề nứt cần thay đúng loại tương thích.',
          advisory: 'Giữ nguyên gỗ và căn chỉnh lại cánh tủ sau khi thay.',
        }),
      }],
      usage: { input_tokens: 120, output_tokens: 48 },
    }))))
    const incident = {
      id: 'incident-1',
      job_id: 'job-1',
      status: 'ready_for_scope_proposal',
      evidence_status: 'ready',
      reported_description: 'Thay đúng hai bản lề tiêu chuẩn bị nứt.',
      reported_reason: 'Gỗ còn nguyên, tiếp cận bình thường, không có hư hỏng phụ.',
      evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
      revision: 4,
      created_at: '2026-08-13T08:00:00.000Z',
      updated_at: '2026-08-13T08:00:00.000Z',
    }
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'inspecting',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'handyman',
          description: 'Căn chỉnh một cánh tủ có hai bản lề.',
          address_district: 'q7',
          kael_problem_identified: 'Căn chỉnh hai bản lề tủ',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 350000,
        },
        error: null,
      },
      { data: incident, error: null },
      { data: [{ id: 'problem-hinge-replacement', default_complexity: 'small' }], error: null },
      {
        data: [{
          complexity: 'small',
          district_code: 'hcmc_all',
          price_min: 140000,
          price_max: 375000,
          price_evidence: testBaselineEvidenceDocument(),
          source: 'multi_source_hcmc_cabinet_door_2026_08',
        }],
        error: null,
      },
      { data: testSourceTrustRegistryRows(), error: null },
      { data: { scope_change_rate: 0 }, error: null },
      { data: [{ ok: true, error_code: null, incident }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({ anthropicApiKey: 'test-anthropic-key' })
      .previewScopeChangeFromJobIncident(ctx, 'job-1', {
        client_request_id: 'a7500000-0000-4000-8000-000000000010',
      })

    expect(result.quote).toMatchObject({
      quote_id: 'a7500000-0000-4000-8000-000000000010',
      customer_total: 258000,
      platform_fee: 38700,
      worker_net: 219300,
      commission_rate_bps: 1500,
      reference_price_min: 140000,
      reference_price_max: 375000,
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
    })
    expect(client.calls.find((call) =>
      call.table === 'rpc:save_job_incident_scope_price_quote_atomic'
    )?.operations).toContainEqual([
      'rpc',
      'save_job_incident_scope_price_quote_atomic',
      expect.objectContaining({
        p_expected_revision: 4,
        p_quote_id: 'a7500000-0000-4000-8000-000000000010',
      }),
    ])
  })

  it('keeps scope-change evidence media separate from completion photos', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'repairing',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: ['supabase://job-media/existing-after.jpg'],
        },
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'media-1' }], error: null },
      { data: null, error: null },
    ])
    attachDefaultJobMediaStorage(client)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/scope_change_evidence/evidence.jpg`,
        stage: 'scope_change_evidence',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        stage: 'scope_change_evidence',
        storage_ref: `supabase://job-media/${jobId}/scope_change_evidence/evidence.jpg`,
      })],
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) =>
        op[0] === 'update' && JSON.stringify(op[1]).includes('completion_photo_urls')
      )
    )).toBe(false)
  })

  it('notifies the worker when a scope change decision is recorded', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: verifiedScopeDecisionRow('job-1'), error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          job_id_out: 'job-1',
          scope_status: 'approved_by_customer',
          decided_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'approved_by_customer',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_approved',
        p_safe_metadata: expect.objectContaining({ scope_change_id: 'scope-1', decision: 'approve', actor: 'customer' }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?job_id=job-1'),
      }),
    )
    expect(client.calls.find((call) => call.table === 'scope_change_requests')?.operations)
      .toContainEqual(['select', 'job_id, request_timing, resume_job_status, kael_computed_min, kael_computed_max, kael_review'])
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('final_price'))
    )).toBe(false)
  })

  it('fails before A11 approval when the verified case-price receipt is missing', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { job_id: 'job-1', kael_computed_min: 300000, kael_computed_max: null, kael_review: {} }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'KAEL_PRICE_UNVERIFIED',
      status: 409,
    })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('scope_change_requests')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a balanced two-component full-scope receipt at A11', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))))
    const client = makeSequenceClient([
      { data: verifiedCompositeScopeDecisionRow('job-1'), error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          job_id_out: 'job-1',
          scope_status: 'approved_by_customer',
          decided_at_ts: '2026-08-14T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-08-14T00:00:00.000Z' }], error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).resolves.toMatchObject({ status: 'approved_by_customer' })
  })

  it('maps scope-change decision races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      { data: verifiedScopeDecisionRow('job-1'), error: null },
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })
})

function verifiedScopeDecisionRow(jobId: string) {
  return {
    job_id: jobId,
    kael_computed_max: 300000,
    kael_computed_min: 300000,
    kael_review: {
      baseline_evidence: testBaselineEvidenceReceipt(),
      baseline_source: 'verified-test-source',
      baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
      price_source: 'verified_baseline',
      pricing_mode: 'full_scope_total',
      reference_price_max: 360000,
      reference_price_min: 240000,
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      stakeholder_balance: {
        commission_level: 1,
        commission_rate_bps: 1500,
        customer_confirmation_required: true,
        customer_total: 300000,
        platform_fee: 45000,
        worker_confirmation_required: true,
        worker_net: 255000,
      },
      worker_price_confirmation: {
        confirmed: true,
        confirmed_at: '2026-08-13T08:00:00.000Z',
        quote_id: 'a7500000-0000-4000-8000-000000000010',
      },
    },
  }
}

function verifiedCompositeScopeDecisionRow(jobId: string) {
  const originalEvidence = {
    ...testBaselineEvidenceReceipt(),
    accepted_source_count: 3,
    aggregate_price_min: 700000,
    aggregate_price_max: 1200000,
    high_trust_source_count: 3,
    required_quorum: 3,
    sources: [
      testReceiptSource('diagnostic-a.example'),
      testReceiptSource('diagnostic-b.example'),
      testReceiptSource('diagnostic-c.example'),
    ].map((source) => ({ ...source, price_min: 700000, price_max: 1200000 })),
  }
  const repairEvidence = {
    ...testBaselineEvidenceReceipt(),
    aggregate_price_min: 150000,
    aggregate_price_max: 375000,
    unit: 'per_repair_point',
    sources: [
      { ...testReceiptSource('repair-a.example'), price_min: 150000, price_max: 400000, unit: 'per_repair_point' },
      { ...testReceiptSource('repair-b.example'), price_min: 150000, price_max: 350000, unit: 'per_repair_point' },
    ],
  }
  return {
    job_id: jobId,
    kael_computed_max: 1213000,
    kael_computed_min: 1213000,
    kael_review: {
      ...verifiedScopeDecisionRow(jobId).kael_review,
      baseline_evidence: repairEvidence,
      reference_price_max: 1575000,
      reference_price_min: 850000,
      pricing_components: [
        { evidence_receipt: originalEvidence, kind: 'original_confirmed_scope', price_max: 1200000, price_min: 700000, selected_price: 950000 },
        { evidence_receipt: repairEvidence, kind: 'approved_scope_change', price_max: 375000, price_min: 150000, selected_price: 263000 },
      ],
      stakeholder_balance: {
        commission_level: 1,
        commission_rate_bps: 1500,
        customer_confirmation_required: true,
        customer_total: 1213000,
        platform_fee: 181950,
        worker_confirmation_required: true,
        worker_net: 1031050,
      },
    },
  }
}

function testBaselineEvidenceReceipt() {
  return {
    schema_version: 'baseline_price_evidence_receipt.v1',
    accepted_source_count: 2,
    aggregate_price_min: 240000,
    aggregate_price_max: 360000,
    high_trust_source_count: 2,
    quorum_met: true,
    required_quorum: 2,
    unit: 'per_visit',
    sources: [
      testReceiptSource('source-a.example'),
      testReceiptSource('source-b.example'),
    ],
  }
}

function testReceiptSource(domain: string) {
  return {
    domain,
    url: `https://${domain}/price`,
    observed_at: '2026-08-13',
    price_min: 240000,
    price_max: 360000,
    unit: 'per_visit',
    effective_tier: 1,
    weight: 1,
  }
}
