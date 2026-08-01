import { act, render, waitFor } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState, Text } from 'react-native'
import type { LocalWorkflowAction } from '@nestscout/shared'
import type { JobDetailResponse } from '../api-types'
import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const mockGetProfile = jest.fn()
const mockGetEarnings = jest.fn()
const mockGetPerformanceInsights = jest.fn()
const mockGetBroadcasts = jest.fn()
const mockGetJobs = jest.fn()
const mockGetJob = jest.fn()
const mockListMyActiveJob = jest.fn()
const mockUpdateAvailability = jest.fn()
const mockUpdateJobStatus = jest.fn()
const mockListNotifications = jest.fn()
const mockRequestScopeChange = jest.fn()
const mockOpenKaelJobIncident = jest.fn()
const mockGetCustomerAvatar = jest.fn()
const mockUploadCustomerAvatar = jest.fn()
let mockAuth: {
  role: 'customer' | 'worker'
  session: { user: { id: string } }
} = {
  role: 'worker',
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

jest.mock('../customer-avatar-upload', () => ({
  uploadCustomerAvatar: (...args: unknown[]) => mockUploadCustomerAvatar(...args),
}))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
}))

jest.mock('../services', () => ({
  customerProfileService: {
    getAvatar: (...args: unknown[]) => mockGetCustomerAvatar(...args),
    getInsights: jest.fn(async () => ({ error: 'not needed for this regression', success: false })),
  },
  jobService: {
    getJob: (...args: unknown[]) => mockGetJob(...args),
    listMyActiveJob: (...args: unknown[]) => mockListMyActiveJob(...args),
  },
  kaelMemoryService: {
    getMyMemory: jest.fn(async () => ({ error: 'not needed for this regression', success: false })),
  },
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
    updateJobStatus: (...args: unknown[]) => mockUpdateJobStatus(...args),
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
  useEffect(() => {
    latestWorkflowDispatch = dispatch
    latestWorkflowActions = actions
  }, [actions, dispatch])
  return <Text testID="workflow-deal-owner">{state.deal ? 'has-deal' : 'empty'}</Text>
}

function WorkflowDealIdProbe() {
  const { actions, state } = useFrontendWorkflow()
  useEffect(() => {
    latestWorkflowActions = actions
  }, [actions])
  return <Text testID="workflow-deal-id">{state.deal?.id ?? 'none'}</Text>
}

function WorkflowStatusProbe() {
  const { actions, dispatch, state } = useFrontendWorkflow()
  useEffect(() => {
    latestWorkflowDispatch = dispatch
    latestWorkflowActions = actions
  }, [actions, dispatch])
  return <Text testID="workflow-status">{state.deal?.status ?? 'none'}</Text>
}

function WorkflowCompletionProbe() {
  const { actions, dispatch, state } = useFrontendWorkflow()
  useEffect(() => {
    latestWorkflowDispatch = dispatch
    latestWorkflowActions = actions
  }, [actions, dispatch])
  return (
    <Text testID="workflow-completion">
      {`${state.deal?.status ?? 'none'}|${state.deal?.completionNotes ?? 'none'}|${state.deal?.completionPhotoUrls?.join(',') ?? 'none'}`}
    </Text>
  )
}

function CustomerAvatarProbe() {
  const { actions, customerAvatarUrl } = useFrontendWorkflow()
  useEffect(() => {
    latestWorkflowActions = actions
  }, [actions])
  return <Text testID="customer-avatar-url">{customerAvatarUrl ?? 'initials'}</Text>
}

function buildCustomerJobDetail(
  id: string,
  status: JobDetailResponse['job']['status'],
): JobDetailResponse {
  return {
    broadcast_state: null,
    current_scope_change: null,
    job: {
      address_access: {
        access_profile: {},
        check_in_required: false,
        customer_handoff_required: false,
        evidence_mode: 'none',
        exact_unit_released: false,
        identity_check_required: false,
        release_stage: 'area_only',
        worker_checked_in: false,
      },
      address_building: 'Toa A',
      address_district: 'district_3',
      address_floor: null,
      address_unit: null,
      arrived_at: null,
      completed_at: status === 'reviewed' ? '2026-07-29T07:00:00.000Z' : null,
      completion_notes: null,
      completion_photo_urls: [],
      confirmed_at: status === 'reviewed' ? '2026-07-29T07:10:00.000Z' : null,
      created_at: '2026-07-29T06:00:00.000Z',
      customer_evidence_photo_urls: [],
      description: 'Kiem tra ong nuoc bi ro',
      field_evidence_photo_urls: [],
      final_price: status === 'reviewed' ? 800_000 : null,
      id,
      kael_advisory: null,
      kael_complexity: null,
      kael_estimate_card_v3: null,
      kael_price_max: null,
      kael_price_min: null,
      kael_problem_identified: null,
      kael_progress: null,
      kael_worker_brief_core: null,
      kael_worker_brief_guidance: null,
      matched_at: null,
      paid_at: status === 'reviewed' ? '2026-07-29T07:20:00.000Z' : null,
      payment_rail_available: false,
      photo_urls: [],
      problem_chips: ['leaking_pipe'],
      reviewed_at: status === 'reviewed' ? '2026-07-29T07:30:00.000Z' : null,
      scheduled_at: null,
      service_type: 'plumbing',
      status,
    },
    worker: null,
  }
}

describe('FrontendWorkflowProvider worker bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    latestWorkflowDispatch = null
    latestWorkflowActions = null
    mockGetCustomerAvatar.mockReset()
    mockGetCustomerAvatar.mockResolvedValue({
      data: {
        avatar_url: null,
        customer_id: 'customer-1',
        updated_at: null,
      },
      status: 200,
      success: true,
    })
    mockUploadCustomerAvatar.mockReset()
    mockUploadCustomerAvatar.mockResolvedValue({
      data: {
        avatar_url: 'https://storage.example.test/read/customer-avatar.jpg',
        customer_id: 'customer-1',
        updated_at: '2026-07-29T12:00:00.000Z',
      },
      status: 200,
      success: true,
    })
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
    mockUpdateJobStatus.mockResolvedValue({
      data: {
        from_status: 'worker_matched',
        job_id: '11111111-1111-4111-8111-111111111111',
        to_status: 'worker_on_way',
        updated_at: '2026-07-26T10:21:44.819Z',
      },
      success: true,
    })
    mockGetJob.mockResolvedValue({
      error: 'stale detail read',
      success: false,
    })
    mockListMyActiveJob.mockResolvedValue({
      data: { active_job: null },
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

  it('hydrates and updates the signed customer avatar through the workflow owner', async () => {
    mockAuth = {
      role: 'customer',
      session: { user: { id: 'customer-1' } },
    }
    mockGetCustomerAvatar.mockResolvedValueOnce({
      data: {
        avatar_url: 'https://storage.example.test/read/original-avatar.jpg',
        customer_id: 'customer-1',
        updated_at: '2026-07-29T11:00:00.000Z',
      },
      status: 200,
      success: true,
    })
    const view = render(
      <FrontendWorkflowProvider>
        <CustomerAvatarProbe />
      </FrontendWorkflowProvider>,
    )

    await waitFor(() => {
      expect(view.getByTestId('customer-avatar-url')).toHaveTextContent(
        'https://storage.example.test/read/original-avatar.jpg',
      )
    })
    await act(async () => {
      await latestWorkflowActions?.customerUploadAvatar({
        fileName: 'customer.jpg',
        fileSizeBytes: 2345,
        mimeType: 'image/jpeg',
        uri: 'file:///customer.jpg',
      })
    })

    expect(mockUploadCustomerAvatar).toHaveBeenCalledWith({
      fileName: 'customer.jpg',
      fileSizeBytes: 2345,
      mimeType: 'image/jpeg',
      uri: 'file:///customer.jpg',
    })
    expect(view.getByTestId('customer-avatar-url')).toHaveTextContent(
      'https://storage.example.test/read/customer-avatar.jpg',
    )
  })

  it('reflects a successful worker status transition before a delayed detail refresh catches up', async () => {
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkflowStatusProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())

    act(() => {
      latestWorkflowDispatch?.({
        type: 'hydrate_remote_job',
        job: {
          addressLabel: 'Toa nha A',
          backendStatus: 'worker_matched',
          description: 'Den chap chon',
          districtLabel: 'Quan 1',
          id: '11111111-1111-4111-8111-111111111111',
          problemChips: ['Den chap chon'],
          serviceType: 'electrical',
          status: 'worker_matched',
        },
        workerGate: 'remote_backend',
      })
    })

    await act(async () => {
      await latestWorkflowActions?.workerUpdateStatus('worker_on_way')
    })

    await waitFor(() => {
      expect(screen.getByTestId('workflow-status')).toHaveTextContent('worker_on_way')
    })
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'worker_on_way',
      undefined,
    )
  })

  it('keeps submitted completion evidence visible before the background worker refresh catches up', async () => {
    mockUpdateJobStatus.mockResolvedValueOnce({
      data: {
        from_status: 'repairing',
        job_id: '11111111-1111-4111-8111-111111111111',
        to_status: 'completed_by_worker',
        updated_at: '2026-07-26T14:00:00.000Z',
      },
      success: true,
    })
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkflowCompletionProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())

    act(() => {
      latestWorkflowDispatch?.({
        type: 'hydrate_remote_job',
        job: {
          addressLabel: 'Toa nha A',
          backendStatus: 'repairing',
          completionNotes: null,
          completionPhotoUrls: [],
          description: 'Den chap chon',
          districtLabel: 'Quan 1',
          id: '11111111-1111-4111-8111-111111111111',
          problemChips: ['Den chap chon'],
          serviceType: 'electrical',
          status: 'repairing',
        },
        workerGate: 'remote_backend',
      })
    })

    await act(async () => {
      await latestWorkflowActions?.workerUpdateStatus('completed_by_worker', {
        completion_notes: 'STAGING QA ONLY: no real repair performed.',
        completion_photo_urls: ['supabase://job-media/11111111-1111-4111-8111-111111111111/after/completed.png'],
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('workflow-completion')).toHaveTextContent(
        'completed_by_worker|STAGING QA ONLY: no real repair performed.|supabase://job-media/11111111-1111-4111-8111-111111111111/after/completed.png',
      )
    })
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

  it('does not let a late active-job bootstrap replace an explicitly hydrated job', async () => {
    mockAuth = {
      role: 'customer',
      session: { user: { id: 'customer-route-owner' } },
    }
    let resolveActiveJob!: (value: unknown) => void
    mockListMyActiveJob.mockReturnValueOnce(new Promise((resolve) => {
      resolveActiveJob = resolve
    }))
    mockGetJob.mockResolvedValueOnce({
      data: buildCustomerJobDetail('job-routed-reviewed', 'reviewed'),
      success: true,
    })
    const screen = render(
      <FrontendWorkflowProvider>
        <WorkflowDealIdProbe />
      </FrontendWorkflowProvider>,
    )
    await waitFor(() => expect(latestWorkflowActions).not.toBeNull())

    await act(async () => {
      await latestWorkflowActions?.hydrateRemoteJobById('job-routed-reviewed')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workflow-deal-id')).toHaveTextContent('job-routed-reviewed')
    })

    await act(async () => {
      resolveActiveJob({
        data: { active_job: buildCustomerJobDetail('job-active-other', 'repairing') },
        success: true,
      })
    })

    expect(screen.getByTestId('workflow-deal-id')).toHaveTextContent('job-routed-reviewed')
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
