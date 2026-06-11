import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

// Kael Autonomy v2 routes structured intake to the full-screen Kael chat. The
// wizard should not create a job or require the old confirmRemoteSearch gate.

let mockConfirmRemoteSearch: jest.Mock
let mockCreateRemoteJobFromDraft: jest.Mock
let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockLaunchImageLibraryAsync = jest.fn()
const mockRequestMediaLibraryPermissionsAsync = jest.fn()
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
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: (options: unknown) => mockLaunchImageLibraryAsync(options),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
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
  mockLaunchImageLibraryAsync.mockReset()
  mockLaunchImageLibraryAsync.mockResolvedValue({
    assets: [],
    canceled: true,
  })
  mockRequestMediaLibraryPermissionsAsync.mockReset()
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
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
    expect(screen.getByTestId('booking-wizard-flow-apple-progress-rail')).toBeTruthy()
    expect(screen.getByTestId('booking-wizard-service-segmented-control')).toBeTruthy()
    const intakeShellStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-shell').props.style) as Record<string, unknown>
    const intakeGridStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-grid').props.style) as Record<string, unknown>
    const serviceFieldStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-service-field').props.style) as Record<string, unknown>
    expect(String(intakeShellStyle.backgroundImage ?? intakeShellStyle.background ?? intakeShellStyle.experimental_backgroundImage)).toContain('rgba(76,222,199,0.20)')
    expect(String(intakeGridStyle.backgroundImage ?? intakeGridStyle.background ?? intakeGridStyle.experimental_backgroundImage)).toContain('rgba(76,222,199,0.20)')
    expect(intakeGridStyle.overflow).toBe('hidden')
    expect(serviceFieldStyle.backgroundColor).toBe('transparent')
    expect(serviceFieldStyle.borderWidth).toBe(0)
    expect(serviceFieldStyle.flexGrow).toBe(0)
    expect(screen.getByTestId('booking-wizard-intake-description-field')).toBeTruthy()
    expect(screen.queryByTestId('booking-wizard-service-slider-thumb')).toBeNull()
    fireEvent.press(screen.getByTestId('booking-wizard-service-electrical'))
    expect(screen.getByTestId('booking-wizard-service-slider-thumb')).toBeTruthy()
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
    expect(screen.getByTestId('booking-wizard-apple-ios26-component-system')).toBeTruthy()
    expect(screen.getByTestId('booking-wizard-description-field-shell')).toBeTruthy()
    expect(screen.getByTestId('booking-wizard-photo-rail')).toBeTruthy()
    expect(screen.getByTestId('booking-wizard-voice-capsule')).toBeTruthy()
    expect(screen.queryByTestId('booking-wizard-step-service')).toBeNull()
  })

  it('previews selected media and hands the real photo drafts to Kael chat', async () => {
    const onOpenKael = jest.fn()
    mockRouteParams = { serviceType: 'electrical' }
    mockLaunchImageLibraryAsync.mockResolvedValue({
      assets: [
        {
          fileName: 'burnt-outlet.jpg',
          fileSize: 124000,
          mimeType: 'image/jpeg',
          uri: 'file:///tmp/burnt-outlet.jpg',
        },
      ],
      canceled: false,
    })

    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)

    fireEvent.press(screen.getByTestId('booking-wizard-photo-add'))

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
        allowsMultipleSelection: true,
        mediaTypes: ['images', 'videos'],
        selectionLimit: 5,
      }))
    })
    expect(screen.getByTestId('booking-wizard-photo-preview-0')).toBeOnTheScreen()
    expect(screen.getByText('burnt-outlet.jpg')).toBeOnTheScreen()

    fireEvent.changeText(
      screen.getByPlaceholderText(/Ví dụ:/),
      'Ổ cắm bếp cháy đen và có mùi khét',
    )
    fireEvent.press(screen.getByTestId('mock-address-set'))
    fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      mediaCount: 1,
      photoDrafts: [
        expect.objectContaining({
          fileName: 'burnt-outlet.jpg',
          mimeType: 'image/jpeg',
          uri: 'file:///tmp/burnt-outlet.jpg',
        }),
      ],
    }))
    expect(onOpenKael).toHaveBeenCalledWith('electrical')
  })

  it('keeps selected video evidence as a real video draft for Kael', async () => {
    const onOpenKael = jest.fn()
    mockRouteParams = { serviceType: 'plumbing' }
    mockLaunchImageLibraryAsync.mockResolvedValue({
      assets: [
        {
          fileName: 'ro-ri-ong-nuoc.mp4',
          fileSize: 2450000,
          mimeType: 'video/mp4',
          type: 'video',
          uri: 'file:///tmp/ro-ri-ong-nuoc.mp4',
        },
      ],
      canceled: false,
    })

    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)

    expect(screen.getByText('Thêm hình ảnh / video')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('booking-wizard-photo-add'))

    await waitFor(() => {
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
        mediaTypes: ['images', 'videos'],
      }))
    })
    expect(screen.getByTestId('booking-wizard-video-preview-0')).toBeOnTheScreen()
    expect(screen.getByText('ro-ri-ong-nuoc.mp4')).toBeOnTheScreen()

    fireEvent.changeText(
      screen.getByPlaceholderText(/Ví dụ:/),
      'Ống nước dưới bồn rửa rò liên tục',
    )
    fireEvent.press(screen.getByTestId('mock-address-set'))
    fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      mediaCount: 1,
      photoDrafts: [
        expect.objectContaining({
          fileName: 'ro-ri-ong-nuoc.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          uri: 'file:///tmp/ro-ri-ong-nuoc.mp4',
        }),
      ],
    }))
    expect(onOpenKael).toHaveBeenCalledWith('plumbing')
  })

  it('shows an honest search/filter brief from the real intake fields', () => {
    mockRouteParams = { serviceType: 'plumbing' }
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={jest.fn()} />)

    expect(screen.getByTestId('booking-wizard-filter-brief')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-filter-service')).not.toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('booking-wizard-filter-area')).toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('booking-wizard-filter-issue')).toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('booking-wizard-filter-time')).toHaveTextContent(/Ngay/)
    expect(screen.getByTestId('booking-wizard-filter-payment')).toHaveTextContent(/Kael/)
    expect(screen.getByTestId('booking-wizard-submit-describe')).toHaveTextContent(/^Tiếp tục$/)

    fireEvent.changeText(
      screen.getByPlaceholderText(/Ví dụ:/),
      'Vòi nước rỉ liên tục trong bếp',
    )
    fireEvent.press(screen.getByTestId('mock-address-set'))

    expect(screen.getByTestId('booking-wizard-filter-area')).not.toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('booking-wizard-filter-issue')).toHaveTextContent(/mô tả/)
  })

  it('shows reference priority chips and hands a changed priority to Kael context', () => {
    const onOpenKael = jest.fn()
    mockRouteParams = { serviceType: 'electrical' }
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)

    expect(screen.getByTestId('booking-wizard-priority-chip-normal').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))

    fireEvent.press(screen.getByTestId('booking-wizard-priority-chip-fast'))

    expect(screen.getByTestId('booking-wizard-priority-chip-fast').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))

    fireEvent.changeText(
      screen.getByPlaceholderText(/Ví dụ:/),
      'Ổ cắm bếp chập và có mùi khét',
    )
    fireEvent.press(screen.getByTestId('mock-address-set'))
    fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Ưu tiên: Nhanh'),
      problemChips: [],
    }))
    expect(onOpenKael).toHaveBeenCalledWith('electrical')
  })

  it('sends only user-selected problem chips as search filters to Kael', () => {
    const onOpenKael = jest.fn()
    mockRouteParams = { serviceType: 'electrical' }
    render(<BookingWizard onOpenHistory={jest.fn()} onOpenKael={onOpenKael} />)

    fireEvent.press(screen.getByTestId('booking-wizard-problem-chip-1'))

    expect(screen.getByTestId('booking-wizard-problem-chip-1').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
    expect(screen.getByTestId('booking-wizard-filter-issue')).toHaveTextContent(/1 dấu hiệu/)

    fireEvent.changeText(
      screen.getByPlaceholderText(/Ví dụ:/),
      'Ổ cắm bếp chập và có mùi khét',
    )
    fireEvent.press(screen.getByTestId('mock-address-set'))
    fireEvent.press(screen.getByTestId('booking-wizard-submit-describe'))

    expect(mockSetPendingKaelChatDraft).toHaveBeenCalledWith(expect.objectContaining({
      problemChips: ['Chập ổ cắm'],
    }))
    expect(onOpenKael).toHaveBeenCalledWith('electrical')
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
