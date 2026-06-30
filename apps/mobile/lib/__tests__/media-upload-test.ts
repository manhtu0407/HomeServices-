const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockUpload = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockUploadToSignedUrl = jest.fn()
const mockCreateMediaUpload = jest.fn()

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

import { uploadKaelChatMediaDrafts } from '../media-upload'

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
    mockCreateMediaUpload.mockReset()
    mockFetch.mockReset()

    mockGetUser.mockResolvedValue({ data: { user: { id: 'customer_test_1' } }, error: null })
    mockFrom.mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
      upload: mockUpload,
      uploadToSignedUrl: mockUploadToSignedUrl,
    })
    mockUpload.mockResolvedValue({ error: null })
    mockUploadToSignedUrl.mockResolvedValue({ error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/evidence' }, error: null })
    mockCreateMediaUpload.mockResolvedValue({
      success: true,
      data: {
        bucket_id: 'kael-chat-media',
        object_path: 'customer_test_1/kael-chat/uploaded-pipe.jpg',
        media_ref: 'supabase://kael-chat-media/customer_test_1/kael-chat/uploaded-pipe.jpg',
        token: 'signed-token',
        signed_upload_url: 'https://storage.example.test/upload',
        expires_in_seconds: 7200,
      },
    })
    mockFetch.mockResolvedValue({
      blob: async () => ({ size: 42 }),
      ok: true,
    })
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
    }))
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'customer_test_1/kael-chat/uploaded-pipe.jpg',
      'signed-token',
      expect.anything(),
      expect.objectContaining({
        contentType: 'image/jpeg',
        upsert: false,
      }),
    )
  })

  it('infers iOS HEIC evidence when the picker reports an octet stream', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'sink.heic',
        mimeType: 'application/octet-stream',
        type: 'image',
        uri: 'file:///sink.heic',
      },
    ])

    expect(result.success).toBe(true)
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      file_name: 'sink.heic',
      mime_type: 'image/heic',
    }))
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'customer_test_1/kael-chat/uploaded-pipe.jpg',
      'signed-token',
      expect.anything(),
      expect.objectContaining({
        contentType: 'image/heic',
        upsert: false,
      }),
    )
  })

  it('omits invalid zero byte sizes and trims long uri-derived names before requesting a Kael upload', async () => {
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

    expect(result.success).toBe(true)
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      mime_type: 'image/jpeg',
    }))
    const uploadInput = mockCreateMediaUpload.mock.calls[0][0]
    expect(uploadInput.file_name.length).toBeLessThanOrEqual(180)
    expect(uploadInput.file_name).toMatch(/\.jpg$/)
    expect(uploadInput).not.toHaveProperty('file_size_bytes')
  })

  it('normalizes m4a voice evidence to the backend-supported audio/mp4 mime', async () => {
    const result = await uploadKaelChatMediaDrafts([
      {
        fileName: 'voice-note.m4a',
        mimeType: 'audio/x-m4a',
        type: 'audio',
        uri: 'file:///voice-note.m4a',
      },
    ])

    expect(result.success).toBe(true)
    expect(mockCreateMediaUpload).toHaveBeenCalledWith(expect.objectContaining({
      file_name: 'voice-note.m4a',
      mime_type: 'audio/mp4',
    }))
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'customer_test_1/kael-chat/uploaded-pipe.jpg',
      'signed-token',
      expect.anything(),
      expect.objectContaining({
        contentType: 'audio/mp4',
        upsert: false,
      }),
    )
  })

  it('falls back to direct kael-chat-media upload when production Edge lacks the media-upload route', async () => {
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

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^customer_test_1\/kael-chat\/\d+-0-pipe\.jpg$/),
      expect.anything(),
      expect.objectContaining({
        contentType: 'image/jpeg',
        upsert: false,
      }),
    )
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^customer_test_1\/kael-chat\/\d+-0-pipe\.jpg$/),
      3600,
    )
    expect(result.urls).toEqual(['https://storage.example.test/signed-read-url'])
    expect(result.mediaRefs[0]).toMatch(/^supabase:\/\/kael-chat-media\/customer_test_1\/kael-chat\/\d+-0-pipe\.jpg$/)
    expect(result.usedDirectUpload).toBe(true)
  })
})
