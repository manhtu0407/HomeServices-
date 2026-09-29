import { renderHook, act } from '@testing-library/react-native'
import type { createClient } from '@supabase/supabase-js'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P290-storage-upload-content-type',
  invariant: 'every mobile upload to a private Storage bucket (job media, Kael chat media, discipline appeal and compensation evidence, worker verification) sends the file as a raw body whose content-type is the file MIME type, never as multipart whose file part has no type',
  authority: ['Production storage buckets restrict allowed_mime_types, and an untyped multipart part is read as text/plain (InvalidMimeType)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/lib/media-upload.ts',
  layer: 'integration',
  siblings: ['P289-profile-avatar-upload-content-type', 'P165-worker-verification-upload-deadline'],
  mutation: 'return a Blob from readLocalMediaBytes (or upload readResponseBlobBounded output) again — storage-js wraps it in FormData and every case turns red',
} as const satisfies PillarManifest

type CapturedRequest = { body: unknown; headers: Headers; method: string; url: string }

const captured: CapturedRequest[] = []

jest.mock('../supabase', () => {
  const { createClient: create } = jest.requireActual('@supabase/supabase-js') as { createClient: typeof createClient }
  const client = create('https://project.example.test', 'publishable-test-key', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({
          body: init?.body,
          headers: new Headers(init?.headers),
          method: init?.method ?? 'GET',
          url: String(input),
        })
        return new Response(JSON.stringify({ Id: 'object-id', Key: 'bucket/object' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      },
    },
  })
  Object.assign(client.auth, {
    getUser: async () => ({ data: { user: { id: 'worker-1' } }, error: null }),
  })
  return { supabase: client }
})

jest.mock('../services', () => ({
  jobService: {
    attachJobMedia: jest.fn(async () => ({ success: true, data: { media: [{ storage_ref: 'supabase://job-media/job-1/before/photo.jpg' }] } })),
    createJobMediaUpload: jest.fn(async () => ({ success: true, data: { object_path: 'job-1/before/photo.jpg', token: 'job-token' } })),
    revokeJobMediaUploads: jest.fn(async () => ({ success: true, data: {} })),
  },
  kaelChatService: {
    createMediaUpload: jest.fn(async () => ({
      success: true,
      data: { media_ref: 'supabase://kael-chat-media/user-1/photo.jpg', object_path: 'user-1/photo.jpg', token: 'kael-token' },
    })),
    revokeMedia: jest.fn(async () => ({ success: true, data: { deletion_pending: false } })),
  },
}))

jest.mock('../services/compensation-service', () => ({
  compensationService: {
    createEvidenceUpload: jest.fn(async () => ({ success: true, data: { path: 'case-1/claim.jpg', token: 'claim-token' } })),
  },
}))

jest.mock('../services/discipline-service', () => ({
  disciplineService: {
    createAppealUpload: jest.fn(async () => ({ success: true, data: { path: 'case-1/appeal.jpg', token: 'appeal-token' } })),
    listWorkerViolations: jest.fn(async () => ({ success: true, data: { cases: [], policy: null } })),
    submitAppeal: jest.fn(async () => ({ success: true, data: { id: 'case-1' } })),
  },
}))

const mockResize = jest.fn()
const mockManipulate = jest.fn((source: unknown) => {
  const image = typeof source === 'string'
    ? { height: 3024, width: 4032 }
    : { height: 1200, width: 1600 }
  const context = {
    renderAsync: async () => ({
      ...image,
      saveAsync: async () => ({ ...image, uri: 'file:///cache/reencoded.jpg' }),
    }),
    resize: (size: unknown) => {
      mockResize(size)
      return context
    },
  }
  return context
})

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (source: unknown) => mockManipulate(source) },
}))

jest.mock('../auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'access-token' } }),
}))

import { uploadCompensationPhotos } from '../frontend-workflow/compensation-evidence'
import { useWorkerViolations } from '../frontend-workflow/use-worker-violations'
import { uploadJobMediaDrafts, uploadKaelChatMediaDrafts } from '../media-upload'
import { uploadWorkerVerificationDrafts } from '../worker-verification-upload'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])

// iOS Expo fetch answers a file:// read with no headers, so any Blob built from it has no type.
function localFileResponse() {
  return {
    arrayBuffer: async () => JPEG_BYTES.slice().buffer,
    blob: async () => new Blob([JPEG_BYTES]),
    body: null,
    headers: new Headers(),
    ok: true,
  } as unknown as Response
}

function storageUploads() {
  return captured.filter((request) => request.url.includes('/storage/v1/object/') && request.method !== 'GET' && !request.url.includes('/object/sign/'))
}

function expectRawImageUpload(pathFragment: string, reason: string) {
  const uploads = storageUploads()
  withPillarContext(
    PILLAR,
    () => {
      expect(uploads.length).toBeGreaterThan(0)
      for (const upload of uploads) {
        expect(upload.url).toContain(pathFragment)
        expect(upload.body).not.toBeInstanceOf(FormData)
        expect(upload.headers.get('content-type')).toBe('image/jpeg')
        expect(new Uint8Array(upload.body as ArrayBufferLike)).toEqual(JPEG_BYTES)
      }
    },
    reason,
  )
}

const photo = { fileName: 'IMG_0001.JPG', mimeType: 'image/jpeg', type: 'image' as const, uri: 'file:///var/mobile/photo.jpg' }

