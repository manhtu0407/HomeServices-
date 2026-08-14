import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { runKaelPipeline, type SupabaseLike } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-create-pipeline', () => {
  installEdgeRuntimeTestHooks()

  it('rejects customer job creation without a concrete HCMC district before insert', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'Ha Noi',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(0)
  })

  it('cancels an analyzing job when the Kael pipeline throws unexpectedly', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { reject: new Error('DB timeout after 10000ms') },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'q7',
    })).rejects.toMatchObject({
      code: 'AI_FAILED',
      status: 502,
    })

    const cancelCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const updateValue = op[1] as { status?: string } | null
        return op[0] === 'update' && updateValue?.status === 'cancelled'
      })
    )
    expect(cancelCall?.operations).toContainEqual([
      'update',
      {
        status: 'cancelled',
        cancelled_at: expect.any(String),
        client_request_id: null,
      },
    ])
    expect(cancelCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(cancelCall?.operations).toContainEqual(['eq', 'status', 'analyzing'])
    expect(cancelCall?.operations).toContainEqual(['select', 'id'])
    expect(cancelCall?.operations).toContainEqual(['maybeSingle'])

    const failedEventCall = client.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) =>
        op[0] === 'insert' &&
        typeof op[1] === 'object' &&
        op[1] !== null &&
        'event_type' in op[1] &&
        op[1].event_type === 'kael_failed'
      )
    )
    expect(failedEventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_failed',
        from_status: 'analyzing',
        to_status: 'cancelled',
        safe_metadata: { reason_code: 'PIPELINE_THROW' },
      }),
    ])
  })

  it('declines unsupported work before touching price baselines', async () => {
    const supabase = {
      from: () => {
        throw new Error('baseline should not be queried for unsupported service')
      },
    }

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['Vấn đề khác'],
      description: 'Tôi cần sửa tủ lạnh trong căn hộ',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('rejects invalid price baseline rows instead of synthesizing a zero estimate', async () => {
    const invalidBaselineResult = {
      data: [{ price_min: null, price_max: 250000, district_code: 'q7' }],
      error: null,
    }
    const query: ReturnType<SupabaseLike['from']> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(invalidBaselineResult).then(onfulfilled, onrejected)
      },
    }
    const supabase: SupabaseLike = {
      from: () => query,
    }

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'NO_BASELINE' })
  })

  it('uses Anthropic intent fallback before local heuristic fallback when DeepSeek has no balance', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              service_type: 'plumbing',
              problem_slug: 'pipe_leak',
              confidence: 0.86,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 640) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_identified: 'Kitchen sink pipe leak',
              severity_indicators: ['steady leak'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      if (target.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              price_min: 170000,
              price_max: 330000,
              confidence: 0.74,
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'small', price_min: 150000, price_max: 350000, district_code: 'q1' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['pipe leak'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(false)
      expect(result.estimate.problem_category).toBe('pipe_leak')
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(result.stageLogs.filter((stage) => stage.stage === 'intent')).toEqual([
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        success: false,
        failureReason: 'AI call failed: HTTP_402',
        fallbackUsed: false,
      }),
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        success: true,
        fallbackUsed: false,
      }),
    ])
  })

  it('skips Anthropic vision analysis when no customer photos are present', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> & { max_tokens?: number }
      requestBodies.push(body)
      const target = String(url)

      if (target.includes('storage.example.com')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'plumbing',
                problem_slug: 'pipe_leak',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem', default_complexity: 'small' }], error: null },
      { data: [{ complexity: 'medium', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Lavabo đang rò nước phía dưới tủ.',
      district: 'q7',
      photoUrls: [],
    }, supabase, {
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(false)
      expect(result.stageLogs.some((stage) => stage.stage === 'vision')).toBe(false)
      expect(result.estimate.complexity).toBe('small')
      expect(result.estimate.problem_summary).toContain('Ống rò rỉ')
      expect(result.estimate.problem_summary).not.toContain('plumbing:')
    }
    expect(requestBodies.some((body) => body.max_tokens === 900)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('anthropic.com'),
      expect.objectContaining({
        body: expect.stringContaining('"max_tokens":900'),
      }),
    )
  })

  it('passes customer photo URLs to Anthropic vision analysis', async () => {
    vi.stubGlobal('Deno', {
      env: { get: vi.fn((name: string) => name === 'SUPABASE_URL' ? 'https://project.supabase.co' : undefined) },
    })
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> & { max_tokens?: number }
      requestBodies.push(body)
      const target = String(url)

      if (target.includes('project.supabase.co/storage/v1/')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'plumbing',
                problem_slug: 'pipe_leak',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 900) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_identified: 'Rò nước nhìn thấy dưới lavabo',
              severity_indicators: ['nước rỉ liên tục'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 90, output_tokens: 28 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'small', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])
    const photoUrl = 'https://project.supabase.co/storage/v1/object/sign/job-media/before-lavabo.jpg?token=test'

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Lavabo đang rò nước phía dưới tủ.',
      district: 'q7',
      photoUrls: [photoUrl],
    }, supabase, {
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    const visionBody = requestBodies.find((body) => body.max_tokens === 900)
    const visionMessages = visionBody?.messages as Array<{ content: unknown }> | undefined
    expect(visionMessages?.[0]?.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Lavabo đang rò nước phía dưới tủ.'),
      }),
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: expect.any(String),
        },
      },
    ])
  })

  it('normalizes AI-invented problem slugs to a service fallback before baseline lookup', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              service_type: 'electrical',
              problem_slug: 'short_circuit',
              confidence: 0.82,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 500) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_identified: 'Breaker trips repeatedly',
              severity_indicators: ['burning smell'],
              complexity_hint: 'medium',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 350000,
                market_range_max: 750000,
                confidence: 0.7,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'other-electrical-problem' }], error: null },
      { data: [{ complexity: 'medium', price_min: 300000, price_max: 700000, district_code: 'hcmc_all' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['cau dao trip'],
      description: 'Breaker keeps tripping and there is a light burning smell from an outlet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(true)
      expect(result.estimate.problem_category).toBe('other_electrical')
      expect(result.serviceProblemId).toBe('other-electrical-problem')
    }
    expect(supabase.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'electrical'],
        ['eq', 'slug', 'other_electrical'],
      ]),
    })
  })

  it('produces an honest hinge-adjustment estimate from the verified small-job baseline', async () => {
    const supabase = makeSequenceClient([
      { data: [{ id: 'hinge-problem', default_complexity: 'small' }], error: null },
      { data: [{ complexity: 'small', price_min: 150000, price_max: 350000, district_code: 'hcmc_all' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'handyman',
      problemChips: ['Sửa bản lề/tay nắm'],
      description: 'Một cánh tủ bếp bị xệ, hai bản lề còn tốt nhưng vít lỏng và cần căn chỉnh.',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('verified hinge baseline must produce an estimate')
    expect(result.serviceProblemId).toBe('hinge-problem')
    expect(result.estimate).toMatchObject({
      service_type: 'handyman',
      problem_category: 'repair_hinge_or_handle',
      complexity: 'small',
      price_min: 150000,
      price_max: 350000,
      confidence: 0.4,
      needs_inspection: false,
    })
  })
})
