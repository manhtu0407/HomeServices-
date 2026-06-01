import { fireEvent, render, screen } from '@testing-library/react-native'
import { buildWorkflowViewModel, LOCAL_WORKFLOW_PRICE_DISCLAIMER, type ServiceType } from '@home-services/shared'
import {
  EstimateCard,
  KaelIntakeReceiptCard,
  KaelPhaseContextCard,
} from '../agentic-parts'
import { KaelChatThread } from '../thread'

jest.mock('@/components/customer/customer-theme', () => ({
  getCustomerThemeTokens: () => ({
    aqua: '#CFF8EF',
    base: '#FFFEFA',
    border: '#D6E7E2',
    borderStrong: '#93CFC5',
    copper: '#9A691D',
    disabled: '#D8E3DF',
    glassHighlight: 'rgba(255,255,255,0.60)',
    ghost: '#EDF6F3',
    mode: 'light',
    muted: '#647672',
    primary: '#087F70',
    primaryText: '#FFFFFF',
    raised: '#FFFFFF',
    service: '#E9F8F3',
    subtleText: '#82928E',
    text: '#13231F',
    warm: '#FFF4DB',
  }),
  getReducedTransparencyCustomerTokens: (tokens: unknown) => tokens,
  useCustomerThemeMode: () => 'light',
}))

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceMotion: false, reduceTransparency: false }),
}))

jest.mock('@/components/ui/glass-surface', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    GlassSurface: ({ children, ...props }: any) => React.createElement(View, props, children),
  }
})

jest.mock('@/lib/app-language', () => ({
  localizedServiceLabel: (serviceType: string, language: 'vi' | 'en' = 'vi') => {
    const labels = {
      vi: {
        cleaning: 'Dọn dẹp nhà',
        electrical: 'Sửa điện',
        plumbing: 'Sửa nước',
      },
      en: {
        cleaning: 'Home cleaning',
        electrical: 'Electrical repair',
        plumbing: 'Plumbing repair',
      },
    }

    return labels[language][serviceType as keyof typeof labels.vi] ?? serviceType
  },
}))

const estimateText = {
  cancellationBody: 'Có thể hủy miễn phí trước khi thợ nhận.',
  complexity: {
    large: 'Lớn',
    medium: 'Vừa',
    small: 'Nhỏ',
  },
  estimateDisclaimerFallback: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  estimateProblemFallback: 'Kael đã phân loại vấn đề.',
  estimateTitle: 'Ước tính của Kael',
  labels: {
    advisory: 'Lưu ý',
    cancellationNote: 'Chính sách hủy',
    complexity: 'Mức độ',
    confidence: 'Độ tin cậy',
    platformFee: 'Phí nền tảng',
    price: 'Khoảng giá',
    problem: 'Vấn đề',
    service: 'Dịch vụ',
    summaryTotal: 'Tổng dự kiến',
  },
  nextAction: {
    await_input: 'Mô tả thêm để Kael phân loại chính xác hơn.',
    confirmed: 'Kael đang tìm thợ.',
    estimate_ready: 'Ước tính đã sẵn sàng để Kael điều phối.',
  },
  orchestrating: 'Đang điều phối',
} as any

const estimate = {
  advisory: 'Kael sẽ cập nhật nếu có bằng chứng phạm vi mới.',
  complexity: 'medium' as const,
  confidence: 0.84,
  disclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  price_max: 320000,
  price_min: 180000,
  problem_category: 'electrical',
  problem_summary: 'Ổ cắm chập chờn',
  service_type: 'electrical' as ServiceType,
}

const threadTokens = {
  aqua: '#CFF8EF',
  base: '#FFFEFA',
  border: '#D6E7E2',
  borderStrong: '#93CFC5',
  copper: '#9A691D',
  disabled: '#D8E3DF',
  ghost: '#EDF6F3',
  mode: 'light',
  muted: '#647672',
  primary: '#087F70',
  primaryText: '#FFFFFF',
  raised: '#FFFFFF',
  service: '#E9F8F3',
  text: '#13231F',
  warm: '#FFF4DB',
} as any

const threadText = {
  ...estimateText,
  history: 'Open activity',
  loading: 'Loading',
  retryIntake: 'Retry intake',
  retryOrchestration: 'Retry orchestration',
  turnFallback: 'Kael is updating this request.',
  welcome: 'Tell Kael what happened.',
} as any

describe('Kael agentic phase cards', () => {
  it('renders Booking handoff as a structured pending intake receipt', () => {
    render(
      <KaelIntakeReceiptCard
        intake={{
          addressLabel: 'Quận 1, TP.HCM',
          districtLabel: 'Quận 1',
          locale: 'vi',
          mediaCount: 2,
          message: 'Ổ cắm phòng khách chập chờn và có mùi khét nhẹ',
          photoDrafts: [],
          problemChips: ['Ổ cắm/công tắc hỏng'],
          serviceType: 'electrical',
          source: 'booking',
        }}
        language="vi"
      />,
    )

    expect(screen.getByText('Kael đã nhận thông tin')).toBeOnTheScreen()
    expect(screen.getByText('Phiếu đặt')).toBeOnTheScreen()
    expect(screen.getByText(/2 ảnh\/video đã chọn/)).toBeOnTheScreen()
    expect(screen.getByText('Ổ cắm phòng khách chập chờn và có mùi khét nhẹ')).toBeOnTheScreen()
  })

  it('renders pending intake phase context without exposing orchestration as live', () => {
    const workflow = buildWorkflowViewModel({ status: null, hasPendingIntake: true })

    render(<KaelPhaseContextCard language="vi" phaseContext={workflow.phaseContext} />)

    expect(screen.getByTestId('customer-kael-chat-phase-context')).toBeOnTheScreen()
    expect(screen.getByText('Tiếp nhận yêu cầu')).toBeOnTheScreen()
    expect(screen.getByText('Phiếu chờ')).toBeOnTheScreen()
    expect(screen.getAllByText(/Phiếu tiếp nhận/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Điều phối ·/)).toBeNull()
  })

  it('keeps estimate_ready as an estimate state until server confirmation starts matching', () => {
    render(
      <EstimateCard
        canStartOrchestration
        estimate={estimate}
        language="vi"
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationStarted={false}
        text={estimateText}
      />,
    )

    expect(screen.getAllByText('Ước tính đã sẵn sàng để Kael điều phối.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Đang điều phối')).toBeNull()
    expect(screen.getByTestId('customer-kael-chat-orchestration').props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    })
  })

  it('lets a failed Booking handoff retry pending intake without unlocking orchestration', () => {
    const retryPendingIntake = jest.fn()

    render(
      <KaelChatThread
        addressDistrict="District 1"
        dispatch={jest.fn()}
        error="Kael could not update this session."
        estimate={null}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={retryPendingIntake}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={{
          addressLabel: 'District 1',
          districtLabel: 'District 1',
          locale: 'en',
          mediaCount: 1,
          message: 'Outlet sparks near the kitchen',
          photoDrafts: [],
          problemChips: ['Outlet issue'],
          serviceType: 'electrical',
          source: 'booking',
        }}
        selectedService="electrical"
        sending={false}
        session={null}
        text={threadText}
        tokens={threadTokens}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: null, hasPendingIntake: true })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-intake-retry')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-kael-chat-orchestration-retry')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-kael-chat-intake-retry'))
    expect(retryPendingIntake).toHaveBeenCalledTimes(1)
  })
})
