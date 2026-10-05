import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createKaelChatMediaPreviews } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P312-kael-chat-media-preview-links',
  invariant:
    'a saved chat turn shows only its owner\'s own photos through short-lived links signed in one batch; a photo past retention reads as expired, and a foreign ref, a missing or unreadable retention row, or signing failure reads as unavailable without failing the history read',
  authority: [
    'governance/RULES.md Multimodal Evidence Privacy (owner-only media access)',
    'governance/RULES.md #8 (no silent degradation: expired and unavailable are reported, never confused)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision.ts',
  layer: 'integration',
  siblings: ['P247-kael-chat-media-retention-read', 'P313-kael-chat-turn-images'],
  mutation:
    'drop the owner check in createKaelChatMediaPreviews, or sign an expired intent — the foreign-ref or expired case turns red',
} as const satisfies PillarManifest

const OWNER = 'e2460000-0000-4000-8000-000000000002'
const OTHER = 'e2460000-0000-4000-8000-000000000009'
const ownRef = (name: string) => `supabase://kael-chat-media/${OWNER}/kael-chat/model_vision/${name}`
const OWN_PATH = `${OWNER}/kael-chat/model_vision/kept.jpg`
const OLD_PATH = `${OWNER}/kael-chat/model_vision/old.jpg`
const FOREIGN_REF = `supabase://kael-chat-media/${OTHER}/kael-chat/model_vision/theirs.jpg`

function clientWith(intents: { data: unknown; error: { message: string } | null }) {
  const client = makeSequenceClient([], {}, { kael_chat_media_upload_intents: [intents] })
  const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example.test/${path}?token=t` }, error: null }))
  Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })
  return { client, createSignedUrl }
}

function context(client: unknown) {
  return { supabase: client, privilegedSupabase: client, user: { id: OWNER }, role: 'customer' } as unknown as MobileApiContext
}

describe('P312 Kael chat media preview links', () => {
  it('signs a kept photo, reports a past-retention photo as expired, and never signs a foreign ref', async () => {
    const { client, createSignedUrl } = clientWith({
      data: [
        { object_path: OWN_PATH, status: 'consumed', cleaned_at: null, delete_after: '2099-01-01T00:00:00.000Z' },
        { object_path: OLD_PATH, status: 'consumed', cleaned_at: '2026-09-27T00:00:00.000Z', delete_after: '2026-09-27T00:00:00.000Z' },
      ],
      error: null,
    })
    const previews = await createKaelChatMediaPreviews(context(client), [ownRef('kept.jpg'), ownRef('old.jpg'), FOREIGN_REF], OWNER)
    expect(previews, pillarWhy(PILLAR, 'each ref gets its own honest status')).toEqual([
      { ref: ownRef('kept.jpg'), status: 'available', url: `https://storage.example.test/${OWN_PATH}?token=t` },
      { ref: ownRef('old.jpg'), status: 'expired', url: null },
      { ref: FOREIGN_REF, status: 'unavailable', url: null },
    ])
    expect(createSignedUrl, pillarWhy(PILLAR, 'only the owner\'s kept photo reaches Storage signing')).toHaveBeenCalledTimes(1)
    expect(createSignedUrl).toHaveBeenCalledWith(OWN_PATH, 15 * 60)
  })

  it('reports unavailable, not expired, when retention state cannot be read', async () => {
    const { client, createSignedUrl } = clientWith({ data: null, error: { message: 'query failed' } })
    await expect(createKaelChatMediaPreviews(context(client), [ownRef('kept.jpg')], OWNER), pillarWhy(PILLAR, 'an unknown retention state is not a deleted photo'))
      .resolves.toEqual([{ ref: ownRef('kept.jpg'), status: 'unavailable', url: null }])
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('reports unavailable when Storage refuses to sign', async () => {
    const { client } = clientWith({
      data: [{ object_path: OWN_PATH, status: 'consumed', cleaned_at: null, delete_after: '2099-01-01T00:00:00.000Z' }],
      error: null,
    })
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(async () => ({ data: null, error: { message: 'denied' } })) })) } })
    await expect(createKaelChatMediaPreviews(context(client), [ownRef('kept.jpg')], OWNER))
      .resolves.toEqual([{ ref: ownRef('kept.jpg'), status: 'unavailable', url: null }])
  })

  it('reports unavailable, not expired, when a photo has no retention row', async () => {
    const { client, createSignedUrl } = clientWith({
      data: [{ object_path: OWN_PATH, status: 'consumed', cleaned_at: null, delete_after: '2099-01-01T00:00:00.000Z' }],
      error: null,
    })
    await expect(createKaelChatMediaPreviews(context(client), [ownRef('kept.jpg'), ownRef('legacy.jpg')], OWNER), pillarWhy(PILLAR, 'no retention evidence is not proof the photo expired'))
      .resolves.toEqual([
        { ref: ownRef('kept.jpg'), status: 'available', url: `https://storage.example.test/${OWN_PATH}?token=t` },
        { ref: ownRef('legacy.jpg'), status: 'unavailable', url: null },
      ])
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('signs a whole photo history in one Storage request when batch signing is available', async () => {
    const paths = Array.from({ length: 12 }, (_, index) => `${OWNER}/kael-chat/model_vision/p${index}.jpg`)
    const client = makeSequenceClient([], {}, {
      kael_chat_media_upload_intents: [{
        data: paths.map((objectPath) => ({ object_path: objectPath, status: 'consumed', cleaned_at: null, delete_after: '2099-01-01T00:00:00.000Z' })),
        error: null,
      }],
    })
    const createSignedUrl = vi.fn()
    const createSignedUrls = vi.fn(async (batch: string[]) => ({
      data: batch.map((path) => ({ path, signedUrl: `https://storage.example.test/${path}?token=t`, error: null })),
      error: null,
    }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl, createSignedUrls })) } })
    const previews = await createKaelChatMediaPreviews(context(client), paths.map((path) => `supabase://kael-chat-media/${path}`), OWNER)
    expect(previews.every((preview) => preview.status === 'available')).toBe(true)
    expect(createSignedUrls, pillarWhy(PILLAR, 'a long history must not fan out one signing request per photo')).toHaveBeenCalledTimes(1)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})
