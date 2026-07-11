const mockCreateSignedUrl = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ createSignedUrl: mockCreateSignedUrl })),
    },
  },
}))

import { jobMediaObjectPathFromRef, resolveJobMediaPreviewUrl } from '../job-media-preview'

describe('job media previews', () => {
  const objectPath = '11111111-1111-4111-8111-111111111111/before/on-site-photo.jpg'
  const storageRef = `supabase://job-media/${objectPath}`

  beforeEach(() => {
    mockCreateSignedUrl.mockReset()
  })

  it('only accepts job-media references at an allowed job stage', () => {
    expect(jobMediaObjectPathFromRef(storageRef)).toBe(objectPath)
    expect(jobMediaObjectPathFromRef('supabase://worker-verification/user/selfie.jpg')).toBeNull()
    expect(jobMediaObjectPathFromRef('supabase://job-media/job-id/not-a-stage/photo.jpg')).toBeNull()
    expect(jobMediaObjectPathFromRef('supabase://job-media/job-id/before/../photo.jpg')).toBeNull()
  })

  it('creates a short-lived signed URL for authorized private job media', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/signed/on-site-photo.jpg' },
      error: null,
    })

    await expect(resolveJobMediaPreviewUrl(storageRef)).resolves.toBe('https://storage.example.test/signed/on-site-photo.jpg')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      objectPath,
      15 * 60,
      expect.objectContaining({ transform: expect.objectContaining({ resize: 'contain' }) }),
    )
  })

  it('does not convert unrelated Supabase references into previews', async () => {
    await expect(resolveJobMediaPreviewUrl('supabase://worker-verification/user/selfie.jpg')).resolves.toBeNull()
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects arbitrary remote URLs while preserving local draft previews', async () => {
    await expect(resolveJobMediaPreviewUrl('https://attacker.example/pixel.jpg')).resolves.toBeNull()
    await expect(resolveJobMediaPreviewUrl('file:///private/local-draft.jpg')).resolves.toBe('file:///private/local-draft.jpg')
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })
})
