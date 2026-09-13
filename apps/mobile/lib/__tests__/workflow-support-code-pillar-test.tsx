import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockUpdateAvailability = jest.fn()
let mockLanguage: 'vi' | 'en' = 'vi'

jest.mock('../auth-provider', () => ({ useAuth: () => ({ role: null, session: null }) }))
jest.mock('../app-language', () => ({ useAppLanguage: () => mockLanguage }))
jest.mock('../media-upload', () => ({ uploadJobMediaDrafts: jest.fn() }))
jest.mock('../customer-avatar-upload', () => ({ uploadCustomerAvatar: jest.fn() }))
jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
  subscribeToWorkerEarnings: jest.fn(() => null),
}))
jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {},
  kaelMemoryService: {},
  notificationService: {},
  workerService: { updateAvailability: (...args: unknown[]) => mockUpdateAvailability(...args) },
}))

import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

export const PILLAR = {
  id: 'P78-workflow-support-code',
  invariant: 'a failed workflow action retains its server support code through the provider and renders only safe selected-language guidance',
  authority: ['governance/RULES.md #8 (honest failure)', 'governance/RULES.md #9 (no sensitive provider details)'],
  target: 'apps/mobile/lib/frontend-workflow-provider.tsx',
  layer: 'integration',
  siblings: ['P73-workflow-language-authority', 'P74-customer-confirmation-relaunch-recovery'],
  mutation: 'pass updated.error instead of the API failure into setRemoteError — the rendered support code and specific guidance disappear',
} as const satisfies PillarManifest

function WorkflowErrorProbe() {
  const { actions, state } = useFrontendWorkflow()
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Update availability" onPress={() => { void actions.workerUpdateAvailability(true) }} />
    <Text testID="workflow-error">{state.lastError}</Text>
  </>
}

describe('workflow support trace propagation', () => {
  it.each([
    ['vi', 'Hãy cập nhật ứng dụng để tiếp tục. Mã hỗ trợ: A1B2C3D4.'],
    ['en', 'Update the app to continue. Support code: A1B2C3D4.'],
  ] as const)('retains a server support code in %s through the real action and provider', async (language, expected) => {
    mockLanguage = language
    mockUpdateAvailability.mockResolvedValue({
      success: false,
      status: 426,
      code: 'CLIENT_UPDATE_REQUIRED',
      error: 'private provider detail: credential=never-display',
      meta: { supportCode: 'A1B2C3D4', operationId: null, releaseId: 'release-test', runId: null, traceId: 'trace-test' },
    })
    render(<FrontendWorkflowProvider><WorkflowErrorProbe /></FrontendWorkflowProvider>)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Update availability' })) })
    await waitFor(() => withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('workflow-error')).toHaveTextContent(expected)
      expect(screen.queryByText(/private provider detail|credential=never-display/)).toBeNull()
    }, `language=${language}; server CLIENT_UPDATE_REQUIRED must retain safe support identity`))
  })
})
