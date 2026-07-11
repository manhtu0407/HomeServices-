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

import { kaelChatService } from '../services'

beforeEach(() => {
  mockPost.mockReset()
})

it('serializes the local Basic Intake profile and schedule at the mobile API boundary', () => {
  kaelChatService.create({
    message: 'Air conditioner is not cooling well.',
    photo_urls: [],
    problem_chips: [],
    profileId: 'air_scope',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: {
      date: '2026-07-12',
      start: '08:00',
      end: '10:00',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    service_type: 'hvac',
  })

  expect(mockPost).toHaveBeenCalledWith('/kael/chat', expect.objectContaining({
    message: 'Air conditioner is not cooling well.',
    profile_id: 'air_scope',
    scheduled_at: '2026-07-12T01:00:00.000Z',
    schedule_window: {
      date: '2026-07-12',
      start: '08:00',
      end: '10:00',
      time_zone: 'Asia/Ho_Chi_Minh',
    },
    service_type: 'hvac',
  }))
})
