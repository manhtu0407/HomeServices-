const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockUpload = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockUploadToSignedUrl = jest.fn()
const mockRemove = jest.fn()
const mockCreateMediaUpload = jest.fn()
const mockGetThumbnailAsync = jest.fn()

jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: (...args: unknown[]) => mockGetThumbnailAsync(...args),
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    storage: {
      from: (...args: unknown[]) => mockFrom(...args),
    },
  },
}))

jest.mock('../services', () => ({
  jobService: {
    attachJobMedia: jest.fn(),
  },
  kaelChatService: {
    createMediaUpload: (...args: unknown[]) => mockCreateMediaUpload(...args),
  },
}))

import { uploadJobMediaDrafts, uploadKaelChatMediaDrafts } from '../media-upload'

const mockFetch = jest.fn()

describe('Kael chat media upload', () => {
  beforeAll(() => {
    global.fetch = mockFetch as typeof fetch
  })

  beforeEach(() => {
    mockGetUser.mockReset()
    mockFrom.mockReset()
    mockUpload.mockReset()
    mockCreateSignedUrl.mockReset()
    mockUploadToSignedUrl.mockReset()
    mockRemove.mockReset()
    mockCreateMediaUpload.mockReset()
    mockGetThumbnailAsync.mockReset()
    mockFetch.mockReset()

    mockGetUser.mockResolvedValue({ data: { user: { id: 'customer_test_1' } }, error: null })
    mockFrom.mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
      upload: mockUpload,
      uploadToSignedUrl: mockUploadToSignedUrl,
      remove: mockRemove,
    })
    mockUpload.mockResolvedValue({ error: null })
    mockUploadToSignedUrl.mockResolvedValue({ error: null })
    mockRemove.mockResolvedValue({ error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/evidence' }, error: null })
    mockCreateMediaUpload.mockImplementation(async (input: { purpose: string }) => {
      const ordinal = mockCreateMediaUpload.mock.calls.length
      const objectPath = `customer_test_1/kael-chat/${input.purpose}/upload-${ordinal}.jpg`
      return {
        success: true,
        data: {
          bucket_id: 'kael-chat-media',
          object_path: objectPath,
          media_ref: `supabase://kael-chat-media/${objectPath}`,
          token: `signed-token-${ordinal}`,
          signed_upload_url: 'https://storage.example.test/upload',
          expires_in_seconds: 7200,
        },
      }
    })
    mockFetch.mockResolvedValue({
      blob: async () => ({ size: 42 }),
      ok: true,
    })
    mockGetThumbnailAsync.mockImplementation(async (_uri: string, options: { time: number }) => ({
      height: 720,
      uri: `file:///frame-${options.time}.jpg`,
      width: 1280,
    }))
  })

  it('normalizes jpeg aliases before uploading evidence', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'pipe.jpg',
        mimeType: 'image/jpg',
        type: 'image',
        uri: 'file:///pipe.jpg',
      },
    ])

    expect(result.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('kael-chat-media')
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      file_name: 'pipe.jpg',
      mime_type: 'image/jpeg',
      purpose: 'model_vision',
    }))
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'customer_test_1/kael-chat/model_vision/upload-1.jpg',
      'signed-token-1',
      expect.anything(),
      expect.objectContaining({
        contentType: 'image/jpeg',
        upsert: false,
      }),
    )
  })

  it('fails closed when a non-compatible HEIC reaches the upload helper', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'sink.heic',
        mimeType: 'application/octet-stream',
        type: 'image',
        uri: 'file:///sink.heic',
      },
    ])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('UNSUPPORTED_MEDIA')
    expect(mockCreateMediaUpload).not.toHaveBeenCalled()
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects a zero-byte draft before reserving an upload intent', async () => {
    const longName = `${'ten-file-rat-dai-'.repeat(20)}.jpg?cache=1`
    mockFetch.mockResolvedValueOnce({
      blob: async () => ({ size: 0 }),
      ok: true,
    })

    const result = await uploadKaelChatMediaDrafts([
      {
        fileSizeBytes: 0,
        type: 'image',
        uri: `blob:http://localhost:8081/${longName}`,
      },
    ])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('MEDIA_READ_FAILED')
    expect(mockCreateMediaUpload).not.toHaveBeenCalled()
  })

  it('fails closed before reading or uploading raw voice audio', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'voice-note.m4a',
        mimeType: 'audio/x-m4a',
        type: 'audio',
        uri: 'file:///voice-note.m4a',
      },
    ])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('RAW_AUDIO_PRIVATE')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockCreateMediaUpload).not.toHaveBeenCalled()
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled()
  })

  it.each([
    'before',
    'after',
    'kael_reference',
    'cancellation_evidence',
    'scope_change_evidence',
    'access_check_in',
  ] as const)(
    'keeps raw voice audio on-device for the %s job-media analysis stage',
    async (stage) => {
      const result = await uploadJobMediaDrafts('job-1', [{
        fileName: 'voice-note.m4a',
        mimeType: 'audio/m4a',
        type: 'audio',
        uri: 'file:///voice-note.m4a',
      }], stage)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('RAW_AUDIO_PRIVATE')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockUpload).not.toHaveBeenCalled()
    },
  )

  it('keeps kael-chat-media uploads behind the Edge signed-upload route', async () => {
    mockCreateMediaUpload.mockResolvedValueOnce({
      success: false,
      code: 'VALIDATION',
      status: 400,
      error: 'Dữ liệu không hợp lệ',
    })
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://storage.example.test/signed-read-url' },
      error: null,
    })

    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'pipe.jpg',
        mimeType: 'image/jpeg',
        type: 'image',
        uri: 'file:///pipe.jpg',
      },
    ])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION')
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('keeps the original video private and exposes only three local frames to model analysis', async () => {
    const result = await uploadKaelChatMediaDrafts([{
      durationMillis: 10_000,
      fileName: 'air-conditioner.mp4',
      mimeType: 'video/mp4',
      type: 'video',
      uri: 'file:///air-conditioner.mp4',
    }])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(mockGetThumbnailAsync).toHaveBeenCalledTimes(3)
    expect(mockGetThumbnailAsync.mock.calls.map((call) => call[1].time)).toEqual([2_000, 5_000, 8_000])
    expect(result.evidenceItems.map((item) => item.kind)).toEqual([
      'video_frame',
      'video_frame',
      'video_frame',
      'video_original_private',
    ])
    expect(result.evidenceItems[3]).toMatchObject({ model_eligible: false })
    expect(mockCreateMediaUpload.mock.calls.map((call) => call[0].purpose)).toEqual([
      'model_vision',
      'model_vision',
      'model_vision',
      'private_video_original',
    ])
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
    expect(result.urls).toEqual([])
  })

  it('reserves a model slot for every selected photo before adding extra video frames', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        durationMillis: 8_000,
        fileName: 'room.mp4',
        mimeType: 'video/mp4',
        type: 'video',
        uri: 'file:///room.mp4',
      },
      ...[1, 2, 3].map((index) => ({
        fileName: `photo-${index}.jpg`,
        mimeType: 'image/jpeg',
        type: 'image' as const,
        uri: `file:///photo-${index}.jpg`,
      })),
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.evidenceItems.map((item) => item.kind)).toEqual([
      'video_frame',
      'video_frame',
      'photo',
      'photo',
      'photo',
      'video_original_private',
    ])
    expect(mockCreateMediaUpload.mock.calls.map((call) => call[0].purpose)).toEqual([
      'model_vision',
      'model_vision',
      'model_vision',
      'model_vision',
      'model_vision',
      'private_video_original',
    ])
  })

  it('extracts every required frame before issuing any upload intent', async () => {
    mockGetThumbnailAsync.mockRejectedValueOnce(new Error('decoder unavailable'))

    const result = await uploadKaelChatMediaDrafts([{
      fileName: 'room.mp4',
      mimeType: 'video/mp4',
      type: 'video',
      uri: 'file:///room.mp4',
    }])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VIDEO_FRAME_EXTRACTION_UNAVAILABLE')
    expect(mockCreateMediaUpload).not.toHaveBeenCalled()
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('removes every successful object when a later upload fails', async () => {
    mockUploadToSignedUrl
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('upload failed') })

    const result = await uploadKaelChatMediaDrafts([
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
      { fileName: 'two.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///two.jpg' },
    ])

    expect(result.success).toBe(false)
    expect(mockRemove).toHaveBeenCalledWith([
      'customer_test_1/kael-chat/model_vision/upload-1.jpg',
    ])
  })
})
