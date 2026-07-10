import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import { analyzeDescription } from '../../../../../supabase/functions/mobile-api/_shared/kael/vision'

describe('mobile-api Kael vision language boundary', () => {
  beforeEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects an unaccented Vietnamese problem summary before it reaches the UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const target = String(url)

      if (target.includes('storage.example.com')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }

      if (target.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Ro ri lavabo can kiem tra tai cho',
              severity_indicators: [],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    }))

    const result = await analyzeDescription(
      'Lavabo trong can ho ro ri nhe, can tho kiem tra gioang va siphon.',
      'plumbing: pipe_leak',
      ['https://storage.example.com/job-media/before-lavabo.jpg'],
      { anthropicApiKey: 'anthropic-test' },
    )

    expect(result).toMatchObject({
      success: false,
      failureReason: 'AI vision Vietnamese validation failed',
      fallback: {
        problem_identified: 'plumbing: pipe_leak',
      },
    })
  })

  it('runs Opus after Sonnet 5 identifies a hard vision case', async () => {
    const models: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('storage.example.com')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }
      const body = JSON.parse(String(init?.body)) as { model: string }
      models.push(body.model)
      return new Response(JSON.stringify({
        content: [{
          text: JSON.stringify({
            problem_identified: 'Rò rỉ đường ống cần kiểm tra kỹ.',
            severity_indicators: ['vết ẩm'],
            complexity_hint: models.length === 1 ? 'large' : 'medium',
          }),
        }],
        usage: { input_tokens: 80, output_tokens: 20 },
      }))
    }))

    const result = await analyzeDescription(
      'Có vết ẩm lớn phía sau tường bếp.',
      'plumbing: pipe_leak',
      ['https://storage.example.com/job-media/behind-wall.jpg'],
      { anthropicApiKey: 'anthropic-test' },
    )

    expect(models).toEqual(['claude-sonnet-5', 'claude-opus-4-8'])
    expect(result).toMatchObject({ success: true, model: 'claude-opus-4-8' })
  })
})
