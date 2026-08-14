import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { LocalDeal } from '@nestscout/shared'

import { CompletionReviewResponse } from '../kael-chat/completion-review-response'
import { getCustomerThemeTokens } from '../customer-theme'

export const PILLAR = {
  id: 'P06-payment-unlock-gate',
  invariant:
    'completion never advances without an explicit customer press, and while the server is handling one press neither decision can fire again',
  authority: [
    'governance/RULES.md #7 (the customer confirms completion before payment begins)',
    'governance/RULES.md #5 (one language per selected mode)',
    'governance/RULES.md #8 (empty states, never fake figures)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/completion-review-response.tsx',
  layer: 'ui-visual',
  siblings: ['P04-remote-snapshot-validation', 'P07-worker-verification-states'],
  mutation:
    'remove `disabled={busy}` from the confirm KaelButton — the in-flight double-press case turns red',
} as const satisfies PillarManifest

const BASE_DEAL = {
  completionNotes: 'Đã vệ sinh và chạy thử ổn định.',
  completionPhotoUrls: ['file:///completion-photo.jpg'],
} as LocalDeal

function mount(overrides: { busy?: boolean; deal?: LocalDeal; language?: 'vi' | 'en' } = {}) {
  const onConfirm = jest.fn()
  const onReportIssue = jest.fn()
  const view = render(
    <CompletionReviewResponse
      busy={overrides.busy ?? false}
      deal={overrides.deal ?? BASE_DEAL}
      language={overrides.language ?? 'vi'}
      onConfirm={onConfirm}
      onReportIssue={onReportIssue}
      tokens={getCustomerThemeTokens('light')}
    />,
  )
  return { onConfirm, onReportIssue, view }
}

describe('CompletionReviewResponse (payment unlock gate)', () => {
  it('advances nothing on mount', () => {
    const { onConfirm, onReportIssue } = mount()
    withPillarContext(
      PILLAR,
      () => {
        expect(onConfirm).not.toHaveBeenCalled()
        expect(onReportIssue).not.toHaveBeenCalled()
      },
      'rendering the surface must never stand in for the customer decision',
    )
  })

  it('reports exactly one decision per explicit press', () => {
    const { onConfirm, onReportIssue } = mount()
    fireEvent.press(screen.getByTestId('customer-v21-completion-confirm'))
    fireEvent.press(screen.getByTestId('customer-v21-completion-report-issue'))
    withPillarContext(
      PILLAR,
      () => {
        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onReportIssue).toHaveBeenCalledTimes(1)
      },
      'a duplicated handler call would confirm completion twice',
    )
  })

  // The window between the first press and the server answer is where a double
  // confirmation would slip through, so both decisions must be inert while busy.
  it('ignores both decisions while a previous press is still in flight', () => {
    const { onConfirm, onReportIssue } = mount({ busy: true })
    fireEvent.press(screen.getByTestId('customer-v21-completion-confirm'))
    fireEvent.press(screen.getByTestId('customer-v21-completion-report-issue'))
    withPillarContext(
      PILLAR,
      () => {
        expect(onConfirm).not.toHaveBeenCalled()
        expect(onReportIssue).not.toHaveBeenCalled()
      },
      'busy=true must block a second confirmation, not merely restyle the button',
    )
  })

  it('exposes the in-flight state to assistive technology', () => {
    mount({ busy: true })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('customer-v21-completion-confirm').props.accessibilityState).toMatchObject({
          busy: true,
          disabled: true,
        })
      },
      'a screen-reader user must hear that the confirmation is already running',
    )
  })

  it.each([
    ['vi', 'Thanh toán chỉ mở sau bước xác nhận này.', 'Payment unlocks only after this confirmation.'],
    ['en', 'Payment unlocks only after this confirmation.', 'Thanh toán chỉ mở sau bước xác nhận này.'],
  ] as const)('states the payment gate in %s only', (language, expected, absent) => {
    mount({ language })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByText(expected)).toBeTruthy()
        expect(screen.queryByText(absent)).toBeNull()
      },
      'mixing both languages in one selected mode breaks the language contract',
    )
  })

  it('renders no evidence gallery and no placeholder figures when no photos exist', () => {
    mount({ deal: { completionNotes: 'Đã xong.' } as LocalDeal })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.queryByTestId('customer-completion-after-gallery')).toBeNull()
        expect(screen.queryByTestId('customer-completion-field-gallery')).toBeNull()
        expect(screen.queryByTestId('customer-completion-customer-gallery')).toBeNull()
        expect(screen.queryByText('0')).toBeNull()
        expect(screen.queryByText('--')).toBeNull()
      },
      'an absent evidence set is an empty state, never a zero',
    )
  })

  it('renders each evidence stage only when that stage has photos', () => {
    mount({
      deal: {
        completionNotes: 'Đã xong.',
        customerEvidencePhotoUrls: ['file:///before.jpg'],
        completionPhotoUrls: ['file:///after.jpg'],
      } as LocalDeal,
    })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('customer-completion-customer-gallery')).toBeTruthy()
        expect(screen.getByTestId('customer-completion-after-gallery')).toBeTruthy()
        expect(screen.queryByTestId('customer-completion-field-gallery')).toBeNull()
      },
      'a stage with no photos must not borrow another stage evidence',
    )
  })
})
