const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockUpload = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockUploadToSignedUrl = jest.fn()
const mockRemove = jest.fn()
const mockAttachJobMedia = jest.fn()
const mockCreateJobMediaUpload = jest.fn()
const mockRevokeJobMediaUploads = jest.fn()
const mockCreateMediaUpload = jest.fn()
const mockRevokeMedia = jest.fn()
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
    attachJobMedia: (...args: unknown[]) => mockAttachJobMedia(...args),
    createJobMediaUpload: (...args: unknown[]) => mockCreateJobMediaUpload(...args),
    revokeJobMediaUploads: (...args: unknown[]) => mockRevokeJobMediaUploads(...args),
  },
  kaelChatService: {
    createMediaUpload: (...args: unknown[]) => mockCreateMediaUpload(...args),
    revokeMedia: (...args: unknown[]) => mockRevokeMedia(...args),
  },
}))

import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  cleanupKaelChatMediaRefs,
  uploadKaelChatMediaDrafts,
  uploadWorkerVerificationDrafts,
} from '../media-upload'

describe('localizeMediaUploadFailure', () => {
  it('uses code-owned copy instead of exposing a provider error', () => {
    const failure = {
      code: 'MEDIA_UPLOAD_FAILED',
      error: 'private storage provider detail 42',
    }

    expect(localizeMediaUploadFailure(failure, 'vi')).toBe(
      'Không thể tải media đã chọn lên. Vui lòng thử lại.',
    )
    expect(localizeMediaUploadFailure(failure, 'en')).toBe(
      'The selected media could not be uploaded. Please try again.',
    )
  })

  it('uses a safe localized fallback for an unknown code', () => {
    expect(localizeMediaUploadFailure({
      code: 'PRIVATE_PROVIDER_CODE',
      error: 'Lỗi nội bộ nhà cung cấp',
    }, 'en')).toBe('The selected media could not be processed. Please try again.')
  })
})

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
    mockAttachJobMedia.mockReset()
    mockCreateJobMediaUpload.mockReset()
    mockRevokeJobMediaUploads.mockReset()
    mockCreateMediaUpload.mockReset()
    mockRevokeMedia.mockReset()
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
    mockCreateJobMediaUpload.mockImplementation(async (jobId: string, input: { stage: string }) => {
      const ordinal = mockCreateJobMediaUpload.mock.calls.length
      const objectPath = `${jobId}/${input.stage}/reserved-${ordinal}.jpg`
      return {
        success: true,
        data: {
          bucket_id: 'job-media',
          expires_in_seconds: 7200,
          object_path: objectPath,
          signed_upload_url: 'https://storage.example.test/upload',
          storage_ref: `supabase://job-media/${objectPath}`,
          token: `job-signed-token-${ordinal}`,
        },
        status: 201,
      }
    })
    mockAttachJobMedia.mockImplementation(async (jobId: string, input: {
      assets: { object_path: string; stage: string }[]
    }) => ({
      success: true,
      data: {
        job_id: jobId,
        media: input.assets.map((asset) => ({
          bucket_id: 'job-media',
          object_path: asset.object_path,
          stage: asset.stage,
          storage_ref: `supabase://job-media/${asset.object_path}`,
        })),
        photo_urls: [],
      },
      status: 200,
    }))
    mockRevokeJobMediaUploads.mockResolvedValue({
      success: true,
      data: {
        deletion_pending: false,
        job_id: 'job-1',
        revoked_count: 1,
      },
      status: 200,
    })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/evidence' }, error: null })
    mockRevokeMedia.mockRejectedValue(new TypeError('legacy route unavailable'))
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

  afterEach(() => {
    jest.useRealTimers()
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

  it('uses the bytes read from disk instead of a stale declared Kael media size', async () => {
    const result = await uploadKaelChatMediaDrafts([{
      fileName: 'sink.jpg',
      fileSizeBytes: 1,
      mimeType: 'image/jpeg',
      type: 'image',
      uri: 'file:///sink.jpg',
    }])

    expect(result.success).toBe(true)
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      file_size_bytes: 42,
    }))
  })

  it('canonicalizes the Kael upload file extension from its declared MIME type', async () => {
    const result = await uploadKaelChatMediaDrafts([{
      fileName: 'sink.exe',
      mimeType: 'image/jpeg',
      type: 'image',
      uri: 'file:///sink.exe',
    }])

    expect(result.success).toBe(true)
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      file_name: 'sink.jpg',
    }))
  })

  it('attaches a deadline signal to local media reads', async () => {
    const result = await uploadKaelChatMediaDrafts([{
      fileName: 'sink.jpg',
      mimeType: 'image/jpeg',
      type: 'image',
      uri: 'file:///sink.jpg',
    }])

    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('file:///sink.jpg', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
  })

  it('cancels a rejected local media response body', async () => {
    const cancel = jest.fn(async () => undefined)
    mockFetch.mockResolvedValueOnce({ body: { cancel }, ok: false })

    const result = await uploadKaelChatMediaDrafts([{
      fileName: 'sink.jpg',
      mimeType: 'image/jpeg',
      type: 'image',
      uri: 'file:///sink.jpg',
    }])

    expect(result).toMatchObject({ success: false, code: 'MEDIA_READ_FAILED' })
    expect(cancel).toHaveBeenCalledTimes(1)
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

  it('rejects an oversized worker verification file before reading any selected document', async () => {
    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 10 * 1024 * 1024 + 1, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    })

    expect(result).toMatchObject({ success: false, code: 'MEDIA_TOO_LARGE' })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('returns a bounded failure when the worker auth lookup rejects', async () => {
    mockGetUser.mockRejectedValueOnce(new TypeError('connection reset'))

    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    })

    expect(result).toMatchObject({ success: false, code: 'AUTH_UNAVAILABLE' })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('canonicalizes worker verification object extensions from MIME types', async () => {
    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, fileName: 'front.exe', mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.exe' },
      cccdBack: { fileSizeBytes: 42, fileName: 'back.bin', mimeType: 'image/png', type: 'image', uri: 'file:///back.bin' },
      selfie: { fileSizeBytes: 42, fileName: 'selfie.dat', mimeType: 'image/webp', type: 'image', uri: 'file:///selfie.dat' },
    })

    expect(result.success).toBe(true)
    expect(mockUpload.mock.calls.map((call) => call[0])).toEqual([
      expect.stringMatching(/\/cccd-front\/[^/]+-front\.jpg$/),
      expect.stringMatching(/\/cccd-back\/[^/]+-back\.png$/),
      expect.stringMatching(/\/selfie\/[^/]+-selfie\.webp$/),
    ])
  })

  it('removes every ambiguous private verification path when a sibling upload fails', async () => {
    mockUpload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('upload failed') })
      .mockResolvedValueOnce({ error: null })

    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    })

    expect(result.success).toBe(false)
    expect(mockRemove).toHaveBeenCalledWith(mockUpload.mock.calls.map((call) => call[0]))
  })

  it('keeps the upload failure fail-closed when draft cleanup returns an error', async () => {
    mockUpload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('upload failed') })
      .mockResolvedValueOnce({ error: null })
    mockRemove.mockResolvedValueOnce({ error: new Error('cleanup unavailable') })

    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    })

    expect(result).toMatchObject({ success: false, code: 'MEDIA_UPLOAD_FAILED' })
    expect(mockRemove).toHaveBeenCalledTimes(1)
  })

  it('rejects an empty worker verification blob and removes every ambiguous path', async () => {
    mockFetch
      .mockResolvedValueOnce({ blob: async () => ({ size: 0 }), ok: true })
      .mockResolvedValueOnce({ blob: async () => ({ size: 42 }), ok: true })
      .mockResolvedValueOnce({ blob: async () => ({ size: 42 }), ok: true })

    const result = await uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    })

    expect(result).toMatchObject({ success: false, code: 'MEDIA_READ_FAILED' })
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(mockRemove).toHaveBeenCalledWith([
      expect.stringMatching(/\/cccd-front\/[^/]+-front\.jpg$/),
      mockUpload.mock.calls[0][0],
      mockUpload.mock.calls[1][0],
    ])
  })

  it('waits for the abortable Supabase storage deadline and cleans every ambiguous path', async () => {
    jest.useFakeTimers()
    mockUpload
      .mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('SUPABASE_REQUEST_TIMEOUT')), 65_000)
      }))
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    let result: Awaited<ReturnType<typeof uploadWorkerVerificationDrafts>> | undefined

    void uploadWorkerVerificationDrafts({
      cccdFront: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///front.jpg' },
      cccdBack: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///back.jpg' },
      selfie: { fileSizeBytes: 42, mimeType: 'image/jpeg', type: 'image', uri: 'file:///selfie.jpg' },
    }).then((value) => {
      result = value
    })
    for (let attempt = 0; attempt < 20 && mockUpload.mock.calls.length < 3; attempt += 1) {
      await Promise.resolve()
    }

    await jest.advanceTimersByTimeAsync(60_000)
    expect(result).toBeUndefined()

    await jest.advanceTimersByTimeAsync(5_000)
    expect(result).toMatchObject({ success: false, code: 'MEDIA_UPLOAD_FAILED' })
    expect(mockRemove).toHaveBeenCalledWith(mockUpload.mock.calls.map((call) => call[0]))
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

  it('requests a job-media intent and uploads with its signed token before attaching', async () => {
    const result = await uploadJobMediaDrafts('job-1', [{
      fileName: 'sink.jpg',
      fileSizeBytes: 999,
      mimeType: 'image/jpg',
      type: 'image',
      uri: 'file:///sink.jpg',
    }], 'before')

    expect(result).toEqual({
      success: true,
      mediaRefs: ['supabase://job-media/job-1/before/reserved-1.jpg'],
    })
    expect(mockCreateJobMediaUpload).toHaveBeenCalledWith('job-1', {
      file_name: 'sink.jpg',
      file_size_bytes: 42,
      mime_type: 'image/jpeg',
      stage: 'before',
    })
    expect(mockFrom).toHaveBeenCalledWith('job-media')
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'job-1/before/reserved-1.jpg',
      'job-signed-token-1',
      expect.anything(),
      { contentType: 'image/jpeg', upsert: false },
    )
    expect(mockAttachJobMedia).toHaveBeenCalledWith('job-1', {
      assets: [{
        file_size_bytes: 42,
        mime_type: 'image/jpeg',
        object_path: 'job-1/before/reserved-1.jpg',
        stage: 'before',
      }],
    })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects an oversized job-media draft before reading or reserving it', async () => {
    const result = await uploadJobMediaDrafts('job-1', [{
      fileName: 'oversized.mp4',
      fileSizeBytes: 26_214_401,
      mimeType: 'video/mp4',
      type: 'video',
      uri: 'file:///oversized.mp4',
    }])

    expect(result).toMatchObject({
      success: false,
      code: 'MEDIA_TOO_LARGE',
    })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockCreateJobMediaUpload).not.toHaveBeenCalled()
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('revokes every reserved path when a later signed upload fails', async () => {
    mockUploadToSignedUrl
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('upload failed') })

    const result = await uploadJobMediaDrafts('job-1', [
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
      { fileName: 'two.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///two.jpg' },
    ])

    expect(result.success).toBe(false)
    expect(mockRevokeJobMediaUploads).toHaveBeenCalledWith('job-1', {
      object_paths: [
        'job-1/before/reserved-1.jpg',
        'job-1/before/reserved-2.jpg',
      ],
    })
    expect(mockAttachJobMedia).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('bounds a stalled signed upload and revokes its reservation', async () => {
    jest.useFakeTimers()
    mockUploadToSignedUrl.mockReturnValueOnce(new Promise(() => undefined))
    let result: Awaited<ReturnType<typeof uploadJobMediaDrafts>> | undefined

    void uploadJobMediaDrafts('job-1', [
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
    ]).then((value) => {
      result = value
    })
    for (let attempt = 0; attempt < 10 && mockUploadToSignedUrl.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    await jest.advanceTimersByTimeAsync(60_000)

    expect(result).toMatchObject({
      success: false,
      code: 'MEDIA_UPLOAD_FAILED',
    })
    expect(mockRevokeJobMediaUploads).toHaveBeenCalledWith('job-1', {
      object_paths: ['job-1/before/reserved-1.jpg'],
    })
  })

  it('revokes uploaded paths after attach fails without direct Storage deletion', async () => {
    mockAttachJobMedia.mockResolvedValueOnce({
      success: false,
      code: 'MEDIA_INTENT_MISSING_OR_EXPIRED',
      error: 'Media đã hết hạn',
      status: 400,
    })
    mockRevokeJobMediaUploads.mockResolvedValueOnce({
      success: false,
      code: 'MEDIA_REVOKE_INVALID',
      error: 'Media không còn ở trạng thái có thể thu hồi',
      status: 400,
    })

    const result = await uploadJobMediaDrafts('job-1', [
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
      { fileName: 'two.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///two.jpg' },
    ])

    expect(result).toMatchObject({
      success: false,
      error: 'Media đã hết hạn',
    })
    expect(mockRevokeJobMediaUploads).toHaveBeenCalledWith('job-1', {
      object_paths: [
        'job-1/before/reserved-1.jpg',
        'job-1/before/reserved-2.jpg',
      ],
    })
    expect(mockRemove).not.toHaveBeenCalled()
  })

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
    expect(result.evidenceItems.slice(0, 3).map((item) => item.summary)).toEqual([
      'Video frame position: 00:02 / 00:10.',
      'Video frame position: 00:05 / 00:10.',
      'Video frame position: 00:08 / 00:10.',
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

  it('rolls back earlier Kael media when a later upload intent rejects', async () => {
    mockCreateMediaUpload
      .mockResolvedValueOnce({
        success: true,
        data: {
          bucket_id: 'kael-chat-media',
          object_path: 'customer_test_1/kael-chat/model_vision/upload-1.jpg',
          media_ref: 'supabase://kael-chat-media/customer_test_1/kael-chat/model_vision/upload-1.jpg',
          token: 'signed-token-1',
          signed_upload_url: 'https://storage.example.test/upload',
          expires_in_seconds: 7200,
        },
      })
      .mockRejectedValueOnce(new TypeError('connection reset'))

    const result = await uploadKaelChatMediaDrafts([
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
      { fileName: 'two.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///two.jpg' },
    ])

    expect(result).toMatchObject({ success: false, code: 'MEDIA_UPLOAD_FAILED' })
    expect(mockRemove).toHaveBeenCalledWith([
      'customer_test_1/kael-chat/model_vision/upload-1.jpg',
    ])
  })

  it('handles a rejected signed Kael upload and revokes its reservation', async () => {
    mockUploadToSignedUrl.mockRejectedValueOnce(new TypeError('connection reset'))

    const result = await uploadKaelChatMediaDrafts([
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
    ])

    expect(result).toMatchObject({ success: false, code: 'MEDIA_UPLOAD_FAILED' })
    expect(mockRemove).toHaveBeenCalledWith([
      'customer_test_1/kael-chat/model_vision/upload-1.jpg',
    ])
  })

  it('bounds a stalled signed Kael upload and revokes its reservation', async () => {
    jest.useFakeTimers()
    mockUploadToSignedUrl.mockReturnValueOnce(new Promise(() => undefined))
    let result: Awaited<ReturnType<typeof uploadKaelChatMediaDrafts>> | undefined

    void uploadKaelChatMediaDrafts([
      { fileName: 'one.jpg', mimeType: 'image/jpeg', type: 'image', uri: 'file:///one.jpg' },
    ]).then((value) => {
      result = value
    })
    for (let attempt = 0; attempt < 10 && mockUploadToSignedUrl.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve()
    }
    await jest.advanceTimersByTimeAsync(60_000)

    expect(result).toMatchObject({ success: false, code: 'MEDIA_UPLOAD_FAILED' })
    expect(mockRemove).toHaveBeenCalledWith([
      'customer_test_1/kael-chat/model_vision/upload-1.jpg',
    ])
  })

  it('rejects malformed Kael media refs before either cleanup boundary', async () => {
    const cleaned = await cleanupKaelChatMediaRefs([
      'supabase://kael-chat-media/customer_test_1/kael-chat/model_vision/../../victim.jpg',
      'supabase://kael-chat-media//kael-chat/model_vision/file.jpg',
      'https://storage.example.test/private.jpg',
    ])

    expect(cleaned).toBe(false)
    expect(mockRevokeMedia).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
