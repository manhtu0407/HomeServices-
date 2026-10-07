import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { stableImageSource } from '../stable-image-source'
import { requestBodyBytes, uploadDeadlineMs } from '../upload-deadline'

export const PILLAR = {
  id: 'P332-cellular-media',
  invariant: 'a re-signed Supabase URL keeps the same image cache key while a new upload gets a new one, and an upload deadline grows with its bytes at a slow-3G rate between a 60 s floor and a 240 s cap',
  authority: [
    'governance/RULES.md #10 (every network call is bounded)',
    'supabase/functions/mobile-api/_shared/domains/worker/avatar.ts (each upload gets a random object path)',
  ],
  target: 'apps/mobile/lib/upload-deadline.ts',
  layer: 'unit',
  siblings: ['P290-storage-upload-content-type', 'P326-transport-connectivity'],
  mutation: 'key the image cache by the full signed URL, or return the 60 s floor for every size — the re-sign or the 3 MB case turns red',
} as const satisfies PillarManifest

const base = 'https://project.supabase.co/storage/v1/object/sign/customer-avatars/customer-1/3f2a.jpg'

describe('cellular media', () => {
  it('keeps one cache key across re-signed URLs of the same object', () => {
    const first = stableImageSource(`${base}?token=aaa`)
    const resigned = stableImageSource(`${base}?token=bbb`)
    const replaced = stableImageSource('https://project.supabase.co/storage/v1/object/sign/customer-avatars/customer-1/9c1d.jpg?token=aaa')

    withPillarContext(PILLAR, () => {
      expect(first.cacheKey).toBe('supabase-object:customer-avatars/customer-1/3f2a.jpg')
      expect(resigned.cacheKey).toBe(first.cacheKey)
      expect(replaced.cacheKey).not.toBe(first.cacheKey)
      expect(resigned.uri).toBe(`${base}?token=bbb`)
    }, 'a fresh token must not force a second download of the same picture')
  })

  it('leaves non-Supabase and local URIs to the default cache', () => {
    withPillarContext(PILLAR, () => {
      expect(stableImageSource('file:///cache/photo.jpg')).toEqual({ uri: 'file:///cache/photo.jpg' })
      expect(stableImageSource('https://example.com/a.png')).toEqual({ uri: 'https://example.com/a.png' })
    })
  })

  it('scales the upload deadline with the file size inside fixed bounds', () => {
    withPillarContext(PILLAR, () => {
      expect(uploadDeadlineMs(undefined)).toBe(60_000)
      expect(uploadDeadlineMs(500_000)).toBe(60_000)
      expect(uploadDeadlineMs(3_000_000)).toBe(77_500)
      expect(uploadDeadlineMs(50 * 1024 * 1024)).toBe(240_000)
      expect(uploadDeadlineMs(Number.NaN)).toBe(60_000)
    }, '3 MB at 48 KB/s plus the handshake is 77.5 s; nothing is unbounded')
  })

  it('measures binary request bodies', () => {
    withPillarContext(PILLAR, () => {
      expect(requestBodyBytes(new Uint8Array(1234))).toBe(1234)
      expect(requestBodyBytes(new ArrayBuffer(10))).toBe(10)
      expect(requestBodyBytes(undefined)).toBeNull()
    })
  })
})
