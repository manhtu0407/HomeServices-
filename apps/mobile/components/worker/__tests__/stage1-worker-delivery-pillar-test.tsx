import { render, screen } from '@testing-library/react-native'
import type { MatchingDeliveryReceipt } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { WorkerMatchingDeliveryStatus } from '../jobs/worker-matching-delivery-status'

export const PILLAR = {
  id: 'P47-stage1-worker-delivery',
  invariant: 'worker inbox shows only server-receipted delivery state and never invents recipient, queue, worker, or price counts',
  authority: [
    'governance/RULES.md #8 (no fabricated counts or prices)',
    'governance/STRUCTURES.md matching and recovery state machine',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-matching-delivery-status.tsx',
  layer: 'ui-visual',
  siblings: ['P45-stage1-response-identity', 'P46-stage1-customer-intake-mode'],
  mutation: 'render a recipient count when confirmedRecipientCount is absent or collapse expired into delivered; this pillar turns red',
} as const satisfies PillarManifest

const receiptOf = (state: MatchingDeliveryReceipt['state']): MatchingDeliveryReceipt => ({
  accepted_at: state === 'accepted' ? '2026-08-23T08:04:00.000Z' : null,
  broadcast_id: 'broadcast-a',
  delivered_at: state === 'delivered' ? '2026-08-23T08:01:00.000Z' : null,
  delivery_id: 'delivery-a',
  expires_at: '2026-08-23T08:05:00.000Z',
  job_id: 'job-a',
  operation_id: 'operation-a',
  seen_at: state === 'seen' ? '2026-08-23T08:02:00.000Z' : null,
  server_time: '2026-08-23T08:03:00.000Z',
  state,
})

describe('Stage-1 worker durable delivery', () => {
  it.each([
    ['queued', 'Đang xếp gửi'],
    ['delivered', 'Đã giao đến hộp việc'],
    ['seen', 'Bạn đã xem'],
    ['accepted', 'Đã ghi nhận nhận việc'],
    ['expired', 'Lời mời đã hết hạn'],
  ] as const)('renders the distinct %s state', (state, label) => {
    render(<WorkerMatchingDeliveryStatus language="vi" receipt={receiptOf(state)} />)
    withPillarContext(PILLAR, () => expect(screen.getByText(label)).toBeTruthy(), `server state ${state}`)
  })

  it('does not render a recipient count without a server-confirmed value', () => {
    const view = render(<WorkerMatchingDeliveryStatus language="en" receipt={receiptOf('queued')} />)
    withPillarContext(PILLAR, () => {
      expect(JSON.stringify(view.toJSON())).not.toContain('recipient')
      expect(screen.getByText('Queued for delivery')).toBeTruthy()
    }, 'absence is not zero and is not permission to estimate')
  })
})
