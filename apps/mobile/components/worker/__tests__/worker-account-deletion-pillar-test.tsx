import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { WorkerV5DeleteAccountBody } from '../profile/delete-account-surfaces'

const mockDeleteAccount = jest.fn()
const mockOnDeleted = jest.fn()

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceTransparency: false }),
}))

jest.mock('@/lib/account-deletion-service', () => ({
  accountDeletionErrorMessage: jest.requireActual('@/lib/account-deletion-service').accountDeletionErrorMessage,
  accountDeletionService: { deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args) },
}))

export const PILLAR = {
  id: 'P41-worker-account-deletion-ui',
  invariant:
    'a worker can start account deletion inside the app only after acknowledging data loss and typing the exact confirmation phrase, then signs out only after the authenticated API succeeds',
  authority: [
    'App Store Review Guideline 5.1.1(v) (account deletion must be initiated in-app)',
    'governance/RULES.md #3 (destructive actions require explicit confirmation)',
    'governance/protocols/frontend-test.md G2 (disabled, ready, failure, and success states)',
  ],
  target: 'apps/mobile/components/worker/profile/delete-account-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P07-worker-verification-states', 'P40-role-aware-account-deletion'],
  mutation:
    'route the action back to Support or remove either the checkbox or exact phrase gate — the disabled-state and API cases turn red',
} as const satisfies PillarManifest

describe('worker in-app account deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDeleteAccount.mockResolvedValue({
      success: true,
      data: {
        account_deleted: true,
        request_id: '77777777-7777-4777-8777-777777777777',
        retained_transaction_records: true,
      },
    })
  })

  it('keeps deletion disabled until both explicit confirmation gates pass', () => {
    render(
      <WorkerV5DeleteAccountBody
        accessToken="worker-access-token"
        language="vi"
        onDeleted={mockOnDeleted}
      />,
    )

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-delete-account-submit')).toBeDisabled()
      expect(screen.queryByTestId('worker-v5-delete-account-open-support')).toBeNull()
    })

    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    expect(screen.getByTestId('worker-v5-delete-account-submit')).toBeDisabled()

    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    expect(screen.getByTestId('worker-v5-delete-account-submit')).not.toBeDisabled()
  })

  it('submits the authenticated idempotent request and signs out after success', async () => {
    render(
      <WorkerV5DeleteAccountBody
        accessToken="worker-access-token"
        language="vi"
        onDeleted={mockOnDeleted}
      />,
    )

    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('worker-v5-delete-account-submit'))

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledWith({
      acknowledge_data_loss: true,
      client_request_id: expect.any(String),
      confirmation: 'XÓA TÀI KHOẢN',
    }, 'worker-access-token'))
    await waitFor(() => expect(mockOnDeleted).toHaveBeenCalledTimes(1))
  })

  it('shows the safe API error and retains the signed-in session on failure', async () => {
    mockDeleteAccount.mockResolvedValue({
      success: false,
      code: 'ACCOUNT_DELETION_BLOCKED_SETTLEMENT',
      error: 'server copy must not leak into the selected language',
      status: 409,
    })
    render(
      <WorkerV5DeleteAccountBody
        accessToken="worker-access-token"
        language="vi"
        onDeleted={mockOnDeleted}
      />,
    )

    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('worker-v5-delete-account-submit'))

    expect(await screen.findByTestId('worker-v5-delete-account-message')).toHaveTextContent(
      'Hãy chờ khoản đối soát hoặc rút tiền đang xử lý hoàn tất trước khi xóa tài khoản.',
    )
    expect(mockOnDeleted).not.toHaveBeenCalled()
  })

  it('renders a localized English blocker instead of leaking server-language copy', async () => {
    mockDeleteAccount.mockResolvedValue({
      success: false,
      code: 'ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB',
      error: 'Bạn còn công việc chưa kết thúc.',
      status: 409,
    })
    render(
      <WorkerV5DeleteAccountBody
        accessToken="worker-access-token"
        language="en"
        onDeleted={mockOnDeleted}
      />,
    )

    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('worker-v5-delete-account-submit'))

    expect(await screen.findByTestId('worker-v5-delete-account-message')).toHaveTextContent(
      'Finish or cancel your active job before deleting the account.',
    )
    expect(screen.queryByText('Bạn còn công việc chưa kết thúc.')).toBeNull()
    expect(mockOnDeleted).not.toHaveBeenCalled()
  })
})
