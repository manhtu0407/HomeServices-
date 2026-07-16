import { act, render, waitFor } from '@testing-library/react-native'
import { AppState, Text } from 'react-native'
import type { LocalWorkflowAction } from '@nestscout/shared'
import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const mockGetProfile = jest.fn()
const mockGetEarnings = jest.fn()
const mockGetPerformanceInsights = jest.fn()
const mockGetBroadcasts = jest.fn()
const mockGetJobs = jest.fn()
const mockUpdateAvailability = jest.fn()
const mockListNotifications = jest.fn()
const mockRequestScopeChange = jest.fn()
const mockOpenKaelJobIncident = jest.fn()
let mockAuth = {
  role: 'worker' as const,
  session: { user: { id: 'worker-available' } },
}

jest.mock('../auth-provider', () => ({
  useAuth: () => mockAuth,
}))

jest.mock('../app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('../media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
}))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
}))

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {},
  kaelMemoryService: {},
  notificationService: {
    list: (...args: unknown[]) => mockListNotifications(...args),
  },
  workerService: {
    getBroadcasts: (...args: unknown[]) => mockGetBroadcasts(...args),
    getEarnings: (...args: unknown[]) => mockGetEarnings(...args),
    getJobs: (...args: unknown[]) => mockGetJobs(...args),
    getPerformanceInsights: (...args: unknown[]) => mockGetPerformanceInsights(...args),
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    openKaelJobIncident: (...args: unknown[]) => mockOpenKaelJobIncident(...args),
    requestScopeChange: (...args: unknown[]) => mockRequestScopeChange(...args),
    updateAvailability: (...args: unknown[]) => mockUpdateAvailability(...args),
  },
}))

function WorkerAvailabilityProbe() {
  const { workerProfile } = useFrontendWorkflow()
  return <Text testID="worker-availability">{workerProfile?.is_available ? 'available' : 'unavailable'}</Text>
}

let latestWorkflowDispatch: ((action: LocalWorkflowAction) => void) | null = null
let latestWorkflowActions: ReturnType<typeof useFrontendWorkflow>['actions'] | null = null

function WorkflowIsolationProbe() {
  const { actions, dispatch, state } = useFrontendWorkflow()
  latestWorkflowDispatch = dispatch
  latestWorkflowActions = actions
  return <Text testID="workflow-deal-owner">{state.deal ? 'has-deal' : 'empty'}</Text>
}

