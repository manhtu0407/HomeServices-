import {
  createKaelStreamUtf8Decoder,
  createKaelSseParser,
  isCustomerKaelConversationStreamResult,
  isCustomerKaelStreamResult,
  isWorkerKaelStreamResult,
} from '../kael-stream'
import { SERVICE_TYPES } from '@nestscout/shared'

describe('Kael SSE parser', () => {
  it('parses split stage, universal response lifecycle, token, result, and heartbeat frames', () => {
    const parser = createKaelSseParser()
    const first = parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.32')
    expect(first).toEqual([])

    const events = parser.push(',"updated_at":"2026-06-04T00:00:00.000Z"}\n\n: heartbeat\n\nevent: response.started\ndata: {"response_id":"turn-1","mode":"standard"}\n\nevent: block.started\ndata: {"block_id":"turn-1:block:0","kind":"paragraph"}\n\nevent: block.text.delta\ndata: {"block_id":"turn-1:block:0","delta":"Kael "}\n\nevent: response_delta\ndata: {"turn_id":"turn-1","delta":"Kael "}\n\nevent: block.completed\ndata: {"block_id":"turn-1:block:0"}\n\nevent: response.completed\ndata: {"response_id":"turn-1","elapsed_ms":840}\n\nevent: token\ndata: {"field":"clarification","delta":"B\\u1ea1n"}\n\nevent: result\ndata: {"session":{"id":"s1"},"turns":[]}\n\n')

    expect(events[0]).toMatchObject({
      type: 'stage',
      progress: {
        current_stage: 'market_lookup',
        status: 'running',
        progress: 0.32,
        updated_at: '2026-06-04T00:00:00.000Z',
      },
    })
    expect(events[1]).toEqual({ type: 'heartbeat' })
    expect(events.slice(2, 7)).toEqual([
      { mode: 'standard', responseId: 'turn-1', type: 'response.started' },
      { blockId: 'turn-1:block:0', kind: 'paragraph', type: 'block.started' },
      { blockId: 'turn-1:block:0', delta: 'Kael ', type: 'block.text.delta' },
      { blockId: 'turn-1:block:0', type: 'block.completed' },
      { elapsedMs: 840, responseId: 'turn-1', type: 'response.completed' },
    ])
    expect(events).not.toContainEqual({ type: 'response_delta', turnId: 'turn-1', delta: 'Kael ' })
    expect(events[7]).toEqual({ type: 'token', field: 'clarification', delta: 'B\u1ea1n' })
    expect(events[8]).toMatchObject({ type: 'result', data: { session: { id: 's1' }, turns: [] } })
  })

  it('keeps legacy verified response deltas when the server has not started a universal response', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: response_delta\ndata: {"turn_id":"turn-old","delta":"Kael "}\n\n')).toEqual([
      { delta: 'Kael ', turnId: 'turn-old', type: 'response_delta' },
    ])
  })

  it('parses bounded public processing receipts before stream handlers receive them', () => {
    const parser = createKaelSseParser()
    const events = parser.push([
      'event: reasoning.started',
      'data: {"receipt_id":"kael-reasoning:test","schema_version":"kael_reasoning.v1","started_at":"2026-08-10T00:00:00.000Z"}',
      '',
      'event: reasoning.step',
      'data: {"receipt_id":"kael-reasoning:test","schema_version":"kael_reasoning.v1","elapsed_ms":420,"step":{"id":"intent","label":"Checked the request","detail":null,"sequence":0,"stage":"intent","status":"completed"}}',
      '',
      'event: reasoning.completed',
      'data: {"receipt_id":"kael-reasoning:test","schema_version":"kael_reasoning.v1","elapsed_ms":840,"fallback_used":false,"summary":["Kael completed and saved a safe reply."]}',
      '',
      '',
    ].join('\n'))

    expect(events).toEqual([
      {
        receiptId: 'kael-reasoning:test',
        schemaVersion: 'kael_reasoning.v1',
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      },
      {
        elapsedMs: 420,
        receiptId: 'kael-reasoning:test',
        schemaVersion: 'kael_reasoning.v1',
        step: {
          detail: null,
          id: 'intent',
          label: 'Checked the request',
          sequence: 0,
          stage: 'intent',
          status: 'completed',
        },
        type: 'reasoning.step',
      },
      {
        elapsedMs: 840,
        fallbackUsed: false,
        receiptId: 'kael-reasoning:test',
        schemaVersion: 'kael_reasoning.v1',
        summary: ['Kael completed and saved a safe reply.'],
        type: 'reasoning.completed',
      },
    ])
  })

  it('accepts one universal response start and sanitizes a structured failure', () => {
    const parser = createKaelSseParser()
    const events = parser.push([
      'event: response.started',
      'data: {"response_id":"turn-1","mode":"fast"}',
      '',
      'event: response.started',
      'data: {"response_id":"turn-2","mode":"fast"}',
      '',
      'event: response.failed',
      'data: {"response_id":"turn-1","message":"private\\u202Edetail","recoverable":true}',
      '',
      '',
    ].join('\n'))

    expect(events).toEqual([
      { mode: 'fast', responseId: 'turn-1', type: 'response.started' },
      {
        message: 'Kael stream failed.',
        recoverable: true,
        responseId: 'turn-1',
        type: 'response.failed',
      },
    ])
  })

  it('drops malformed stage frames instead of surfacing fake progress', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"done","progress":2}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"invented","status":"running","progress":0.5,"updated_at":"2026-06-04T00:00:00.000Z"}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":2,"updated_at":"2026-06-04T00:00:00.000Z"}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.5}\n\n')).toEqual([])
  })

  it('sanitizes hostile error frames before handlers or UI receive them', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: error\ndata: {"code":"not_found","message":"private\\u202Edetail"}\n\n')).toEqual([
      { code: 'STREAM_ERROR', message: 'Kael stream failed.', type: 'error' },
    ])
    expect(parser.push('event: error\ndata: {"code":"STREAM_BUSY","message":"Kael is busy"}\n\n')).toEqual([
      { code: 'STREAM_BUSY', message: 'Kael is busy', type: 'error' },
    ])
  })

  it('accepts only structurally complete customer stream results', () => {
    const valid = {
      session: {
        id: 'session-1',
        job_id: null,
        customer_id: 'customer-1',
        service_type: 'electrical',
        status: 'active',
        case_phase: 'analysis',
        diagnosis_scope: null,
        scheduled_at: null,
        estimate: null,
        started_at: '2026-07-15T00:00:00.000Z',
        estimate_ready_at: null,
        total_turns: 0,
        total_cost_usd: 0,
        next_action: 'await_input',
      },
      turns: [],
    }

    for (const serviceType of SERVICE_TYPES) {
      expect(isCustomerKaelStreamResult({
        ...valid,
        session: { ...valid.session, service_type: serviceType },
      })).toBe(true)
    }
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: { ...valid.session, service_type: 'air_conditioning' },
    })).toBe(false)
    expect(isCustomerKaelStreamResult({ session: { id: 'session-1' }, turns: [] })).toBe(false)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: { ...valid.session, total_cost_usd: Number.POSITIVE_INFINITY },
    })).toBe(false)
  })

  it('accepts grounded analysis receipts and rejects findings that do not map to evidence', () => {
    const analysisReceipt = {
      schema_version: 'analysis_receipt.v1',
      evidence: {
        analysis_status: 'analyzed',
        photo_count: 1,
        video_frame_count: 0,
        voice_transcript_count: 0,
        skipped: false,
        findings: [{
          confidence: 'medium',
          evidence_index: 1,
          evidence_kind: 'photo',
          observation: 'Hình 1 cho thấy vùng tường gần đầu ống có vệt ẩm.',
          possible_meaning: 'Có thể liên quan đến điểm nối bị rò.',
        }],
      },
      market: {
        accepted_source_count: 3,
        high_trust_source_count: 2,
        quorum_met: true,
      },
      problem: {
        summary: 'Dấu hiệu hiện có phù hợp với rò nước cục bộ quanh đầu nối.',
        severity_indicators: ['Vệt ẩm tập trung quanh một điểm nối'],
        recommended_scope: 'Thợ cần kiểm tra đầu nối và đo độ ẩm vùng lân cận.',
        remaining_uncertainty: 'Ảnh chưa cho thấy phần ống phía sau tường.',
      },
    }
    const estimate = {
      service_type: 'plumbing',
      problem_category: 'pipe_leak',
      problem_summary: 'Vùng tường gần đầu ống có dấu hiệu bị ẩm.',
      complexity: 'medium',
      price_min: 250000,
      price_max: 450000,
      confidence: 0.72,
      advisory: null,
      disclaimer: 'Đây là ước tính theo dữ liệu hiện có.',
      analysis_receipt: analysisReceipt,
    }
    const valid = {
      session: {
        id: 'session-1',
        job_id: null,
        customer_id: 'customer-1',
        service_type: 'plumbing',
        status: 'active',
        case_phase: 'offer_review',
        diagnosis_scope: null,
        scheduled_at: null,
        estimate,
        started_at: '2026-08-01T00:00:00.000Z',
        estimate_ready_at: '2026-08-01T00:00:01.000Z',
        total_turns: 0,
        total_cost_usd: 0,
        next_action: 'estimate_ready',
      },
      turns: [],
    }

    expect(isCustomerKaelStreamResult(valid)).toBe(true)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: {
        ...valid.session,
        estimate: {
          ...estimate,
          analysis_receipt: {
            ...analysisReceipt,
            evidence: {
              ...analysisReceipt.evidence,
              findings: [{ ...analysisReceipt.evidence.findings[0], evidence_index: 2 }],
            },
          },
        },
      },
    })).toBe(false)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: {
        ...valid.session,
        estimate: {
          ...estimate,
          analysis_receipt: {
            ...analysisReceipt,
            evidence: {
              ...analysisReceipt.evidence,
              analysis_status: 'invented',
            },
          },
        },
      },
    })).toBe(false)
  })

  it('accepts a reconciled public price reasoning receipt and rejects hidden numeric components', () => {
    const priceReasoningReceipt = {
      schema_version: 'price_reasoning_receipt.v1',
      receipt_id: 'receipt_kael_price_20260811_01',
      problem: {
        confirmed_facts: ['The customer reports a slow leak below the basin.'],
        possible_causes: [{
          statement: 'A loose accessible connection may be contributing to the leak.',
          basis: ['customer_report'],
          confidence: 'medium',
        }],
        unknowns: ['The hidden pipe condition is not confirmed.'],
      },
      scope: {
        included: ['Inspect the accessible connection.'],
        conditional: ['Replace a worn seal if the customer approves it on site.'],
        excluded: ['Concealed pipework repair.'],
      },
      costs: {
        currency: 'VND',
        total_min: 250000,
        total_max: 450000,
        reconciliation: 'package_total',
        components: [{
          kind: 'service_package',
          status: 'priced',
          amount_min: 250000,
          amount_max: 450000,
          explanation: 'The governed package covers the confirmed accessible scope.',
        }],
      },
      scenarios: {
        low: {
          total: 250000,
          conditions: ['The connection is accessible.'],
          scope: ['Inspect and secure the connection.'],
        },
        high: {
          total: 450000,
          conditions: ['The visit uses the approved accessible package scope.'],
          scope: ['Inspect, diagnose, and complete the package.'],
        },
      },
      fairness: {
        price_source: 'baseline_with_market',
        confidence: 'medium',
        market_source_count: 3,
        high_trust_source_count: 2,
        quorum_met: true,
        cap_statement: 'The upper amount is the cap for this scope.',
        remaining_uncertainty: ['A concealed issue needs a separate proposal.'],
      },
    }
    const valid = {
      session: {
        id: 'session-1',
        job_id: null,
        customer_id: 'customer-1',
        service_type: 'plumbing',
        status: 'estimate_ready',
        case_phase: 'offer_review',
        diagnosis_scope: null,
        scheduled_at: null,
        estimate: {
          service_type: 'plumbing',
          problem_category: 'pipe_leak',
          problem_summary: 'A slow leak is reported below the basin.',
          complexity: 'medium',
          price_min: 250000,
          price_max: 450000,
          confidence: 0.72,
          advisory: null,
          disclaimer: 'This is an estimate based on the current information.',
          price_reasoning_receipt: priceReasoningReceipt,
        },
        started_at: '2026-08-01T00:00:00.000Z',
        estimate_ready_at: '2026-08-01T00:00:01.000Z',
        total_turns: 0,
        total_cost_usd: 0,
        next_action: 'estimate_ready',
      },
      turns: [],
    }

    expect(isCustomerKaelStreamResult(valid)).toBe(true)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: {
        ...valid.session,
        estimate: {
          ...valid.session.estimate,
          price_reasoning_receipt: {
            ...priceReasoningReceipt,
            costs: {
              ...priceReasoningReceipt.costs,
              components: [{
                kind: 'replacement_parts',
                status: 'conditional_unpriced',
                amount_min: 50000,
                amount_max: 50000,
                explanation: 'This must not expose a price before verification.',
              }],
            },
          },
        },
      },
    })).toBe(false)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: {
        ...valid.session,
        estimate: {
          ...valid.session.estimate,
          price_reasoning_receipt: {
            ...priceReasoningReceipt,
            costs: {
              ...priceReasoningReceipt.costs,
              reconciliation: 'exact',
              components: [{
                kind: 'labor',
                status: 'priced',
                amount_min: 250000,
                amount_max: 450000,
                explanation: 'The client must not accept an inferred labor line item.',
              }],
            },
          },
        },
      },
    })).toBe(false)
  })

  it('accepts only complete Customer conversation stream results', () => {
    const valid = {
      session: {
        id: 'conversation-1',
        mode: 'normal',
        customer_id: 'customer-1',
        case_job_id: null,
        case_session_id: null,
        client_request_id: 'create-1',
        title: null,
        pinned_at: null,
        profile_id: null,
        service_type: null,
        started_at: '2026-07-29T00:00:00.000Z',
        updated_at: '2026-07-29T00:00:01.000Z',
        total_turns: 2,
      },
      turns: [
        {
          id: 'turn-1',
          conversation_id: 'conversation-1',
          client_request_id: 'request-1',
          turn_index: 1,
          role: 'customer',
          text_content: 'Xin chao',
          created_at: '2026-07-29T00:00:00.000Z',
        },
        {
          id: 'turn-2',
          conversation_id: 'conversation-1',
          client_request_id: null,
          turn_index: 2,
          role: 'kael',
          text_content: 'Chao ban',
          created_at: '2026-07-29T00:00:01.000Z',
        },
      ],
    }

    expect(isCustomerKaelConversationStreamResult(valid)).toBe(true)
    expect(isCustomerKaelConversationStreamResult({
      ...valid,
      session: { ...valid.session, total_turns: 1 },
    })).toBe(false)
    expect(isCustomerKaelConversationStreamResult({
      ...valid,
      turns: [{ ...valid.turns[0], role: 'worker' }],
    })).toBe(false)
  })

  it('accepts only structurally complete worker stream results', () => {
    const valid = {
      session: {
        id: 'session-1',
        job_id: 'job-1',
        worker_id: 'worker-1',
        status: 'active',
        started_at: '2026-07-15T00:00:00.000Z',
        closed_at: null,
        total_turns: 0,
        progress: null,
      },
      turns: [],
    }

    expect(isWorkerKaelStreamResult(valid)).toBe(true)
    expect(isWorkerKaelStreamResult({ ...valid, turns: {} })).toBe(false)
    expect(isWorkerKaelStreamResult({
      ...valid,
      session: { ...valid.session, total_turns: -1 },
    })).toBe(false)
  })

  it('rejects an unterminated frame before its buffer can grow without bound', () => {
    const parser = createKaelSseParser()

    expect(() => parser.push('x'.repeat(300_000))).toThrow('STREAM_FRAME_TOO_LARGE')
  })

  it('rejects invalid and truncated UTF-8 stream bytes', () => {
    const invalid = createKaelStreamUtf8Decoder()
    expect(() => invalid.push(new Uint8Array([0xc3, 0x28]))).toThrow('STREAM_INVALID_ENCODING')

    const truncated = createKaelStreamUtf8Decoder()
    expect(truncated.push(new Uint8Array([0xe2, 0x82]))).toBe('')
    expect(() => truncated.push(undefined, true)).toThrow('STREAM_INVALID_ENCODING')
  })
})
