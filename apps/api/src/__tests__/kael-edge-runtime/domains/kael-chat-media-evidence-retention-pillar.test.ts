import { afterEach, describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createSignedCaseWorkEvidenceUrls, createSignedVisionUrls } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P247-kael-chat-media-retention-read',
  invariant: 'Expired Kael image intents are not signed in history or model requests, while unreadable retention state or missing Storage configuration fails visibly instead of dropping image context.',
  authority: ['governance/RULES.md #8 (no silent degradation)', 'governance/RULES.md Multimodal Evidence Privacy'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision.ts',
  layer: 'integration',
  siblings: ['P190-customer-media-upload', 'P79-worker-completion-media-ownership'],
  mutation: 'Let a stale model-vision image reach Storage signing after retention; the expired-intent assertion observes the forbidden signing attempt and turns red.',
} as const satisfies PillarManifest

const CUSTOMER = 'e2460000-0000-4000-8000-000000000002'
const OBJECT_PATH = `${CUSTOMER}/kael-chat/model_vision/retained.jpg`
const MEDIA_REF = `supabase://kael-chat-media/${OBJECT_PATH}`
const VISION_EVIDENCE = [{ kind: 'photo', ref: MEDIA_REF, model_eligible: true }] as Parameters<typeof createSignedVisionUrls>[1]

afterEach(() => vi.unstubAllGlobals())

describe('Kael chat evidence media retention', () => {
  it.each([
    ['expired', { status: 'expired', cleaned_at: null, delete_after: '2026-01-01T00:00:00.000Z' }],
    ['cleaned', { status: 'consumed', cleaned_at: '2026-09-27T00:00:00.000Z', delete_after: '2026-10-27T00:00:00.000Z' }],
    ['past its retention deadline during cleanup', { status: 'consumed', cleaned_at: null, delete_after: '2026-09-27T00:00:00.000Z' }],
  ])('does not sign an image whose intent is %s', async (_label, intent) => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: [{ object_path: OBJECT_PATH, ...intent }],
        error: null,
      }],
    })
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })

    await expect(
      createSignedCaseWorkEvidenceUrls(context(client), [MEDIA_REF], CUSTOMER),
      pillarWhy(PILLAR, `expired or cleaned intent: ${_label}`),
    ).resolves.toEqual([])
    expect(createSignedUrl, pillarWhy(PILLAR, 'expired or cleaned image must not reach Storage signing')).not.toHaveBeenCalled()
  })

  it('signs an image with a current retained intent', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: [{
          object_path: OBJECT_PATH,
          status: 'consumed',
          cleaned_at: null,
          delete_after: '2099-01-01T00:00:00.000Z',
        }],
        error: null,
      }],
    })
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })

    await expect(
      createSignedCaseWorkEvidenceUrls(context(client), [MEDIA_REF], CUSTOMER),
      pillarWhy(PILLAR, 'retained current image is signed'),
    ).resolves.toEqual(['https://storage.example.test/image.jpg'])
    expect(createSignedUrl, pillarWhy(PILLAR, 'retained current image reaches Storage signing once')).toHaveBeenCalledOnce()
  })

  it('omits a missing intent while preserving non-storage references', async () => {
    const missingClient = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{ data: [], error: null }],
    })
    const missingSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(missingClient, { storage: { from: vi.fn(() => ({ createSignedUrl: missingSignedUrl })) } })

    await expect(
      createSignedCaseWorkEvidenceUrls(context(missingClient), [MEDIA_REF, 'https://evidence.example.test/reference'], CUSTOMER),
      pillarWhy(PILLAR, 'missing retention intent is omitted without suppressing external evidence'),
    ).resolves.toEqual(['https://evidence.example.test/reference'])
    expect(missingSignedUrl, pillarWhy(PILLAR, 'missing intent must not reach Storage signing')).not.toHaveBeenCalled()
  })

  it('surfaces retention database failures instead of silently omitting image context', async () => {
    const unreadableClient = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{ data: null, error: { message: 'query failed' } }],
    })
    const unreadableSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(unreadableClient, { storage: { from: vi.fn(() => ({ createSignedUrl: unreadableSignedUrl })) } })

    await expect(
      createSignedCaseWorkEvidenceUrls(context(unreadableClient), [MEDIA_REF], CUSTOMER),
      pillarWhy(PILLAR, 'retention query failure must fail visibly before signing'),
    ).rejects.toMatchObject({ code: 'MEDIA_VALIDATION_UNAVAILABLE', status: 503 })
    expect(unreadableSignedUrl, pillarWhy(PILLAR, 'no Storage request is issued when retention state is unknown')).not.toHaveBeenCalled()
  })

  it('surfaces missing Storage configuration for a valid Kael image ref', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: [{
          object_path: OBJECT_PATH,
          status: 'consumed',
          cleaned_at: null,
          delete_after: '2099-01-01T00:00:00.000Z',
        }],
        error: null,
      }],
    })

    await expect(
      createSignedCaseWorkEvidenceUrls(context(client), [MEDIA_REF], CUSTOMER),
      pillarWhy(PILLAR, 'a valid Kael image cannot be presented as available without Storage signing'),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_CONFIGURED', status: 500 })
  })

  it('does not sign an expired image before sending it to Kael', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: [{
          object_path: OBJECT_PATH,
          status: 'consumed',
          cleaned_at: null,
          delete_after: '2026-09-27T00:00:00.000Z',
        }],
        error: null,
      }],
    })
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })

    await expect(
      createSignedVisionUrls(context(client), VISION_EVIDENCE, CUSTOMER),
      pillarWhy(PILLAR, 'expired image is rejected before Storage signing or model analysis'),
    ).rejects.toMatchObject({ code: 'MEDIA_INTENT_EXPIRED', status: 400 })
    expect(createSignedUrl, pillarWhy(PILLAR, 'expired model-vision image must not reach Storage signing')).not.toHaveBeenCalled()
  })

  it('fails visibly when the model-image retention state cannot be read', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{ data: null, error: { message: 'query failed' } }],
    })
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })

    await expect(
      createSignedVisionUrls(context(client), VISION_EVIDENCE, CUSTOMER),
      pillarWhy(PILLAR, 'unknown retention state must not be represented as available image context'),
    ).rejects.toMatchObject({ code: 'MEDIA_VALIDATION_UNAVAILABLE', status: 503 })
    expect(createSignedUrl, pillarWhy(PILLAR, 'do not sign while retention state is unknown')).not.toHaveBeenCalled()
  })

  it('signs only an active consumed image intent for the model', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: [{
          object_path: OBJECT_PATH,
          status: 'consumed',
          cleaned_at: null,
          delete_after: '2099-01-01T00:00:00.000Z',
        }],
        error: null,
      }],
    })
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://storage.example.test/image.jpg' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9]),
      { headers: { 'content-type': 'image/jpeg', 'content-length': '14' } },
    )))

    await expect(
      createSignedVisionUrls(context(client), VISION_EVIDENCE, CUSTOMER),
      pillarWhy(PILLAR, 'current consumed image intent remains analyzable'),
    ).resolves.toEqual(['https://storage.example.test/image.jpg'])
    expect(createSignedUrl, pillarWhy(PILLAR, 'a valid retained image reaches Storage signing once')).toHaveBeenCalledOnce()
  })
})

function context(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: CUSTOMER },
    role: 'customer',
    supabase: client,
    privilegedSupabase: client,
  }
}
