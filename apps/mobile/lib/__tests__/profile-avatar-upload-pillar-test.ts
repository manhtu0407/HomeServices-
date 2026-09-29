import { createClient } from '@supabase/supabase-js'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P289-profile-avatar-upload-content-type',
  invariant: 'a profile avatar reaches Storage as a raw body whose content-type is the image MIME type, never as multipart form data whose file part carries no type (Storage reads that as text/plain and refuses it with InvalidMimeType)',
  authority: ['supabase/migrations avatar buckets allow image/jpeg, image/png and image/webp only', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/profile-avatar-upload.ts',
  layer: 'integration',
  siblings: ['P248-worker-presence-release-client-only'],
  mutation: 'pass the Blob from response.blob() to uploadToSignedUrl again — storage-js wraps it in FormData and the content-type case turns red',
} as const satisfies PillarManifest

type CapturedRequest = { body: unknown; headers: Headers; method: string; url: string }

const captured: CapturedRequest[] = []

jest.mock('../supabase', () => {
  const { createClient: create } = jest.requireActual('@supabase/supabase-js') as { createClient: typeof createClient }
  return {
    supabase: create('https://project.example.test', 'publishable-test-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          captured.push({
            body: init?.body,
            headers: new Headers(init?.headers),
            method: init?.method ?? 'GET',
            url: String(input),
          })
          return new Response(JSON.stringify({ Key: 'worker-avatars/worker-1/avatar.jpg' }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          })
        },
      },
    }),
  }
})

import { uploadProfileAvatar } from '../profile-avatar-upload'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])

// iOS hands back a file:// read whose Blob has an empty type.
function localFileResponse() {
  return {
    arrayBuffer: async () => JPEG_BYTES.slice().buffer,
    blob: async () => new Blob([JPEG_BYTES]),
    ok: true,
  } as unknown as Response
}

describe('profile avatar upload to Storage', () => {
  const service = {
    createAvatarUpload: jest.fn(async () => ({
      data: {
        avatar_ref: 'supabase://worker-avatars/worker-1/avatar.jpg',
        bucket_id: 'worker-avatars' as const,
        object_path: 'worker-1/avatar.jpg',
        token: 'signed-upload-token',
      },
      status: 201,
      success: true as const,
    })),
    updateAvatar: jest.fn(async () => ({
      data: { avatar_url: 'https://project.example.test/read/avatar.jpg' },
      status: 200,
      success: true as const,
    })),
  }

  beforeEach(() => {
    captured.length = 0
    jest.clearAllMocks()
    jest.spyOn(global, 'fetch').mockResolvedValue(localFileResponse())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends the image bytes with the image content-type, not an untyped multipart part', async () => {
    const result = await uploadProfileAvatar({
      fileName: 'IMG_0001.JPG',
      mimeType: 'image/jpeg',
      uri: 'file:///var/mobile/avatar.jpg',
    }, service)

    const upload = captured.find((request) => request.url.includes('/object/upload/sign/'))

    withPillarContext(
      PILLAR,
      () => {
        expect(result).toMatchObject({ success: true })
        expect(upload).toBeDefined()
        expect(upload?.method).toBe('PUT')
        expect(upload?.url).toContain('/storage/v1/object/upload/sign/worker-avatars/worker-1/avatar.jpg?token=signed-upload-token')
        expect(upload?.body).not.toBeInstanceOf(FormData)
        expect(upload?.headers.get('content-type')).toBe('image/jpeg')
        expect(new Uint8Array(upload?.body as ArrayBuffer)).toEqual(JPEG_BYTES)
      },
      'Production Storage refused every avatar from TestFlight build 46 with "mime type text/plain is not supported": a Blob body is sent as multipart and its file part has no type',
    )
  })

  it('reports the real file size to the upload intent and confirms only after Storage accepts', async () => {
    await uploadProfileAvatar({
      fileName: 'IMG_0001.JPG',
      mimeType: 'image/jpeg',
      uri: 'file:///var/mobile/avatar.jpg',
    }, service)

    withPillarContext(
      PILLAR,
      () => {
        expect(service.createAvatarUpload).toHaveBeenCalledWith({
          file_name: 'IMG_0001.jpg',
          file_size_bytes: JPEG_BYTES.byteLength,
          mime_type: 'image/jpeg',
        })
        expect(service.updateAvatar).toHaveBeenCalledWith({ avatar_ref: 'supabase://worker-avatars/worker-1/avatar.jpg' })
      },
      'the upload intent must carry the byte length Storage will receive',
    )
  })
})
