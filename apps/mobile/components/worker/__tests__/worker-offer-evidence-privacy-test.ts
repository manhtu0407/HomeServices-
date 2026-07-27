import type { LocalDeal } from '@nestscout/shared'

import { buildWorkerV5OfferRequestRows } from '../jobs/offer'

function buildBroadcastDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: '4790ef07-0000-4000-8000-000000000000',
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
    displayCode: 'MOH-26XNF9',
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

it('keeps internal identifiers and Kael taxonomy out of the worker offer', () => {
  const deal = buildBroadcastDeal()
  deal.broadcast!.problemSummary = 'electrical: flickering_light'
  const rows = buildWorkerV5OfferRequestRows(deal, 'vi')
  const requestRow = rows.find((row) => row.icon === 'document')
  const sourceRow = rows.find((row) => row.icon === 'jobs')
  const visibleRows = JSON.stringify(rows)

  expect(requestRow?.title).toBe('\u0110\u00e8n ch\u1eadp ch\u1eddn')
  expect(sourceRow?.meta).toBe('Ngu\u1ed3n MOH-26XNF9')
  expect(visibleRows).not.toContain('4790ef07-0000-4000-8000-000000000000')
  expect(visibleRows).not.toContain('electrical: flickering_light')
})
