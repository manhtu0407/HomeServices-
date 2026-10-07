import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { CustomerCompensationSection } from '@/components/customer/compensation/compensation-section'
import { WorkerCompensationSection } from '@/components/worker/discipline/compensation-section'
import { compensationService, type CompensationNegotiation } from '@/lib/services/compensation-service'

export const PILLAR = {
  id: 'P282-compensation-negotiation-ui',
  invariant:
    'a customer without a confirmed damage case sees no compensation surface; a claim is sent only with an amount inside the policy range and a written description; each side sees answer controls only on its own turn; a worker is never offered an accept or a counter the balance cannot cover; and a closed negotiation points the customer to the authorities instead of NestScout deciding; claim photos (up to three) are shown to the worker, and a customer without a refund account is told where to add one',
  authority: [
    'Tu 2026-09-28: compensation by agreement both sides accept; NestScout never advances money',
    'governance/structures/do-not-build-now.md §21',
  ],
  target: 'apps/mobile/components/job/compensation-negotiation.tsx',
  layer: 'ui-visual',
  siblings: ['P280-compensation-edge-routes', 'P281-compensation-mediation-sql'],
  mutation:
    'drop the maxOfferVnd bound from the counter check, or show the accept button while the balance is short — the worker balance case turns red',
} as const satisfies PillarManifest

jest.mock('@/lib/auth-provider', () => ({ useAuth: () => ({ session: { access_token: 'token-p233', user: { id: 'owner-p233' } } }) }))
jest.mock('@/lib/frontend-workflow/compensation-evidence', () => ({
  MAX_COMPENSATION_PHOTOS: 3,
  uploadCompensationPhotos: jest.fn(async () => ({ success: true, paths: [] })),
}))
jest.mock('@/lib/services/compensation-service', () => ({
  compensationService: {
    listForCustomer: jest.fn(),
    listForWorker: jest.fn(),
    openClaim: jest.fn(),
    respondAsCustomer: jest.fn(),
    respondAsWorker: jest.fn(),
  },
}))

const service = compensationService as jest.Mocked<typeof compensationService>
const tokens = getCustomerThemeTokens('light')
const policy = { min_vnd: 10000, max_vnd: 50000000, response_days: 3, max_offers: 4 }

function negotiation(overrides: Partial<CompensationNegotiation> = {}): CompensationNegotiation {
  return {
    id: 'n1', case_id: 'case-1', job_id: 'job-1', violation_code: 'intentional_damage', worker_name: 'Thợ A',
    status: 'awaiting_worker', current_amount_vnd: 2000000, respond_by: '2999-01-01T00:00:00Z', offers_left: 3,
    agreed_at: null, payout: null, evidence: [{ path: 'compensation/c/case-1/p.jpg', signed_url: 'https://storage.test/p.jpg' }],
    offers: [{ actor_role: 'customer', action: 'claim', amount_vnd: 2000000, note: 'Vỡ bồn rửa', created_at: '2026-09-28T00:00:00Z' }],
    ...overrides,
  }
}

const item = { case_id: 'case-1', job_id: 'job-1', violation_code: 'intentional_damage', worker_name: 'Thợ A', decided_at: '2026-09-27T00:00:00Z' }

