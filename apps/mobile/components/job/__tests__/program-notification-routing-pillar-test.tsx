import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { CustomerCompensationSection } from '@/components/customer/compensation/compensation-section'
import { ProfileNotificationsView } from '@/components/customer/profile/profile-foundation-utility-surfaces'
import { WorkerCompensationSection } from '@/components/worker/discipline/compensation-section'
import { WorkerV5NotificationsBody } from '@/components/worker/profile/settings-utility-surfaces'
import { customerCompensationRoute, workerViolationsRoute } from '@/lib/program-notification-routes'
import { toNotificationPath } from '@/lib/push-notifications'
import { compensationService } from '@/lib/services/compensation-service'

export const PILLAR = {
  id: 'P288-program-notification-routing',
  invariant:
    'a discipline or compensation notice opens the screen that owns the decision (the customer compensation section, the worker violations screen) from the inbox and from a push, while other notices still open their job; the push path accepts those two routes only with their exact values; and a compensation section that fails to load shows a retry row instead of disappearing',
  authority: [
    'governance/RULES.md #8',
    'Plan moonlit-singing-phoenix R2.1 and R2.3',
  ],
  target: 'apps/mobile/lib/program-notification-routes.ts',
  layer: 'ui-visual',
  siblings: ['P282-compensation-negotiation-ui', 'P287-program-push-dispatch'],
  mutation:
    'remove compensation_agreed from customerCompensationEvents, or return null on a failed load in CustomerCompensationSection — the customer tap or the retry-row case turns red',
} as const satisfies PillarManifest

jest.mock('@/lib/auth-provider', () => ({ useAuth: () => ({ session: { access_token: 'token-p288' } }) }))
jest.mock('@/lib/services/compensation-service', () => ({
  compensationService: {
    listForCustomer: jest.fn(),
    listForWorker: jest.fn(),
    respondAsCustomer: jest.fn(),
    respondAsWorker: jest.fn(),
  },
}))

const service = compensationService as jest.Mocked<typeof compensationService>
const tokens = getCustomerThemeTokens('light')
const JOB_ID = '11111111-1111-4111-8111-111111111111'

function notice(id: string, eventType: string) {
  return {
    id, title: `Thông báo ${id}`, body: 'Nội dung', event_type: eventType, status: 'created',
    job_id: JOB_ID, created_at: '2026-09-28T00:00:00Z', read_at: null,
  }
}

describe(`${PILLAR.id}: push paths`, () => {
  it('accepts the two program routes exactly as the dispatcher writes them', () => {
    withPillarContext(PILLAR, () => {
      expect(toNotificationPath({ deep_link: customerCompensationRoute })).toBe(customerCompensationRoute)
      expect(toNotificationPath({ deep_link: workerViolationsRoute })).toBe(workerViolationsRoute)
    })
  })

  it.each([
    '/(customer)/history?section=admin',
    '/(worker)/earnings?ns_worker_screen=4.3-payout-request',
    '/(worker)/earnings?ns_worker_screen=4.7-violations&job_id=' + JOB_ID,
    '/(customer)/history?section=compensation&section=compensation',
  ])('refuses %s', (deepLink) => {
    withPillarContext(PILLAR, () => expect(toNotificationPath({ deep_link: deepLink })).toBeNull())
  })
})

describe(`${PILLAR.id}: inbox taps`, () => {
  it('opens compensation for a customer compensation notice and the job for any other', async () => {
    const onOpenCompensation = jest.fn()
    const onOpenRelatedWork = jest.fn()
    render(
      <ProfileNotificationsView
        language="vi"
        notifications={[notice('n1', 'compensation_agreed'), notice('n2', 'worker_arrived')]}
        onMarkRead={jest.fn(async () => true)}
        onOpenCompensation={onOpenCompensation}
        onOpenRelatedWork={onOpenRelatedWork}
        onRefresh={jest.fn(async () => true)}
        tokens={tokens}
        unreadCount={2}
      />,
    )
    fireEvent.press(screen.getByTestId('customer-v21-profile-notification-n1'))
    await waitFor(() => expect(onOpenCompensation).toHaveBeenCalledTimes(1))
    withPillarContext(PILLAR, () => expect(onOpenRelatedWork).not.toHaveBeenCalled())

    fireEvent.press(screen.getByTestId('customer-v21-profile-notification-n2'))
    await waitFor(() => expect(onOpenRelatedWork).toHaveBeenCalledWith(JOB_ID))
  })

  it('opens the violations screen for a worker discipline notice and the job for a reply reminder', async () => {
    const navigateToJob = jest.fn()
    const navigateToViolations = jest.fn()
    const runtime = {
      notifications: [notice('w1', 'violation_confirmed'), notice('w2', 'worker_reply_nudge')],
      notificationUnreadCount: 2,
      actions: { refreshNotifications: jest.fn(async () => true), markNotificationRead: jest.fn(async () => true) },
    }
    render(
      <WorkerV5NotificationsBody
        language="vi"
        navigateToJob={navigateToJob}
        navigateToViolations={navigateToViolations}
        runtime={runtime as never}
      />,
    )
    fireEvent.press(screen.getByTestId('worker-v5-notification-w1'))
    await waitFor(() => expect(navigateToViolations).toHaveBeenCalledTimes(1))
    withPillarContext(PILLAR, () => expect(navigateToJob).not.toHaveBeenCalled())

    fireEvent.press(screen.getByTestId('worker-v5-notification-w2'))
    await waitFor(() => expect(navigateToJob).toHaveBeenCalledWith(JOB_ID))
  })
})

describe(`${PILLAR.id}: failed loads stay visible`, () => {
  const failure = { success: false, status: 503, code: 'NETWORK_ERROR', error: 'offline' } as never

  it('shows the customer a retry row and reloads on press', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    service.listForCustomer.mockResolvedValueOnce(failure).mockResolvedValueOnce({
      success: true, status: 200, data: { policy: { min_vnd: 10000, max_vnd: 50000000, response_days: 3, max_offers: 4 }, refund_account_ready: true, items: [] },
    } as never)
    render(<CustomerCompensationSection language="vi" tokens={tokens} />)
    await waitFor(() => withPillarContext(PILLAR, () => expect(screen.getByTestId('customer-compensation-unavailable')).toBeTruthy()))
    expect(warn).toHaveBeenCalledWith('customer compensation load failed', { code: 'NETWORK_ERROR', status: 503 })

    fireEvent.press(screen.getByTestId('customer-compensation-retry'))
    await waitFor(() => expect(screen.queryByTestId('customer-compensation-unavailable')).toBeNull())
    expect(service.listForCustomer).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('shows the worker a retry row instead of hiding a pending request', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    service.listForWorker.mockResolvedValueOnce(failure)
    render(<WorkerCompensationSection language="vi" />)
    await waitFor(() => withPillarContext(PILLAR, () => expect(screen.getByTestId('worker-v5-compensation-unavailable')).toBeTruthy()))
    expect(screen.getByTestId('worker-v5-compensation-retry')).toBeTruthy()
    warn.mockRestore()
  })
})