describe('FrontendWorkflowProvider worker bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    latestWorkflowDispatch = null
    latestWorkflowActions = null
    mockAuth = {
      role: 'worker',
      session: { user: { id: 'worker-available' } },
    }
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    })
    mockGetProfile.mockResolvedValue({
      data: {
        bank_account_masked: null,
        bank_name: null,
        date_of_birth: null,
        districts: ['district_7'],
        gender: null,
        has_cccd: true,
        has_selfie: true,
        home_lat: null,
        home_lng: null,
        id: 'worker-available',
        is_approved: true,
        is_available: true,
        is_suspended: false,
        legal_name: null,
        problem_specializations: [],
        rating: 5,
        service_radius_km: 5,
        service_types: ['electrical'],
        total_jobs: 1,
        verification_status: 'approved',
        years_experience: 2,
      },
      success: true,
    })
    mockGetEarnings.mockResolvedValue({ error: 'not needed for this regression', success: false })
    mockGetPerformanceInsights.mockResolvedValue({ error: 'not needed for this regression', success: false })
    mockGetBroadcasts.mockResolvedValue({ data: { broadcasts: [] }, success: true })
    mockGetJobs.mockResolvedValue({ data: { jobs: [] }, success: true })
    mockListNotifications.mockResolvedValue({
      data: { notifications: [], unread_count: 0 },
      success: true,
    })
    mockUpdateAvailability.mockResolvedValue({
      data: {
        is_available: false,
        updated_at: '2026-07-14T00:00:00.000Z',
        worker_id: 'worker-available',
      },
      success: true,
    })
    mockRequestScopeChange.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
    mockOpenKaelJobIncident.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
  })

  it('hydrates an available worker without mutating availability off on login', async () => {
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkerAvailabilityProbe />
      </FrontendWorkflowProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('worker-availability').props.children).toBe('available')
    })

    expect(mockGetProfile).toHaveBeenCalled()
    expect(mockUpdateAvailability).not.toHaveBeenCalled()
  })

  it('isolates stale workflow callbacks when the signed-in account changes', async () => {
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowDispatch).not.toBeNull())
    const staleAccountDispatch = latestWorkflowDispatch!

    mockAuth = {
      role: 'worker',
      session: { user: { id: 'worker-next' } },
    }
    screen.rerender(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('workflow-deal-owner')).toHaveTextContent('empty'))

    act(() => {
      staleAccountDispatch({ type: 'start_home_service', serviceType: 'electrical' })
    })

    expect(screen.getByTestId('workflow-deal-owner')).toHaveTextContent('empty')
  })

  it('reuses a direct scope-change key only for the same job and bound payload', async () => {
    render(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())
    act(() => {
      latestWorkflowDispatch?.({
        type: 'hydrate_remote_job',
        job: {
          addressLabel: 'Tòa nhà A',
          backendStatus: 'repairing',
          description: 'Sửa ổ cắm',
          districtLabel: 'Quận 1',
          id: '11111111-1111-4111-8111-111111111111',
          problemChips: ['ổ cắm'],
          serviceType: 'electrical',
          status: 'repairing',
        },
        workerGate: 'remote_backend',
      })
    })
    const input = {
      new_description: 'Thay ổ cắm bị cháy xém',
      photo_urls: ['supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/photo-a.jpg'],
      reason: 'Phát hiện chân đầu dây điện bị cháy',
    }

    await act(async () => {
      await latestWorkflowActions?.requestScopeChange(input)
      await latestWorkflowActions?.requestScopeChange({
        ...input,
        new_description: `  ${input.new_description}  `,
        reason: ` ${input.reason} `,
      })
      await latestWorkflowActions?.requestScopeChange({
        ...input,
        reason: 'Phát hiện dây nguồn và chân ổ đều cháy',
      })
    })

    const firstKey = mockRequestScopeChange.mock.calls[0][1].client_request_id
    const retryKey = mockRequestScopeChange.mock.calls[1][1].client_request_id
    const changedInputKey = mockRequestScopeChange.mock.calls[2][1].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(changedInputKey).not.toBe(firstKey)
  })

  it('does not carry a pending scope-change key into the next signed-in account', async () => {
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())
    const hydrateJob = () => {
      latestWorkflowDispatch?.({
        type: 'hydrate_remote_job',
        job: {
          addressLabel: 'Building A',
          backendStatus: 'repairing',
          description: 'Repair outlet',
          districtLabel: 'District 1',
          id: '11111111-1111-4111-8111-111111111111',
          problemChips: ['outlet'],
          serviceType: 'electrical',
          status: 'repairing',
        },
        workerGate: 'remote_backend',
      })
    }
    const input = {
      new_description: 'Replace the scorched outlet',
      photo_urls: ['supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/photo-a.jpg'],
      reason: 'The terminal and supply wire are scorched',
    }

    act(hydrateJob)
    await act(async () => {
      await latestWorkflowActions?.requestScopeChange(input)
    })
    const firstOwnerKey = mockRequestScopeChange.mock.calls[0][1].client_request_id

    mockAuth = {
      role: 'worker',
      session: { user: { id: 'worker-next' } },
    }
    screen.rerender(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('workflow-deal-owner')).toHaveTextContent('empty'))
    act(hydrateJob)
    await act(async () => {
      await latestWorkflowActions?.requestScopeChange(input)
    })

    const nextOwnerKey = mockRequestScopeChange.mock.calls[1][1].client_request_id
    expect(nextOwnerKey).not.toBe(firstOwnerKey)
  })

  it('reuses an incident-open key only for the same job and bound payload', async () => {
    render(
      <FrontendWorkflowProvider>
        <WorkflowIsolationProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())
    act(() => {
      latestWorkflowDispatch?.({
        type: 'hydrate_remote_job',
        job: {
          addressLabel: 'Building A',
          backendStatus: 'repairing',
          description: 'Repair outlet',
          districtLabel: 'District 1',
          id: '11111111-1111-4111-8111-111111111111',
          problemChips: ['outlet'],
          serviceType: 'electrical',
          status: 'repairing',
        },
        workerGate: 'remote_backend',
      })
    })
    const input = {
      new_description: 'Replace the scorched outlet',
      photo_urls: [
        'supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/photo-a.jpg',
        'supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/photo-b.jpg',
      ],
      reason: 'The terminal and supply wire are scorched',
    }

    await act(async () => {
      await latestWorkflowActions?.openKaelJobIncident(input)
      await latestWorkflowActions?.openKaelJobIncident({
        ...input,
        new_description: ` ${input.new_description} `,
        reason: `  ${input.reason}  `,
      })
      await latestWorkflowActions?.openKaelJobIncident({
        ...input,
        photo_urls: [...input.photo_urls].reverse(),
      })
    })

    const firstKey = mockOpenKaelJobIncident.mock.calls[0][1].client_request_id
    const retryKey = mockOpenKaelJobIncident.mock.calls[1][1].client_request_id
    const reorderedPhotosKey = mockOpenKaelJobIncident.mock.calls[2][1].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(reorderedPhotosKey).not.toBe(firstKey)
  })
})
