const mockCreateAvatarUpload = jest.fn()
const mockUpdateAvatar = jest.fn()
const mockUploadToSignedUrl = jest.fn()

jest.mock('../services', () => ({
  workerService: {
    createAvatarUpload: (...args: unknown[]) => mockCreateAvatarUpload(...args),
    updateAvatar: (...args: unknown[]) => mockUpdateAvatar(...args),
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ uploadToSignedUrl: mockUploadToSignedUrl })),
    },
  },
}))

import { uploadWorkerAvatar } from '../worker-avatar-upload'

describe('worker avatar upload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(global, 'fetch').mockResolvedValue({
      blob: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
      ok: true,
    } as Response)
    mockCreateAvatarUpload.mockResolvedValue({
      data: {
        avatar_ref: 'supabase://worker-avatars/worker-1/avatar.jpg',
        bucket_id: 'worker-avatars',
        expires_in_seconds: 7200,
        object_path: 'worker-1/avatar.jpg',
        signed_upload_url: 'https://storage.example.test/upload',
        token: 'signed-token',
      },
      status: 201,
      success: true,
    })
    mockUploadToSignedUrl.mockResolvedValue({ data: {}, error: null })
    mockUpdateAvatar.mockResolvedValue({
      data: {
        avatar_url: 'https://storage.example.test/read/avatar.jpg',
        updated_at: '2026-07-13T14:00:00.000Z',
        worker_id: 'worker-1',
      },
      status: 200,
      success: true,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uploads through a one-use signed path before confirming the canonical avatar ref', async () => {
    await expect(uploadWorkerAvatar({
      fileName: 'Ảnh Worker.JPG',
      fileSizeBytes: 9999,
      mimeType: 'image/jpeg',
      uri: 'file:///worker.jpg',
    })).resolves.toMatchObject({
      success: true,
      data: { avatar_url: 'https://storage.example.test/read/avatar.jpg' },
    })

    expect(mockCreateAvatarUpload).toHaveBeenCalledWith({
      file_name: 'Anh-Worker.jpg',
      file_size_bytes: 4,
      mime_type: 'image/jpeg',
    })
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'worker-1/avatar.jpg',
      'signed-token',
      expect.any(Blob),
      { contentType: 'image/jpeg', upsert: false },
    )
    expect(mockUpdateAvatar).toHaveBeenCalledWith({
      avatar_ref: 'supabase://worker-avatars/worker-1/avatar.jpg',
    })
  })

  it('rejects unsupported media before requesting a signed upload', async () => {
    await expect(uploadWorkerAvatar({
      fileName: 'worker.mp4',
      mimeType: 'video/mp4',
      uri: 'file:///worker.mp4',
    })).resolves.toMatchObject({ code: 'UNSUPPORTED_MEDIA', success: false })
    expect(mockCreateAvatarUpload).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