describe('mobile uploads to private Storage buckets', () => {
  beforeEach(() => {
    captured.length = 0
    mockResize.mockClear()
    mockManipulate.mockClear()
    jest.spyOn(global, 'fetch').mockImplementation(async () => localFileResponse())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('job evidence photos reach job-media as typed raw bytes', async () => {
    const result = await uploadJobMediaDrafts('job-1', [photo], 'before')
    expect(result).toMatchObject({ success: true })
    expectRawImageUpload('/object/upload/sign/job-media/job-1/before/photo.jpg', 'job evidence is on the path to the first transaction; an untyped multipart part is refused as text/plain')
  })

  it('Kael chat photos reach kael-chat-media as typed raw bytes', async () => {
    const result = await uploadKaelChatMediaDrafts([photo])
    expect(result).toMatchObject({ success: true })
    expectRawImageUpload('/object/upload/sign/kael-chat-media/user-1/photo.jpg', 'Kael photo evidence must reach Storage with its image type')
  })

  it('re-encodes a Kael chat photo on the device before upload, capped at 1600px', async () => {
    await uploadKaelChatMediaDrafts([{ ...photo, fileName: 'IMG_0001.HEIC', mimeType: 'image/heic' }])
    const readUris = (global.fetch as jest.Mock).mock.calls.map(([uri]) => String(uri))
    withPillarContext(
      PILLAR,
      () => {
        expect(mockManipulate).toHaveBeenCalledWith(photo.uri)
        expect(mockResize).toHaveBeenCalledWith({ width: 1600 })
        expect(readUris).toEqual(['file:///cache/reencoded.jpg'])
        expect(storageUploads()).toHaveLength(1)
      },
      'the original photo (with its EXIF location, full size, maybe HEIC) must never be the bytes that reach Storage for the model',
    )
  })

  it('re-encodes a worker Kael reference photo but leaves other job evidence untouched', async () => {
    await uploadJobMediaDrafts('job-1', [photo], 'kael_reference')
    await uploadJobMediaDrafts('job-1', [photo], 'before')
    const readUris = (global.fetch as jest.Mock).mock.calls.map(([uri]) => String(uri))
    withPillarContext(
      PILLAR,
      () => {
        expect(readUris).toEqual(['file:///cache/reencoded.jpg', photo.uri])
      },
      'only images a vision model will see are re-encoded',
    )
  })

  it('uploads nothing when the photo cannot be re-encoded', async () => {
    mockManipulate.mockImplementationOnce(() => {
      throw new Error('decode failed')
    })
    const result = await uploadKaelChatMediaDrafts([photo])
    withPillarContext(
      PILLAR,
      () => {
        expect(result).toMatchObject({ success: false, code: 'MEDIA_READ_FAILED' })
        expect(storageUploads()).toHaveLength(0)
      },
      'a photo that cannot be cleaned must not be uploaded as-is',
    )
  })

  it('compensation claim photos reach discipline-evidence as typed raw bytes', async () => {
    const result = await uploadCompensationPhotos('case-1', [{ mimeType: 'image/jpeg', uri: photo.uri }], 'access-token')
    expect(result).toMatchObject({ success: true })
    expectRawImageUpload('/object/upload/sign/discipline-evidence/case-1/claim.jpg', 'compensation evidence must reach Storage with its image type')
  })

  it('discipline appeal photos reach discipline-evidence as typed raw bytes', async () => {
    const { result } = renderHook(() => useWorkerViolations())
    await act(async () => {
      await result.current.submitAppeal('case-1', 'Lý do kháng nghị', [{ mimeType: 'image/jpeg', uri: photo.uri }])
    })
    expectRawImageUpload('/object/upload/sign/discipline-evidence/case-1/appeal.jpg', 'appeal evidence must reach Storage with its image type')
  })

  it('reads a streamed local file without building a Blob from bytes, which React Native refuses', async () => {
    const NodeBlob = global.Blob
    class ReactNativeBlob extends NodeBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        if (parts?.some((part) => part instanceof ArrayBuffer || ArrayBuffer.isView(part))) {
          throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported")
        }
        super(parts, options)
      }
    }
    global.Blob = ReactNativeBlob as typeof Blob
    jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(JPEG_BYTES.slice())
          controller.close()
        },
      }),
      headers: new Headers(),
      ok: true,
    }) as unknown as Response)
    try {
      const result = await uploadKaelChatMediaDrafts([photo])
      withPillarContext(
        PILLAR,
        () => {
          expect(result).toMatchObject({ success: true })
          expect(new Uint8Array(storageUploads()[0]?.body as ArrayBufferLike)).toEqual(JPEG_BYTES)
        },
        'TestFlight build 46 Kael chat showed "Không thể đọc media đã chọn": new Blob([bytes]) throws on React Native, so every streamed read failed before upload',
      )
    } finally {
      global.Blob = NodeBlob
    }
  })

  it('worker verification documents reach worker-verification as typed raw bytes', async () => {
    const result = await uploadWorkerVerificationDrafts({ cccdFront: photo, cccdBack: photo, selfie: photo })
    expect(result).toMatchObject({ success: true })
    expectRawImageUpload('/object/worker-verification/worker-1/', 'worker identity documents must reach Storage with their image type')
  })
})
