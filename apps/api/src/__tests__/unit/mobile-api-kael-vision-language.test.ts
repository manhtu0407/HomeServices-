import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/guards/circuit-breaker'
import { analyzeDescription } from '../../../../../supabase/functions/mobile-api/_shared/kael/vision'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

describe('mobile-api Kael vision language boundary', () => {
  beforeEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    vi.stubGlobal('Deno', {
      env: { get: vi.fn((name: string) => name === 'SUPABASE_URL' ? 'https://project.supabase.co' : undefined) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects an unaccented Vietnamese problem summary before it reaches the UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const target = String(url)

      if (target.includes('project.supabase.co/storage/v1/')) {
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
      ['https://project.supabase.co/storage/v1/object/sign/job-media/before-lavabo.jpg?token=test'],
      { anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
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
      if (target.includes('project.supabase.co/storage/v1/')) {
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
      ['https://project.supabase.co/storage/v1/object/sign/job-media/behind-wall.jpg?token=test'],
      { anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
    )

    expect(models).toEqual(['claude-sonnet-5', 'claude-opus-4-8'])
    expect(result).toMatchObject({ success: true, model: 'claude-opus-4-8' })
  })

  it('rejects Vietnamese vision output when the selected language is English', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const target = String(url)
      if (target.includes('project.supabase.co/storage/v1/')) {
        return new Response(new Uint8Array([255, 216, 255, 217]), {
          headers: { 'content-type': 'image/jpeg' },
        })
      }
      return new Response(JSON.stringify({
        content: [{
          text: JSON.stringify({
            problem_identified: 'Cầu dao tự nhảy sau khi bật lại.',
            severity_indicators: [],
            complexity_hint: 'small',
          }),
        }],
        usage: { input_tokens: 80, output_tokens: 20 },
      }))
    }))

    const result = await analyzeDescription(
      'The breaker trips again after reset.',
      'electrical: breaker_trip',
      ['https://project.supabase.co/storage/v1/object/sign/job-media/breaker.jpg?token=test'],
      { anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
      'en',
    )

    expect(result).toMatchObject({
      success: false,
      failureReason: 'AI vision English validation failed',
      fallback: { problem_identified: 'electrical: breaker_trip' },
    })
  })

  it.each([
    ['an upstream HTTP failure', 502, 'image/jpeg'],
    ['an unsupported media type', 200, 'text/html'],
  ])('cancels the image body after %s', async (_label, status, contentType) => {
    let canceled = false
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
        },
        cancel() {
          canceled = true
        },
      }),
      { status, headers: { 'content-type': contentType } },
    )))

    const result = await analyzeDescription(
      'Photo cannot be analyzed.',
      'plumbing: pipe_leak',
      ['https://project.supabase.co/storage/v1/object/sign/job-media/unreadable.jpg?token=test'],
      { anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
      'en',
    )

    expect(result).toMatchObject({
      success: false,
      failureReason: 'NO_FETCHABLE_PHOTOS_FOR_VISION',
    })
    expect(canceled).toBe(true)
  })

  it.each([
    'http://127.0.0.1:54321/storage/v1/object/sign/job-media/internal.jpg',
    'https://attacker.example/storage/v1/object/sign/job-media/external.jpg',
    'https://project.supabase.co/functions/v1/private-health',
    'https://project.supabase.co/storage/v1/object/sign/job-media/photo.jpg#fragment',
  ])('does not fetch an untrusted vision URL: %s', async (photoUrl) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeDescription(
      'Ảnh cần được kiểm tra.',
      'plumbing: pipe_leak',
      [photoUrl],
      { anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
    )

    expect(result).toMatchObject({
      success: false,
      failureReason: 'NO_FETCHABLE_PHOTOS_FOR_VISION',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
