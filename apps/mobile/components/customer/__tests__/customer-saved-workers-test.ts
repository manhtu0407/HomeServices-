import type { CustomerServiceHistoryItem } from '@/lib/api-types'

import { savedWorkerSummariesFromHistory } from '../kael-chat/customer-saved-workers'

it('projects the latest unique saved workers from Activity history', () => {
  const history: CustomerServiceHistoryItem[] = [
    {
      ended_at: '2026-07-10T08:00:00.000Z',
      final_price: 180000,
      id: 'job-old',
      service_type: 'electrical',
      status: 'paid',
      worker: {
        avatar_url: null,
        display_name: 'Tên cũ',
        id: 'worker-1',
        is_favorite: true,
      },
    },
    {
      ended_at: '2026-07-14T08:00:00.000Z',
      final_price: 240000,
      id: 'job-new',
      service_type: 'handyman',
      status: 'reviewed',
      worker: {
        avatar_url: 'https://example.test/worker-1.png',
        display_name: 'Anh Minh',
        id: 'worker-1',
        is_favorite: true,
      },
    },
    {
      ended_at: '2026-07-13T08:00:00.000Z',
      final_price: 150000,
      id: 'job-not-saved',
      service_type: 'plumbing',
      status: 'paid',
      worker: {
        avatar_url: null,
        display_name: 'Anh Nam',
        id: 'worker-2',
        is_favorite: false,
      },
    },
    {
      ended_at: '2026-07-12T08:00:00.000Z',
      final_price: 210000,
      id: 'job-saved-unnamed',
      service_type: 'cleaning',
      status: 'paid',
      worker: {
        avatar_url: null,
        display_name: null,
        id: 'worker-3',
        is_favorite: true,
      },
    },
  ]

  expect(savedWorkerSummariesFromHistory(history)).toEqual([
    {
      avatarUrl: 'https://example.test/worker-1.png',
      displayName: 'Anh Minh',
      id: 'worker-1',
    },
    {
      avatarUrl: null,
      displayName: null,
      id: 'worker-3',
    },
  ])
})
