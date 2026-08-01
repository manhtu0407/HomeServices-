const mockCreateAvatarUpload = jest.fn()
const mockUpdateAvatar = jest.fn()
const mockUploadToSignedUrl = jest.fn()
const mockStorageFrom = jest.fn((_bucket?: string) => ({
  uploadToSignedUrl: mockUploadToSignedUrl,
}))

jest.mock('../services', () => ({
  customerProfileService: {
    createAvatarUpload: (...args: unknown[]) => mockCreateAvatarUpload(...args),
    updateAvatar: (...args: unknown[]) => mockUpdateAvatar(...args),
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => mockStorageFrom(bucket),
    },
  },
}))

import { uploadCustomerAvatar } from '../customer-avatar-upload'

describe('customer avatar upload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(global, 'fetch').mockResolvedValue({
      blob: async () => new Blob(
        [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
        { type: 'image/jpeg' },
      ),
      ok: true,
    } as Response)
    mockCreateAvatarUpload.mockResolvedValue({
      data: {
        avatar_ref: 'supabase://customer-avatars/customer-1/avatar.jpg',
        bucket_id: 'customer-avatars',
        expires_in_seconds: 7200,
        object_path: 'customer-1/avatar.jpg',
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
        customer_id: 'customer-1',
        updated_at: '2026-07-29T14:00:00.000Z',
      },
      status: 200,
      success: true,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uploads the selected image to the private customer bucket before confirming it', async () => {
    await expect(uploadCustomerAvatar({
      fileName: 'Ảnh của tôi.JPG',
      fileSizeBytes: 9999,
      mimeType: 'image/jpeg',
      uri: 'file:///customer.jpg',
    })).resolves.toMatchObject({
      success: true,
      data: { avatar_url: 'https://storage.example.test/read/avatar.jpg' },
    })

    expect(mockCreateAvatarUpload).toHaveBeenCalledWith({
      file_name: 'Anh-cua-toi.jpg',
      file_size_bytes: 4,
      mime_type: 'image/jpeg',
    })
    expect(mockStorageFrom).toHaveBeenCalledWith('customer-avatars')
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'customer-1/avatar.jpg',
      'signed-token',
      expect.any(Blob),
      { contentType: 'image/jpeg', upsert: false },
    )
    expect(mockUpdateAvatar).toHaveBeenCalledWith({
      avatar_ref: 'supabase://customer-avatars/customer-1/avatar.jpg',
    })
  })

  it('rejects video before reading or uploading it', async () => {
    await expect(uploadCustomerAvatar({
      fileName: 'avatar.mp4',
      mimeType: 'video/mp4',
      uri: 'file:///avatar.mp4',
    })).resolves.toMatchObject({ code: 'UNSUPPORTED_MEDIA', success: false })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockCreateAvatarUpload).not.toHaveBeenCalled()
  })

  it('does not confirm the avatar when the private upload fails', async () => {
    mockUploadToSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error('upload failed'),
    })

    await expect(uploadCustomerAvatar({
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      uri: 'file:///avatar.jpg',
    })).resolves.toMatchObject({ code: 'MEDIA_UPLOAD_FAILED', success: false })

    expect(mockUpdateAvatar).not.toHaveBeenCalled()
  })
})
