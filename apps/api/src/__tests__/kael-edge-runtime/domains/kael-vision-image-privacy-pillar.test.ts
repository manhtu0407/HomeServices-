import { afterEach, describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import {
  createSignedCaseWorkEvidenceUrls,
  createSignedVisionUrls,
  inspectTrustedKaelVisionImage,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision'
import { prepareWorkerKaelVisionUrls } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-media'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P291-kael-vision-image-privacy',
  invariant: 'a model-vision image is signed as the stored original (no Storage transform, which the Free plan refuses) and reaches the model only after the server has read its metadata and found no location (EXIF GPS IFD, XMP GPS, or WebP EXIF/XMP)',
  authority: ['governance/RULES.md Multimodal Evidence Privacy (minimum image content reaches vision analysis)', 'Supabase docs: Storage image transformations are enabled for Pro plan and above'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/media-vision.ts',
  layer: 'security-negative',
  siblings: ['P247-kael-chat-media-retention-read', 'P290-storage-upload-content-type'],
  mutation: 'drop the location scan from inspectTrustedKaelVisionImage, or sign with a transform option again — the GPS cases or the no-transform cases turn red',
} as const satisfies PillarManifest

const CUSTOMER = 'e2460000-0000-4000-8000-000000000002'
const JOB = 'e2460000-0000-4000-8000-00000000a001'
const OBJECT_PATH = `${CUSTOMER}/kael-chat/model_vision/photo.jpg`
const MEDIA_REF = `supabase://kael-chat-media/${OBJECT_PATH}`
const VISION_EVIDENCE = [{ kind: 'photo', ref: MEDIA_REF, model_eligible: true }] as Parameters<typeof createSignedVisionUrls>[1]
const RETAINED_INTENT = { object_path: OBJECT_PATH, status: 'consumed', cleaned_at: null, delete_after: '2099-01-01T00:00:00.000Z' }

const ascii = (value: string) => [...new TextEncoder().encode(value)]
const u16be = (value: number) => [(value >> 8) & 0xff, value & 0xff]
const u32be = (value: number) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]

// Little-endian TIFF with a single IFD0 entry.
function tiff(tag: number, type: number, value: number) {
  return [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, tag & 0xff, tag >> 8, type, 0x00, 0x01, 0x00, 0x00, 0x00, value & 0xff, (value >> 8) & 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
}
const GPS_TIFF = tiff(0x8825, 4, 26)
const ORIENTATION_TIFF = tiff(0x0112, 3, 1)

function jpegSegment(marker: number, payload: number[]) {
  return [0xff, marker, ...u16be(payload.length + 2), ...payload]
}
function jpeg(...segments: number[][]) {
  const jfif = jpegSegment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const scan = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]
  return new Uint8Array([0xff, 0xd8, ...jfif, ...segments.flat(), ...scan])
}
const exifSegment = (body: number[]) => jpegSegment(0xe1, [...ascii('Exif'), 0, 0, ...body])
const xmpSegment = (xml: string) => jpegSegment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii(xml)])

function pngChunk(type: string, data: number[]) {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
}
function png(...chunks: number[][]) {
  const header = pngChunk('IHDR', [...u32be(1), ...u32be(1), 8, 2, 0, 0, 0])
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...header, ...chunks.flat(), ...pngChunk('IDAT', [0x78, 0x9c]), ...pngChunk('IEND', [])])
}

function webp(chunkType: 'VP8 ' | 'VP8X', flags = 0) {
  const chunk = chunkType === 'VP8X'
    ? [...ascii('VP8X'), 10, 0, 0, 0, flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    : [...ascii('VP8 '), 4, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x00]
  return new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...chunk])
}

