const mockCreateSignedUrl = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ createSignedUrl: mockCreateSignedUrl })),
    },
  },
}))

import {
  jobMediaObjectPathFromRef,
  mergeJobMediaRefsNewestFirst,
  resolveJobMediaPreviewUrl,
} from '../job-media-preview'

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
    expect(jobMediaObjectPathFromRef('supabase://job-media/11111111-1111-4111-8111-111111111111/before/..')).toBeNull()
    expect(jobMediaObjectPathFromRef('supabase://job-media/11111111-1111-4111-8111-111111111111/before/.hidden.jpg')).toBeNull()
  })

  it('keeps newly uploaded scope evidence when the five-reference limit is full', () => {
    const ref = (name: string) => `supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/${name}.jpg`

    expect(mergeJobMediaRefsNewestFirst(
      [ref('new')],
      [ref('a'), ref('b'), ref('c'), ref('d'), ref('e')],
    )).toEqual([ref('new'), ref('a'), ref('b'), ref('c'), ref('d')])
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

  it('returns no preview when the storage client rejects instead of leaking an unhandled promise', async () => {
    mockCreateSignedUrl.mockRejectedValue(new Error('private storage transport detail'))

    await expect(resolveJobMediaPreviewUrl(storageRef)).resolves.toBeNull()
  })

  it('returns no preview when signed URL creation stalls', async () => {
    jest.useFakeTimers()
    mockCreateSignedUrl.mockReturnValue(new Promise(() => undefined))
    const pending = resolveJobMediaPreviewUrl(storageRef)

    await jest.advanceTimersByTimeAsync(10_000)

    await expect(pending).resolves.toBeNull()
    jest.useRealTimers()
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
