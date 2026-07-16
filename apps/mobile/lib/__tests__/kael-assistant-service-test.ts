const mockPost = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
  },
}))

import { kaelAssistantService } from '../services'

beforeEach(() => {
  mockPost.mockReset()
})

it('sends active Case Work questions to the authenticated Edge assistant route', () => {
  const input = {
    job_id: '22222222-2222-4222-8222-222222222222',
    language: 'vi' as const,
    message: 'Giải thích lại phạm vi này giúp tôi.',
    surface: 'customer_case' as const,
  }

  kaelAssistantService.ask(input)

  expect(mockPost).toHaveBeenCalledWith('/kael/assistant', input)
})
