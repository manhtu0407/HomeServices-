import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createKaelChatMediaUpload } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/media-upload'
import { matchCaseWorkResourceRoute } from '../../../../../../supabase/functions/mobile-api/_shared/http/routes/case-work-resource-routes'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P295-worker-kael-general-chat-photo-boundary',
  invariant: 'a worker may reserve only a model_vision photo in their own Kael chat media folder, and the general-turn claim accepts at most five refs from that folder while every other worker chat mode still refuses job-less media',
  authority: ['governance/RULES.md #6-#7 (server-side vision, trusted media refs only)', 'governance/RULES.md Multimodal Evidence Privacy'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/media-upload.ts',
  layer: 'security-negative',
  siblings: ['P294-worker-kael-general-chat-photo', 'P247-kael-chat-media-retention-read', 'P291-kael-vision-image-privacy'],
  mutation: 'drop the worker purpose guard, widen the claim ref pattern past the worker id, or remove the five-ref cap — the purpose, prefix or cap assertion turns red',
} as const satisfies PillarManifest

const WORKER = 'e2950000-0000-4000-8000-000000000003'
const root = resolve(__dirname, '../../../../../..')

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return { success: true, user: { id: WORKER }, role: 'worker', supabase: client, privilegedSupabase: client }
}

function clientWithStorage(reserve: { data: unknown; error: null }) {
  const client = makeSequenceClient([], { reserve_kael_chat_media_upload: [reserve] })
  const createSignedUploadUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example.test/${path}`, token: 'token' }, error: null }))
  Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } })
  return { client, createSignedUploadUrl }
}

function generalClaimMigration() {
  const file = readdirSync(resolve(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('_worker_kael_general_chat_images.sql'))
    .sort()
    .at(-1)
  if (!file) throw new Error('worker general chat image migration is missing')
  return readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')
}

describe('worker Kael general chat photo boundary', () => {
  it('lets a worker reach the Kael chat media upload route', () => {
    const route = matchCaseWorkResourceRoute('/kael/chat/media-upload', 'POST', (value) => value)
    expect(route?.roles, pillarWhy(PILLAR, 'the worker camera needs an upload route')).toContain('worker')
  })

  it('refuses a worker private video original before any reservation or storage call', async () => {
    const { client, createSignedUploadUrl } = clientWithStorage({ data: [{ allowed: true }], error: null })
    await expect(
      createKaelChatMediaUpload(workerContext(client), {
        file_name: 'clip.mp4',
        file_size_bytes: 1_000,
        mime_type: 'video/mp4',
        purpose: 'private_video_original',
      } as never),
      pillarWhy(PILLAR, 'private video originals are customer evidence only'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA', status: 400 })
    expect(client.calls, pillarWhy(PILLAR, 'a refused upload must not reserve quota')).toEqual([])
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('reserves a worker photo inside the worker own model_vision folder', async () => {
    const { client } = clientWithStorage({ data: [{ allowed: true }], error: null })
    const upload = await createKaelChatMediaUpload(workerContext(client), {
      file_name: 'socket.jpg',
      file_size_bytes: 1_000,
      mime_type: 'image/jpeg',
      purpose: 'model_vision',
    } as never)
    expect(upload.media_ref, pillarWhy(PILLAR, 'the ref must sit in the prefix the general claim accepts'))
      .toMatch(new RegExp(`^supabase://kael-chat-media/${WORKER}/kael-chat/model_vision/[^/]+$`))
  })

  it('bounds the general-turn claim to five photos from the worker own folder', () => {
    const sql = generalClaimMigration()
    withinClaim(sql, (claim) => {
      expect(claim, pillarWhy(PILLAR, 'refs outside the worker folder must be refused'))
        .toMatch(/'\^supabase:\/\/kael-chat-media\/' \|\| p_worker_id::text\s*\|\| '\/kael-chat\/model_vision\/\[\^\[:space:\]\?#\/\]\+\$'/)
      expect(claim, pillarWhy(PILLAR, 'path traversal must be refused')).toContain(`'%..%'`)
      expect(claim, pillarWhy(PILLAR, 'at most five photos per turn')).toMatch(/>\s*5\b/)
      expect(claim, pillarWhy(PILLAR, 'only a photo_attached turn may carry media')).toContain('photo_attached')
    })
    expect(sql, pillarWhy(PILLAR, 'the claim stays callable by the Edge service role only')).toMatch(/grant execute on function public\.claim_worker_kael_general_turn_atomic\([^)]*\)\s*to service_role/)
  })
})

function withinClaim(sql: string, assert: (claim: string) => void) {
  const start = sql.indexOf('function public.claim_worker_kael_general_turn_atomic')
  expect(start, pillarWhy(PILLAR, 'the migration must redefine the general-turn claim')).toBeGreaterThanOrEqual(0)
  assert(sql.slice(start))
}
