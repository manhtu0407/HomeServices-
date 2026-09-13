const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: (...args: unknown[]) => mockDelete(...args),
    get: (...args: unknown[]) => mockGet(...args),
    getAuthenticated: (...args: unknown[]) => mockGet(...args),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    postAuthenticated: (...args: unknown[]) => mockPost(...args),
    deleteAuthenticated: (...args: unknown[]) => mockDelete(...args),
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
  jobService.getWorkerCandidate('job/unsafe', 'captured-token')
  jobService.getWorkerCandidateDecision('job/unsafe', 'candidate/unsafe', 'captured-token')
  jobService.confirmWorkerCandidate('job/unsafe', 'candidate/unsafe', 'captured-token')
  jobService.rejectWorkerCandidate('job/unsafe', 'candidate/unsafe', 'captured-token')

  expect(mockGet).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidate', 'captured-token')
  expect(mockGet).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidates/candidate%2Funsafe/decision', 'captured-token')
  expect(mockPost).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidates/candidate%2Funsafe/confirm', undefined, 'captured-token')
  expect(mockPost).toHaveBeenCalledWith('/jobs/job%2Funsafe/candidates/candidate%2Funsafe/reject', undefined, 'captured-token')
})

it('binds favorite changes from the candidate owner to the captured token', () => {
  jobService.setFavoriteWorker('worker/unsafe', true, 'captured-token')
  jobService.setFavoriteWorker('worker/unsafe', false, 'captured-token')
  expect(mockPost).toHaveBeenCalledWith('/me/favorite-workers/worker%2Funsafe', undefined, 'captured-token')
  expect(mockDelete).toHaveBeenCalledWith('/me/favorite-workers/worker%2Funsafe', undefined, 'captured-token')
})
