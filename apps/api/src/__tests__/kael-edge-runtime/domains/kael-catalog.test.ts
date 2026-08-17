import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { runKaelPipeline } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('catalog', () => {
  installEdgeRuntimeTestHooks()

  it('fails the service catalog when price baselines cannot load', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('maps thrown DB query failures to DB_ERROR instead of an unhandled Edge error', async () => {
    const client = makeSequenceClient([
      { reject: new Error('DB timeout after 10000ms') },
      { data: [], error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an invalid price range', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'q7',
          price_min: 0,
          price_max: 250000,
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

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an unknown district code', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'unknown-district',
          price_min: 100000,
          price_max: 250000,
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

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('deduplicates service-level catalog baselines when rows are problem-specific', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sua nuoc' }], error: null },
      {
        data: [
          { id: 'problem-1', service_category_id: 'cat-1', slug: 'pipe_leak', label_vi: 'Leak', default_complexity: 'small' },
          { id: 'problem-2', service_category_id: 'cat-1', slug: 'faucet_broken', label_vi: 'Faucet', default_complexity: 'small' },
        ],
        error: null,
      },
      {
        data: [
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-1',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-2',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listServices(ctx)

    expect(result.services[0].baselines).toEqual([{
      complexity: 'small',
      district_code: 'hcmc_all',
      price_min: 150000,
      price_max: 350000,
    }])
  })

  it('filters Edge baseline lookup by the classified problem slug', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'medium', price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q7',
    }, client, {})

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(client.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'slug', 'pipe_leak'],
      ]),
    })
    expect(client.calls[1]).toMatchObject({
      table: 'price_baselines',
      operations: expect.arrayContaining([
        ['eq', 'service_problem_id', 'pipe-problem'],
        ['eq', 'service_type', 'plumbing'],
        ['in', 'district_code', ['q7', 'hcmc_all']],
      ]),
    })
  })

  it('applies learned Edge Kael complexity and price rules when the read-path flag is enabled', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ complexity: 'large', price_min: 250000, price_max: 450000, district_code: 'q7' }], error: null },
      {
        data: [{
          id: 'complexity-rule-1',
          active_version: 1,
          affected_district: 'q7',
          rule_payload: {
            candidate_type: 'analysis_rule',
            suggested: {
              kind: 'raise_complexity_prior',
              from: 'medium',
              to: 'large',
              rationale: 'Frequent scope increases for this problem.',
            },
          },
        }],
        error: null,
      },
      {
        data: [{
          id: 'price-rule-1',
          active_version: 2,
          affected_district: 'q7',
          rule_payload: {
            candidate_type: 'price_prior_update',
            suggested: {
              new_min: 500000,
              new_max: 700000,
            },
          },
        }],
        error: null,
      },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q7',
    }, client, { learningEnabled: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.complexity).toBe('large')
      expect(result.estimate.price_min).toBe(500000)
      expect(result.estimate.price_max).toBe(700000)
    }

    const learningCalls = client.calls.filter((call) => call.table === 'learning_rules')
    expect(learningCalls).toHaveLength(2)
    expect(learningCalls[0].operations).toContainEqual(['eq', 'rule_type', 'analysis_rule'])
    expect(learningCalls[1].operations).toContainEqual(['eq', 'rule_type', 'price_prior_update'])

    const baselineCall = client.calls.find((call) => call.table === 'price_baselines')
    expect(baselineCall?.operations).toContainEqual([
      'select',
      'complexity, price_min, price_max, district_code, source, price_evidence',
    ])
    expect(baselineCall?.operations).toContainEqual(['in', 'district_code', ['q7', 'hcmc_all']])
  })
})
