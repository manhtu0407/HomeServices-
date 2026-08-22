import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { ProfileDeleteAccountView } from '../../customer/profile/profile-foundation-utility-surfaces'
import { getCustomerThemeTokens } from '../../customer/customer-theme'
import { WorkerV5DeleteAccountBody } from '../profile/delete-account-surfaces'

const mockDeleteAccount = jest.fn()
const mockCustomerDeleteAccount = jest.fn()
const mockOnDeleted = jest.fn()
const mockOnReauthenticate = jest.fn()

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceTransparency: false }),
}))

jest.mock('@/lib/account-deletion-service', () => ({
  accountDeletionErrorMessage: jest.requireActual('@/lib/account-deletion-service').accountDeletionErrorMessage,
  accountDeletionService: { deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args) },
}))

jest.mock('@/lib/services', () => ({
  customerAccountService: { deleteAccount: (...args: unknown[]) => mockCustomerDeleteAccount(...args) },
}))

export const PILLAR = {
  id: 'P41-worker-account-deletion-ui',
  invariant:
    'customer and worker can start account deletion in-app only after both confirmation gates, and a stale session offers an explicit sign-in-again action without deleting data',
  authority: [
    'App Store Review Guideline 5.1.1(v) (account deletion must be initiated in-app)',
    'governance/RULES.md #3 (destructive actions require explicit confirmation)',
    'governance/protocols/frontend-test.md G2 (disabled, ready, failure, and success states)',
  ],
  target: 'apps/mobile/components/worker/profile/delete-account-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P07-worker-verification-states', 'P40-role-aware-account-deletion'],
  mutation:
    'remove either confirmation gate or the explicit reauthentication action — the disabled-state, API, or stale-session cases turn red',
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
    mockCustomerDeleteAccount.mockResolvedValue({
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
        onReauthenticate={mockOnReauthenticate}
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
        onReauthenticate={mockOnReauthenticate}
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
        onReauthenticate={mockOnReauthenticate}
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
        onReauthenticate={mockOnReauthenticate}
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

  it('offers an explicit reauthentication action to both roles when the fresh-login gate rejects', async () => {
    const reauthFailure = {
      success: false,
      code: 'REAUTH_REQUIRED',
      error: 'fresh sign-in required',
      status: 401,
    }
    mockDeleteAccount.mockResolvedValue(reauthFailure)

    const worker = render(
      <WorkerV5DeleteAccountBody
        accessToken="worker-access-token"
        language="vi"
        onDeleted={mockOnDeleted}
        onReauthenticate={mockOnReauthenticate}
      />,
    )
    fireEvent.press(screen.getByTestId('worker-v5-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('worker-v5-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('worker-v5-delete-account-submit'))

    fireEvent.press(await screen.findByTestId('worker-v5-delete-account-reauthenticate'))
    expect(mockOnReauthenticate).toHaveBeenCalledTimes(1)
    expect(mockOnDeleted).not.toHaveBeenCalled()
    worker.unmount()

    mockCustomerDeleteAccount.mockResolvedValue(reauthFailure)
    render(
      <ProfileDeleteAccountView
        accessToken="customer-access-token"
        language="vi"
        onDeleted={mockOnDeleted}
        onReauthenticate={mockOnReauthenticate}
        textInputNoOutlineStyle={undefined}
        tokens={getCustomerThemeTokens('light')}
      />,
    )
    fireEvent.press(screen.getByTestId('customer-v21-profile-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('customer-v21-profile-delete-account-submit'))

    fireEvent.press(await screen.findByTestId('customer-v21-profile-delete-account-reauthenticate'))
    expect(mockOnReauthenticate).toHaveBeenCalledTimes(2)
    expect(mockOnDeleted).not.toHaveBeenCalled()
  })
})
