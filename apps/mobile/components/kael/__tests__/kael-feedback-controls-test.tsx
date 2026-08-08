import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockCustomerSubmit = jest.fn()
const mockWorkerSubmit = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('@/lib/services', () => ({
  customerKaelConversationService: { submitFeedback: (...args: unknown[]) => mockCustomerSubmit(...args) },
  workerKaelChatService: { submitFeedback: (...args: unknown[]) => mockWorkerSubmit(...args) },
}))

import { KaelFeedbackControls, KaelTrustDisclosure } from '../kael-feedback-controls'

beforeEach(() => {
  mockPush.mockReset()
  mockCustomerSubmit.mockReset()
  mockWorkerSubmit.mockReset()
  mockCustomerSubmit.mockResolvedValue({ success: true, data: { feedback_id: 'feedback-1' } })
  mockWorkerSubmit.mockResolvedValue({ success: true, data: { feedback_id: 'feedback-2' } })
})

describe('Kael feedback controls', () => {
  it('sends one structured customer feedback payload per selected rating', async () => {
    render(
      <KaelFeedbackControls
        actor="customer"
        language="vi"
        responseId="response-1"
        testID="customer-feedback"
      />,
    )

    fireEvent.press(screen.getByTestId('customer-feedback-useful'))
    await waitFor(() => expect(mockCustomerSubmit).toHaveBeenCalledWith({
      response_id: 'response-1',
      rating: 'useful',
      source: 'customer_chat',
      language: 'vi',
    }))
    fireEvent.press(screen.getByTestId('customer-feedback-useful'))
    expect(mockCustomerSubmit).toHaveBeenCalledTimes(1)
  })

  it('uses the worker service for worker responses', async () => {
    render(
      <KaelFeedbackControls
        actor="worker"
        language="en"
        responseId="response-2"
        testID="worker-feedback"
      />,
    )

    fireEvent.press(screen.getByTestId('worker-feedback-not-useful'))
    await waitFor(() => expect(mockWorkerSubmit).toHaveBeenCalledWith({
      response_id: 'response-2',
      rating: 'not_useful',
      source: 'worker_chat',
      language: 'en',
    }))
  })

  it('does not issue network I/O for an empty response id', () => {
    render(
      <KaelFeedbackControls actor="customer" language="vi" responseId=" " testID="empty-feedback" />,
    )
    fireEvent.press(screen.getByTestId('empty-feedback-useful'))
    expect(mockCustomerSubmit).not.toHaveBeenCalled()
  })

  it('renders the static disclosure floor and opens the public charter', () => {
    render(<KaelTrustDisclosure language="vi" testID="trust" />)
    expect(screen.getByText(/Kael là trợ lý AI của NestScout/)).toBeTruthy()
    fireEvent.press(screen.getByTestId('trust-charter'))
    expect(mockPush).toHaveBeenCalledWith('/kael-charter')
  })
})
