import { render, screen, fireEvent } from '@testing-library/react-native'

// Kael Autonomy v2 routes structured intake to the full-screen Kael chat. The
// wizard should not create a job or require the old confirmRemoteSearch gate.

let mockConfirmRemoteSearch: jest.Mock
let mockCreateRemoteJobFromDraft: jest.Mock
let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockSetPendingKaelChatDraft = jest.fn()

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))
jest.mock('@/lib/app-language', () => ({
  useAppLanguage: () => 'vi',
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
}))
jest.mock('../kael-chat/pending-intake', () => ({
  setPendingKaelChatDraft: (draft: unknown) => mockSetPendingKaelChatDraft(draft),
}))
jest.mock('../address-autocomplete', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    AddressAutocomplete: ({ onChange }: { onChange: (label: string, district: string) => void }) =>
      React.createElement(
        Pressable,
        { testID: 'mock-address-set', onPress: () => onChange('Quận 1, TP.HCM', 'Quận 1') },
        React.createElement(Text, null, 'set address'),
      ),
  }
})

import { BookingWizard } from '../booking-wizard'

function buildWorkflow() {
  mockConfirmRemoteSearch = jest.fn(async () => true)
  mockCreateRemoteJobFromDraft = jest.fn(async () => ({ jobId: 'job_test_1' }))
  mockWorkflowValue = {
    actions: {
      createRemoteJobFromDraft: mockCreateRemoteJobFromDraft,
      confirmRemoteSearch: mockConfirmRemoteSearch,
    },
    selectors: { currentStatus: 'broadcasting' },
    state: {
      deal: {
        estimate: {
          problemLabel: 'Chập điện ổ cắm',
          complexity: 'Trung bình',
          priceRangeLabel: '150.000đ - 250.000đ',
          advisory: 'Nên kiểm tra CB tổng',
          disclaimer: 'Ước tính dựa trên thị trường.',
        },
      },
    },
  }
}

beforeEach(() => {
  mockRouteParams = {}
  mockSetPendingKaelChatDraft.mockClear()
  buildWorkflow()
})

function submitDescribe(onOpenKael: jest.Mock) {
  fireEvent.press(screen.getByTestId('booking-wizard-service-electrical'))
  fireEvent.press(screen.getByTestId('booking-wizard-service-next'))
  fireEvent.changeText(
    screen.getByPlaceholderText(/Ví dụ:/),
    'Đèn phòng khách bị chập, có mùi khét nhẹ',
  )
  fireEvent.press(screen.getByTestId('mock-address-set'))
  fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))
  expect(onOpenKael).toHaveBeenCalledWith('electrical')
}

describe('BookingWizard Kael autonomy', () => {
  it('does not call any booking action just by mounting and choosing a service', () => {
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={jest.fn()} />)
    fireEvent.press(screen.getByTestId('booking-wizard-service-electrical'))
    fireEvent.press(screen.getByTestId('booking-wizard-service-next'))
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    expect(mockConfirmRemoteSearch).not.toHaveBeenCalled()
  })

  it('hands structured intake to Kael chat without creating a remote job', () => {
    const onOpenKael = jest.fn()
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)
    submitDescribe(onOpenKael)
    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      addressLabel: 'Quận 1, TP.HCM',
      districtLabel: 'Quận 1',
      mediaCount: 0,
      message: 'Đèn phòng khách bị chập, có mùi khét nhẹ',
      problemChips: [],
      serviceType: 'electrical',
      source: 'booking',
    }))
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    expect(mockConfirmRemoteSearch).not.toHaveBeenCalled()
  })

  it('uses the service route as a direct describe handoff instead of making the user reselect', () => {
    mockRouteParams = { serviceType: 'plumbing' }
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={jest.fn()} />)
    expect(screen.getByTestId('booking-wizard-step-describe')).toBeTruthy()
    expect(screen.queryByTestId('booking-wizard-step-service')).toBeNull()
  })

  it('keeps activity action out of the pre-analysis handoff path', () => {
    const onOpenHistory = jest.fn()
    const onOpenKael = jest.fn()
    render(<BookingWizard onOpenHistory={onOpenHistory} onOpenKael={onOpenKael} />)
    submitDescribe(onOpenKael)
    expect(onOpenHistory).not.toHaveBeenCalled()
  })

  it('does not expose the old confirm-search CTA in the autonomous path', () => {
    const onOpenKael = jest.fn()
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)
    submitDescribe(onOpenKael)
    expect(screen.queryByTestId('booking-wizard-confirm-search')).toBeNull()
    expect(mockConfirmRemoteSearch).not.toHaveBeenCalled()
  })
})
