const mockPost = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: jest.fn(),
    deleteAuthenticated: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
  },
}))

import { jobService } from '../services'

beforeEach(() => {
  mockPost.mockReset()
})

it('uses the Edge upload-intent and revoke boundaries for private job media', () => {
  const uploadInput = {
    file_name: 'before.jpg',
    file_size_bytes: 42,
    mime_type: 'image/jpeg',
    stage: 'before' as const,
  }
  const revokeInput = {
    object_paths: ['job/unsafe/before/reserved.jpg'],
  }

  jobService.createJobMediaUpload('job/unsafe', uploadInput)
  jobService.revokeJobMediaUploads('job/unsafe', revokeInput)

  expect(mockPost).toHaveBeenNthCalledWith(1, '/jobs/job%2Funsafe/media-upload', uploadInput)
  expect(mockPost).toHaveBeenNthCalledWith(2, '/jobs/job%2Funsafe/media-revoke', revokeInput)
})