function stubImage(bytes: Uint8Array, contentType: string) {
  const fetchSpy = vi.fn(async () => new Response(bytes.buffer as ArrayBuffer, {
    headers: { 'content-length': String(bytes.byteLength), 'content-type': contentType },
    status: 200,
  }))
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

afterEach(() => vi.unstubAllGlobals())

describe('Kael model-vision image privacy without Storage transforms', () => {
  it.each([
    ['a JPEG with an EXIF GPS IFD', jpeg(exifSegment(GPS_TIFF)), 'image/jpeg'],
    ['a JPEG with GPS in XMP', jpeg(xmpSegment('<x:xmpmeta><rdf:Description exif:GPSLatitude="10,46.5N"/></x:xmpmeta>')), 'image/jpeg'],
    ['a PNG with an eXIf GPS IFD', png(pngChunk('eXIf', GPS_TIFF)), 'image/png'],
    ['a WebP that declares EXIF metadata', webp('VP8X', 0x08), 'image/webp'],
    ['a JPEG whose scan never starts', new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'],
  ])('refuses %s', async (_label, bytes, contentType) => {
    stubImage(bytes, contentType)
    await expect(
      inspectTrustedKaelVisionImage('https://storage.example.test/object'),
      pillarWhy(PILLAR, `location metadata or an unreadable image must never reach the model: ${_label}`),
    ).resolves.toBe('invalid')
  })

  it.each([
    ['a re-encoded JPEG with only an orientation tag', jpeg(exifSegment(ORIENTATION_TIFF)), 'image/jpeg'],
    ['a plain JPEG', jpeg(), 'image/jpeg'],
    ['a PNG without metadata', png(), 'image/png'],
    ['a simple WebP', webp('VP8 '), 'image/webp'],
  ])('accepts %s', async (_label, bytes, contentType) => {
    stubImage(bytes, contentType)
    await expect(
      inspectTrustedKaelVisionImage('https://storage.example.test/object'),
      pillarWhy(PILLAR, `a clean image must stay analysable: ${_label}`),
    ).resolves.toBe('valid')
  })

  it('reads a bounded metadata prefix, not the whole object', async () => {
    const fetchSpy = stubImage(jpeg(), 'image/jpeg')
    await inspectTrustedKaelVisionImage('https://storage.example.test/object')
    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(new Headers(init.headers).get('range'), pillarWhy(PILLAR, 'metadata scan is range-bounded')).toBe('bytes=0-262143')
  })

  it('signs the Kael chat vision image without a Storage transform', async () => {
    const client = makeSequenceClient([], {}, { kael_chat_media_upload_intents: [{ data: [RETAINED_INTENT], error: null }] })
    const createSignedUrl = vi.fn(async (..._args: unknown[]) => ({ data: { signedUrl: 'https://storage.example.test/object' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })
    stubImage(jpeg(), 'image/jpeg')

    await expect(createSignedVisionUrls(context(client), VISION_EVIDENCE, CUSTOMER)).resolves.toEqual(['https://storage.example.test/object'])
    expect(createSignedUrl.mock.calls[0]?.[2], pillarWhy(PILLAR, 'Free plan refuses transformed URLs, so the model never saw the image')).toBeUndefined()
  })

  it('refuses a Kael chat image that still carries GPS', async () => {
    const client = makeSequenceClient([], {}, { kael_chat_media_upload_intents: [{ data: [RETAINED_INTENT], error: null }] })
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example.test/object' }, error: null }) })) } })
    stubImage(jpeg(exifSegment(GPS_TIFF)), 'image/jpeg')

    await expect(
      createSignedVisionUrls(context(client), VISION_EVIDENCE, CUSTOMER),
      pillarWhy(PILLAR, 'a photo with a location must not be sent to the model'),
    ).rejects.toMatchObject({ code: 'INVALID_MEDIA_CONTENT', status: 400 })
  })

  it('signs case-work evidence without a Storage transform', async () => {
    const client = makeSequenceClient([], {}, { kael_chat_media_upload_intents: [{ data: [RETAINED_INTENT], error: null }] })
    const createSignedUrl = vi.fn(async (..._args: unknown[]) => ({ data: { signedUrl: 'https://storage.example.test/object' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })

    await createSignedCaseWorkEvidenceUrls(context(client), [MEDIA_REF], CUSTOMER)
    expect(createSignedUrl.mock.calls[0]?.[2], pillarWhy(PILLAR, 'case-work evidence is signed as the stored original')).toBeUndefined()
  })

  it('signs worker Kael job media without a Storage transform', async () => {
    const objectPath = `${JOB}/kael_reference/photo.jpg`
    const client = makeSequenceClient([], {}, {
      job_media_assets: [{ data: [{ job_id: JOB, owner_id: CUSTOMER, bucket_id: 'job-media', stage: 'kael_reference', object_path: objectPath, mime_type: 'image/jpeg' }], error: null }],
    })
    const createSignedUrl = vi.fn(async (..._args: unknown[]) => ({ data: { signedUrl: 'https://storage.example.test/object' }, error: null }))
    Object.assign(client, { storage: { from: vi.fn(() => ({ createSignedUrl })) } })
    stubImage(jpeg(), 'image/jpeg')

    await expect(prepareWorkerKaelVisionUrls(context(client), client as never, JOB, [`supabase://job-media/${objectPath}`]))
      .resolves.toEqual(['https://storage.example.test/object'])
    expect(createSignedUrl.mock.calls[0]?.[2], pillarWhy(PILLAR, 'worker job media is signed as the stored original')).toBeUndefined()
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
