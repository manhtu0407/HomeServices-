const mockGet = jest.fn()
const mockPost = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: jest.fn(),
    get: (...args: unknown[]) => mockGet(...args),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
  },
  mobileApiUrl: jest.fn(),
}))

import { customerKaelConversationService, kaelCharterService } from '../services'

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
})

describe('Kael feedback and charter services', () => {
  it('posts structured customer feedback through the authenticated Edge route', () => {
    const input = {
      response_id: 'response-1',
      rating: 'useful' as const,
      source: 'customer_chat' as const,
      language: 'vi' as const,
    }
    customerKaelConversationService.submitFeedback(input)
    expect(mockPost).toHaveBeenCalledWith('/me/kael-feedback', input)
  })

  it('reads the public charter through mobile-api', () => {
    kaelCharterService.getPublicCharter()
    expect(mockGet).toHaveBeenCalledWith('/kael/charter')
  })
})
