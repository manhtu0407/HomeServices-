const mockDelete = jest.fn()
const mockGet = jest.fn()
const mockGetAuthenticated = jest.fn()
const mockPatch = jest.fn()
const mockPost = jest.fn()
const mockPostAuthenticated = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: (...args: unknown[]) => mockDelete(...args),
    deleteAuthenticated: jest.fn(),
    get: (...args: unknown[]) => mockGet(...args),
    getAuthenticated: (...args: unknown[]) => mockGetAuthenticated(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
    postAuthenticated: (...args: unknown[]) => mockPostAuthenticated(...args),
    put: jest.fn(),
  },
}))

import {
  jobService,
  kaelChatProgressService,
  kaelChatService,
  notificationService,
  workerKaelChatService,
  workerService,
} from '../services'

describe('mobile service path segments', () => {
  beforeEach(() => {
    mockDelete.mockReset()
    mockGet.mockReset()
    mockGetAuthenticated.mockReset()
    mockPatch.mockReset()
    mockPost.mockReset()
    mockPostAuthenticated.mockReset()
  })

  it('binds active-job bootstrap to an explicit actor token when provided', () => {
    jobService.listMyActiveJob('customer-token')
    expect(mockGetAuthenticated).toHaveBeenCalledWith('/me/jobs/active', 'customer-token')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('binds cancellation and favorite reads to the initiating token', () => {
    const jobId = 'unsafe/job'
    const input = {} as never
    jobService.cancelJob(jobId, 'customer-token')
    jobService.requestCustomerCancellation(jobId, input, 'customer-token')
    jobService.listFavoriteWorkersForMatching(jobId, 'customer-token')
    expect(mockPostAuthenticated).toHaveBeenNthCalledWith(1, '/jobs/unsafe%2Fjob/cancel', undefined, 'customer-token')
    expect(mockPostAuthenticated).toHaveBeenNthCalledWith(2, '/jobs/unsafe%2Fjob/customer-cancellation', input, 'customer-token')
    expect(mockGetAuthenticated).toHaveBeenCalledWith('/me/favorite-workers?job_id=unsafe%2Fjob', 'customer-token')
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('encodes every caller-provided identifier as one path segment', () => {
    const unsafeId = 'unsafe/segment?#value'
    const input = {} as never

    jobService.getJob(unsafeId)
    jobService.listMessages(unsafeId)
    jobService.sendMessage(unsafeId, input)
    jobService.attachJobMedia(unsafeId, input)
    jobService.confirmSearch(unsafeId, input, 'customer-token')
    jobService.cancelJob(unsafeId)
    jobService.updateStatus(unsafeId, 'worker_on_way')
    jobService.authorizeApartmentAccess(unsafeId, input, 'customer-token')
    jobService.requestScopeChange(unsafeId, input)
    jobService.getKaelJobIncident(unsafeId)
    jobService.openKaelJobIncident(unsafeId, input)
    jobService.proposeScopeChangeFromKaelIncident(unsafeId, input)
    jobService.askKaelForWorker(unsafeId, input)
    jobService.requestWorkerCancellation(unsafeId, input)
    jobService.requestCustomerCancellation(unsafeId, input)
    jobService.openDispute(unsafeId, input)
    jobService.submitDisputeCounterStatement(unsafeId, input)
    jobService.decideDispute(unsafeId, input)
    jobService.decideScopeChange(unsafeId, input)    jobService.confirmCompletion(unsafeId)
    jobService.submitReview(unsafeId, input)
    kaelChatService.get(unsafeId)
    kaelChatService.sendTurn(unsafeId, input)
    kaelChatService.submitEvidence(unsafeId, input)
    kaelChatService.confirm(unsafeId, {
      price_reasoning_receipt_id: 'receipt_kael_price_20260811_01',
    })
    kaelChatProgressService.get(unsafeId)
    workerKaelChatService.get(unsafeId)
    workerKaelChatService.sendTurn(unsafeId, input)
    workerService.acceptBroadcast(unsafeId, unsafeId)
    workerService.declineBroadcast(unsafeId)
    notificationService.markRead(unsafeId)

    const paths = [mockDelete, mockGet, mockPatch, mockPost]
      .flatMap((mock) => mock.mock.calls.map(([path]) => path as string))
    expect(paths.length).toBeGreaterThan(25)
    expect(paths.every((path) => !path.includes(unsafeId))).toBe(true)
    expect(paths.every((path) => path.includes('unsafe%2Fsegment%3F%23value'))).toBe(true)
  })

  it('uses the supplied customer session when loading a routed job', () => {
    jobService.getJob('job-a', 'customer-session-token')

    expect(mockGetAuthenticated).toHaveBeenCalledWith('/jobs/job-a', 'customer-session-token')
    expect(mockGet).not.toHaveBeenCalled()
  })
})
