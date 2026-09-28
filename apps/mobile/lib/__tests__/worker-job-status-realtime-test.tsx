import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

jest.mock('../auth-provider', () => ({
  useAuth: () => ({
    role: 'worker',
    session: { user: { id: 'worker_test_1' } },
  }),
}))

jest.mock('../app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
  subscribeToWorkerEarnings: jest.fn(() => null),
}))

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {
    getWorkerCandidate: jest.fn(),
  },
  kaelMemoryService: {},
  notificationService: {
    list: jest.fn(async () => ({ data: { notifications: [], unread_count: 0 }, status: 200, success: true })),
  },
  workerService: {
    getBroadcasts: jest.fn(async () => ({ data: { broadcasts: [] }, status: 200, success: true })),
    getEarnings: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    getJobs: jest.fn(),
    getPayoutMethod: jest.fn(async () => ({ data: { payout_method: null }, status: 200, success: true })),
    getPerformanceInsights: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    getProfile: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    listWithdrawalRequests: jest.fn(async () => ({ data: { requests: [] }, status: 200, success: true })),
    recordActiveMinute: jest.fn(),
    sendMatchingHeartbeat: jest.fn(async () => ({
      data: { active_until: '2026-08-23T08:05:00.000Z', server_time: '2026-08-23T08:00:00.000Z' },
      status: 200,
      success: true,
    })),
    updateAvailability: jest.fn(),
  },
}))

import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const { workerService: mockWorkerService } = jest.requireMock('../services') as {
  workerService: Record<string, jest.Mock>
}
const { subscribeToJobStatus: mockSubscribeToJobStatus } = jest.requireMock('../realtime') as {
  subscribeToJobStatus: jest.Mock
}

const ACTIVE_JOB_ID = '33333333-3333-4333-8333-333333333333'

function buildWorkerJob(status: string) {
  return {
    address_access: {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: true,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: true,
      release_stage: 'area_only',
    },
    address_building: null,
    address_floor: null,
    address_unit: null,
    completed_at: null,
    completion_notes: null,
    completion_photo_urls: [],
    created_at: '2026-07-22T05:00:00.000Z',
    display_code: 'NS-ACTIVE-1',
    district: 'q1',
    estimated_earning: null,
    final_price: null,
    gross_amount: null,
    id: ACTIVE_JOB_ID,
    matched_at: null,
    payment_amount_received: null,
    payment_code: null,
    payment_expires_at: null,
    payment_provider: null,
    payment_qr_image_url: null,
    payment_received_at: null,
    payment_status: null,
    payment_transfer_content: null,
    photo_urls: [],
    platform_fee: null,
    problem_summary: 'Ổ cắm mất điện',
    scheduled_at: '2026-07-22T06:00:00.000Z',
    service_type: 'electrical',
    status,
    worker_brief_guidance: null,
    worker_net: null,
  }
}

function Probe() {
  const { actions, state } = useFrontendWorkflow()
  return (
    <>
      <Pressable onPress={() => void actions.workerRefresh()} testID="worker-refresh" />
      <Text testID="worker-deal-status">{state.deal ? `${state.deal.id}/${state.deal.backendStatus ?? 'none'}` : 'none'}</Text>
    </>
  )
}

describe('Worker job-status realtime while waiting on a customer decision', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each(['worker_candidate_pending', 'scope_change_pending', 'completed_by_worker'])(
    'subscribes to the active job while it is %s so the customer decision arrives without polling',
    async (status) => {
      mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [buildWorkerJob(status)] }, status: 200, success: true })

      render(
        <FrontendWorkflowProvider>
          <Probe />
        </FrontendWorkflowProvider>,
      )
      fireEvent.press(screen.getByTestId('worker-refresh'))

      await waitFor(() => expect(screen.getByTestId('worker-deal-status')).toHaveTextContent(`${ACTIVE_JOB_ID}/${status}`))
      expect(mockSubscribeToJobStatus).toHaveBeenCalledWith(ACTIVE_JOB_ID, expect.any(Function))
    },
  )

  it('re-reads worker jobs when a job-status event lands during an in-flight refresh', async () => {
    let onJobStatus: (() => void) | undefined
    mockSubscribeToJobStatus.mockImplementation((_jobId: string, onUpdate: () => void) => {
      onJobStatus = onUpdate
      return { unsubscribe: jest.fn(async () => 'ok') }
    })
    mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [buildWorkerJob('worker_candidate_pending')] }, status: 200, success: true })
    render(
      <FrontendWorkflowProvider>
        <Probe />
      </FrontendWorkflowProvider>,
    )
    fireEvent.press(screen.getByTestId('worker-refresh'))
    await waitFor(() => expect(screen.getByTestId('worker-deal-status')).toHaveTextContent(`${ACTIVE_JOB_ID}/worker_candidate_pending`))

    let releaseProfile!: (value: unknown) => void
    mockWorkerService.getProfile.mockImplementationOnce(() => new Promise((resolve) => { releaseProfile = resolve }))
    mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [buildWorkerJob('worker_matched')] }, status: 200, success: true })
    fireEvent.press(screen.getByTestId('worker-refresh'))
    const readsBeforeEvent = mockWorkerService.getJobs.mock.calls.length
    await act(async () => {
      onJobStatus?.()
      await Promise.resolve()
    })
    expect(mockWorkerService.getJobs.mock.calls.length).toBe(readsBeforeEvent)

    await act(async () => {
      releaseProfile({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })
      await Promise.resolve()
    })

    await waitFor(() => expect(mockWorkerService.getJobs.mock.calls.length).toBe(readsBeforeEvent + 1))
  })

  it('refreshes the worker runtime on a job-status event and unsubscribes once the job leaves the live set', async () => {
    const unsubscribe = jest.fn(async () => 'ok')
    let onJobStatus: (() => void) | undefined
    mockSubscribeToJobStatus.mockImplementation((_jobId: string, onUpdate: () => void) => {
      onJobStatus = onUpdate
      return { unsubscribe }
    })
    mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [buildWorkerJob('worker_candidate_pending')] }, status: 200, success: true })

    render(
      <FrontendWorkflowProvider>
        <Probe />
      </FrontendWorkflowProvider>,
    )
    fireEvent.press(screen.getByTestId('worker-refresh'))
    await waitFor(() => expect(screen.getByTestId('worker-deal-status')).toHaveTextContent(`${ACTIVE_JOB_ID}/worker_candidate_pending`))
    const jobReadsBeforeEvent = mockWorkerService.getJobs.mock.calls.length

    mockWorkerService.getJobs.mockResolvedValue({ data: { jobs: [buildWorkerJob('reviewed')] }, status: 200, success: true })
    await act(async () => {
      onJobStatus?.()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByTestId('worker-deal-status')).toHaveTextContent(`${ACTIVE_JOB_ID}/reviewed`))
    expect(mockWorkerService.getJobs.mock.calls.length).toBeGreaterThan(jobReadsBeforeEvent)
    expect(unsubscribe).toHaveBeenCalled()
  })
})