describe(`${PILLAR.id}: customer side`, () => {
  it('renders nothing when there is no confirmed damage case', async () => {
    service.listForCustomer.mockResolvedValue({ success: true, status: 200, data: { policy, refund_account_ready: false, items: [] } } as never)
    render(<CustomerCompensationSection language="vi" tokens={tokens} />)
    await waitFor(() => expect(service.listForCustomer).toHaveBeenCalled())
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('customer-compensation-section')).toBeNull())
  })

  it('sends a claim only with an amount in range and a written description', async () => {
    service.listForCustomer.mockResolvedValue({ success: true, status: 200, data: { policy, refund_account_ready: false, items: [{ ...item, negotiation: null }] } } as never)
    service.openClaim.mockResolvedValue({ success: true, status: 201, data: negotiation() } as never)
    render(<CustomerCompensationSection language="vi" tokens={tokens} />)
    await waitFor(() => expect(screen.getByTestId('customer-compensation-case-1-submit')).toBeOnTheScreen())
    fireEvent.changeText(screen.getByTestId('customer-compensation-case-1-amount'), '5.000')
    fireEvent.changeText(screen.getByTestId('customer-compensation-case-1-note'), 'Bồn rửa bị vỡ, hóa đơn thay mới')
    withPillarContext(PILLAR, () => expect(screen.getByTestId('customer-compensation-case-1-submit').props.accessibilityState).toMatchObject({ disabled: true }))
    fireEvent.changeText(screen.getByTestId('customer-compensation-case-1-amount'), '2.000.000')
    fireEvent.press(screen.getByTestId('customer-compensation-case-1-submit'))
    await waitFor(() => expect(service.openClaim).toHaveBeenCalledWith('case-1', { amount_vnd: 2000000, note: 'Bồn rửa bị vỡ, hóa đơn thay mới', evidence_paths: [] }, 'token-p233'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-compensation-case-1-photos-slot-2')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-compensation-case-1-refund-hint')).toBeOnTheScreen()
    })
  })

  it('shows answer controls only on the customer\'s turn and points to the authorities when it ends', async () => {
    service.listForCustomer.mockResolvedValue({ success: true, status: 200, data: { policy, refund_account_ready: false, items: [{ ...item, negotiation: negotiation() }] } } as never)
    const { unmount } = render(<CustomerCompensationSection language="vi" tokens={tokens} />)
    await waitFor(() => expect(screen.getByTestId('customer-compensation-case-1-negotiation-status')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('customer-compensation-case-1-negotiation-accept')).toBeNull())
    unmount()

    service.listForCustomer.mockResolvedValue({ success: true, status: 200, data: { policy, refund_account_ready: false, items: [{ ...item, negotiation: negotiation({ status: 'declined' }) }] } } as never)
    render(<CustomerCompensationSection language="vi" tokens={tokens} />)
    await waitFor(() => expect(screen.getByTestId('customer-compensation-case-1-negotiation-status')).toHaveTextContent(/cơ quan có thẩm quyền/))
  })
})

describe(`${PILLAR.id}: worker side`, () => {
  it('never offers an accept or a counter the balance cannot cover', async () => {
    service.listForWorker.mockResolvedValue({ success: true, status: 200, data: { policy, withdrawable_vnd: 850000, negotiations: [negotiation()] } } as never)
    service.respondAsWorker.mockResolvedValue({ success: true, status: 200, data: negotiation({ status: 'awaiting_customer' }) } as never)
    render(<WorkerCompensationSection language="vi" />)
    await waitFor(() => expect(screen.getByTestId('worker-v5-compensation-n1-negotiation-counter')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.getByTestId('worker-v5-compensation-n1-negotiation-photos')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('worker-v5-compensation-n1-negotiation-accept')).toBeNull())
    fireEvent.changeText(screen.getByTestId('worker-v5-compensation-n1-negotiation-amount'), '900000')
    withPillarContext(PILLAR, () => expect(screen.getByTestId('worker-v5-compensation-n1-negotiation-counter').props.accessibilityState).toMatchObject({ disabled: true }))
    fireEvent.changeText(screen.getByTestId('worker-v5-compensation-n1-negotiation-amount'), '600000')
    fireEvent.press(screen.getByTestId('worker-v5-compensation-n1-negotiation-counter'))
    await waitFor(() => expect(service.respondAsWorker).toHaveBeenCalledWith('n1', { action: 'counter', amount_vnd: 600000 }, 'token-p233'))
  })

  it('lets the worker accept an amount the balance covers', async () => {
    service.listForWorker.mockResolvedValue({ success: true, status: 200, data: { policy, withdrawable_vnd: 850000, negotiations: [negotiation({ current_amount_vnd: 600000 })] } } as never)
    service.respondAsWorker.mockResolvedValue({ success: true, status: 200, data: negotiation({ status: 'agreed' }) } as never)
    render(<WorkerCompensationSection language="vi" />)
    await waitFor(() => expect(screen.getByTestId('worker-v5-compensation-n1-negotiation-accept')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('worker-v5-compensation-n1-negotiation-accept'))
    await waitFor(() => expect(service.respondAsWorker).toHaveBeenCalledWith('n1', { action: 'accept' }, 'token-p233'))
  })
})
