import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import type { IntakeCoverage } from '@nestscout/shared'

const mockConfirm = jest.fn()

jest.mock('@/lib/services', () => ({
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockConfirm(...args),
    get: jest.fn(async () => ({ success: false, status: 404 })),
    getConfirmationOperation: jest.fn(async () => ({ success: false, status: 404 })),
    sendTurn: jest.fn(),
  },
}))

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  getOrCreatePendingConfirmation,
  readPendingConfirmation,
} from '@/lib/frontend-workflow/confirmation-recovery'
import { localizeWorkflowError } from '@/lib/frontend-workflow/errors'

import { getCustomerThemeTokens } from '../customer-theme'
import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import {
  ConfirmationReconciliationResponse,
  IntakeCoverageResponse,
} from '../kael-chat/intake-coverage-response'
import { useCustomerKaelDecisionActions } from '../kael-chat/use-customer-kael-decision-actions'

export const PILLAR = {
  id: 'P46-stage1-customer-intake-mode',
  invariant: 'customer confirmation names the real quote mode, blocks on missing Tier A data, localizes VI/EN, and treats an unknown confirm outcome as reconciliation rather than success or failure',
  authority: [
    'governance/RULES.md #5 (one selected language)',
    'governance/RULES.md #8 (no fake price or workflow claim)',
    'governance/protocols/frontend-test.md G2 (loading, error, retry, confirmation, accessibility)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/intake-coverage-response.tsx',
  layer: 'ui-visual',
  siblings: ['P45-stage1-response-identity', 'P47-stage1-worker-delivery'],
  mutation: 'enable the RFQ action while a Tier A field is missing or label it as a priced booking; this pillar turns red',
} as const satisfies PillarManifest

const coverageOf = (patch: Partial<IntakeCoverage>): IntakeCoverage => ({
  confirmation_kind: 'rfq_request',
  missing_enrichment_slots: ['property_access'],
  missing_required_fields: [],
  next_action: 'rfq_review',
  order_eligible: true,
  policy_id: 'a3d23603-49b0-4a0b-ac64-cb0b922beed9',
  policy_version: 3,
  quote_mode: 'rfq',
  safety_blocker: null,
  ...patch,
})

describe('Stage-1 customer intake modes', () => {
  beforeEach(() => {
    mockConfirm.mockReset()
  })
  it('renders an honest Vietnamese RFQ confirmation with a callable button', () => {
    const onConfirm = jest.fn()
    render(<IntakeCoverageResponse busy={false} coverage={coverageOf({})} language="vi" onConfirm={onConfirm} tokens={getCustomerThemeTokens('light')} />)

    fireEvent.press(screen.getByTestId('customer-stage1-intake-confirm'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Yêu cầu báo giá')).toBeTruthy()
      expect(screen.getByText('Thông tin yêu cầu')).toBeTruthy()
      expect(screen.getByText('Thợ sẽ báo giá sau khi xem yêu cầu. Chưa có giá được xác nhận ở bước này.')).toBeTruthy()
      expect(screen.getByText('Thông tin nên bổ sung (1)')).toBeTruthy()
      expect(screen.queryByText('Tier A · Tier B')).toBeNull()
      expect(onConfirm).toHaveBeenCalledTimes(1)
    }, 'RFQ must not read as an auto-priced booking')
  })

  it('blocks confirmation and names missing Tier A information in English', () => {
    const onConfirm = jest.fn()
    render(<IntakeCoverageResponse
      busy={false}
      coverage={coverageOf({ missing_required_fields: ['scheduled_at'], next_action: 'collect_required', order_eligible: false })}
      language="en"
      onConfirm={onConfirm}
      tokens={getCustomerThemeTokens('light')}
    />)

    fireEvent.press(screen.getByTestId('customer-stage1-intake-confirm'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Required before sending (1)')).toBeTruthy()
      expect(screen.getByText('Request details')).toBeTruthy()
      expect(screen.getByText('Service time')).toBeTruthy()
      expect(screen.queryByText('Tier A · Tier B')).toBeNull()
      expect(screen.getByTestId('customer-stage1-intake-confirm')).toBeDisabled()
      expect(onConfirm).not.toHaveBeenCalled()
    }, 'Tier A is a server policy gate, not a cosmetic checklist')
  })

  it('announces reconciliation without claiming that a job was created', () => {
    render(<ConfirmationReconciliationResponse language="vi" supportCode="DEADBEEF" tokens={getCustomerThemeTokens('light')} />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Đang đối soát xác nhận')).toBeTruthy()
      expect(screen.getByText(/DEADBEEF/)).toBeTruthy()
      expect(screen.queryByText('Đã tạo công việc')).toBeNull()
    }, 'an unknown network outcome stays unknown until GET reconciliation returns')
  })

  it('keeps the same confirmation identity when recovery state is read again', async () => {
    const first = await getOrCreatePendingConfirmation('session-relaunch')
    const restored = await readPendingConfirmation('session-relaunch')

    withPillarContext(PILLAR, () => {
      expect(restored?.idempotencyKey).toBe(first.idempotencyKey)
      expect(restored?.sessionId).toBe('session-relaunch')
    }, 'cold-start recovery must not generate a second confirmation identity')
  })

  it('differentiates policy and no-worker failures in both languages', () => {
    withPillarContext(PILLAR, () => {
      expect(localizeWorkflowError('', 'vi', 'POLICY_VERSION_MISMATCH')).toContain('chính sách tiếp nhận')
      expect(localizeWorkflowError('', 'en', 'NO_REACHABLE_WORKER')).toContain('No suitable worker')
      expect(localizeWorkflowError('', 'en', 'NO_REACHABLE_WORKER')).not.toContain('thợ')
    }, 'policy and matching recovery are different actions and selected language stays clean')
  })

  it('sends one receipt-free RFQ confirmation when the customer double taps', async () => {
    let resolveConfirm!: (value: unknown) => void
    mockConfirm.mockImplementationOnce(() => new Promise((resolve) => {
      resolveConfirm = resolve
    }))
    const setChat = jest.fn()
    const input = {
      chatEstimate: null,
      chatUi: {
        agenticAdjustmentText: '', agenticRejectReason: '', caseQuoteRejectReason: '', confirmingAgenticEstimate: false,
        confirmingCaseQuote: false, confirmingCompletion: false, retryingWorkerSearch: false,
        setAgenticAdjustmentOpen: jest.fn(), setAgenticAdjustmentText: jest.fn(), setAgenticPriceQuestionOpen: jest.fn(),
        setAgenticRejectOpen: jest.fn(), setAgenticRejectReason: jest.fn(), setCaseEditOpen: jest.fn(),
        setCaseQuoteRejectOpen: jest.fn(), setCaseQuoteRejectReason: jest.fn(), setConfirmingAgenticEstimate: jest.fn(),
        setConfirmingCaseQuote: jest.fn(), setConfirmingCompletion: jest.fn(), setRetryingWorkerSearch: jest.fn(),
        setSubmittingAgenticAdjustment: jest.fn(), setSubmittingAgenticRejectReason: jest.fn(), setSubmittingCaseQuoteRejectReason: jest.fn(),
        submittingAgenticAdjustment: false, submittingAgenticRejectReason: false, submittingCaseQuoteRejectReason: false,
      },
      conversation: {
        chat: { session: { id: 'session-rfq-double', intake_coverage: coverageOf({}), quote_mode: 'rfq', service_type: 'electrical' } },
        setAssistantTurns: jest.fn(), setChat, setError: jest.fn(), setLoading: jest.fn(), setLocalMode: jest.fn(), setTurns: jest.fn(), turns: [],
      },
      deal: null,
      kaelRequestGuard: createCustomerKaelRequestGuard('customer-a:session-rfq-double'),
      language: 'vi' as const,
      mode: 'normal' as const,
      processController: { startProcessLines: jest.fn(async () => undefined), stopProcessLines: jest.fn() },
      router: { replace: jest.fn() },
      sessionAccessToken: 'session-token',
      workflow: { actions: { hydrateRemoteJobById: jest.fn() } },
    } as any
    const { result } = renderHook(() => useCustomerKaelDecisionActions(input))
    let first!: Promise<void>
    let second!: Promise<void>

    act(() => {
      first = result.current.confirmAgenticEstimate()
      second = result.current.confirmAgenticEstimate()
    })
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    withPillarContext(PILLAR, () => {
      expect(mockConfirm).toHaveBeenCalledWith(
        'session-rfq-double',
        { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
        'session-token',
        expect.stringMatching(/^confirm:/),
      )
    }, 'double tap shares one operation lane and RFQ does not invent a price receipt')

    await act(async () => {
      resolveConfirm({ data: { job_id: 'job-rfq' }, success: true })
      await Promise.all([first, second])
    })
  })
})
