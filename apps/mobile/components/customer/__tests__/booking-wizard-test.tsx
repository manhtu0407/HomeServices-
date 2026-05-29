import { render, screen, fireEvent } from '@testing-library/react-native'

// A7 is the booking confirmation — the step that actually launches the worker
// search. The money-safety contract: the wizard must NOT call confirmRemoteSearch
// on its own; it fires only on the explicit final confirm press. This test drives
// the real wizard against a mocked frontend-workflow provider (a reusable harness
// for any workflow-coupled surface).

let mockConfirmRemoteSearch: jest.Mock
let mockCreateRemoteJobFromDraft: jest.Mock
let mockWorkflowValue: any

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))
jest.mock('@/lib/app-language', () => ({
  useAppLanguage: () => 'vi',
}))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
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
    selectors: { currentStatus: 'awaiting_customer_confirm' },
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
  buildWorkflow()
})

async function driveToSummary() {
  fireEvent.press(screen.getByTestId('booking-wizard-service-electrical'))
  fireEvent.press(screen.getByTestId('booking-wizard-service-next'))
  fireEvent.changeText(
    screen.getByPlaceholderText(/Ví dụ:/),
    'Đèn phòng khách bị chập, có mùi khét nhẹ',
  )
  fireEvent.press(screen.getByTestId('mock-address-set'))
  fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))
  // async createRemoteJobFromDraft + the analyzing→estimate effect
  fireEvent.press(await screen.findByTestId('booking-wizard-estimate-next'))
  fireEvent.press(screen.getByTestId('booking-wizard-time-now'))
  await screen.findByTestId('booking-wizard-step-summary')
}

describe('BookingWizard A7 confirm', () => {
  it('does not call any booking action just by mounting and choosing a service', () => {
    render(<BookingWizard onOpenHistory={jest.fn()} />)
    fireEvent.press(screen.getByTestId('booking-wizard-service-electrical'))
    fireEvent.press(screen.getByTestId('booking-wizard-service-next'))
    expect(mockCreateRemoteJobFromDraft).not.toHaveBeenCalled()
    expect(mockConfirmRemoteSearch).not.toHaveBeenCalled()
  })

  it('reaches the summary without auto-confirming the worker search', async () => {
    render(<BookingWizard onOpenHistory={jest.fn()} />)
    await driveToSummary()
    expect(mockConfirmRemoteSearch).not.toHaveBeenCalled()
  })

  it('confirms the worker search only on an explicit confirm press', async () => {
    render(<BookingWizard onOpenHistory={jest.fn()} />)
    await driveToSummary()
    fireEvent.press(screen.getByTestId('booking-wizard-confirm-search'))
    await screen.findByTestId('booking-wizard-step-done')
    expect(mockConfirmRemoteSearch).toHaveBeenCalledTimes(1)
  })
})
