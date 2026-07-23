import type { LocalDeal } from '@nestscout/shared'

import { buildWorkerV5OfferRequestRows } from '../jobs/offer'

function buildBroadcastDeal(): LocalDeal {
  return {
    broadcast: {
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 7',
      jobId: '11111111-1111-4111-8111-111111111111',
      prebrief: ['Ổ cắm chập chờn'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: 60,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Quận 7',
      description: 'Ổ cắm chập chờn',
      districtLabel: 'Quận 7',
      inferredProblemLabel: 'Ổ cắm chập chờn',
      mediaCount: 4,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm chập chờn'],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: '11111111-1111-4111-8111-111111111111',
    scopeChange: null,
    status: 'broadcasting',
  }
}

it('shows only the private customer photo count before confirmation', () => {
  const rows = buildWorkerV5OfferRequestRows(buildBroadcastDeal(), 'vi')
  const evidenceRow = rows.find((row) => row.icon === 'evidence')

  expect(evidenceRow).toEqual(expect.objectContaining({
    meta: 'Ảnh riêng tư chỉ mở sau khi khách xác nhận thợ.',
    status: '4 ảnh',
    title: 'Ảnh hiện trạng từ khách',
  }))
  expect(JSON.stringify(rows)).not.toContain('supabase://')
})
