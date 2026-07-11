const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: (...args: unknown[]) => mockDelete(...args),
    get: (...args: unknown[]) => mockGet(...args),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
  },
}))

import { jobService } from '../services'

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  mockDelete.mockReset()
})

it('saves and removes a customer-owned favorite through the Edge boundary', () => {
  jobService.setFavoriteWorker('worker/unsafe', true)
  jobService.setFavoriteWorker('worker/unsafe', false)

  expect(mockPost).toHaveBeenCalledWith('/me/favorite-workers/worker%2Funsafe')
  expect(mockDelete).toHaveBeenCalledWith('/me/favorite-workers/worker%2Funsafe')
})

it('uses the customer-owned worker candidate review endpoints', () => {
  jobService.getWorkerCandidate('job/unsafe')
  jobService.confirmWorkerCandidate('job/unsafe', 'candidate/unsafe')
  jobService.rejectWorkerCandidate('job/unsafe', 'candidate/unsafe')

  expect(mockGet).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidate')
  expect(mockPost).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidates/candidate%2Funsafe/confirm')
  expect(mockPost).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidates/candidate%2Funsafe/reject')
})
