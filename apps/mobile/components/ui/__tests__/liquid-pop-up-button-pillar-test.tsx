import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { LiquidPopUpButton } from '@/components/ui/liquid-pop-up-button'

export const PILLAR = {
  id: 'P293-liquid-pop-up-button',
  invariant: 'the Liquid Glass pop-up button shows the current choice, opens a menu of every option with exactly one checked, commits a choice and closes, and closes on an outside tap without changing the value',
  authority: ['Apple HIG Pop-up buttons (mutually exclusive options; menu closes and the button shows the selection)', 'Apple HIG Menus (checkmark marks the state in effect)', 'WWDC25 284 (a menu from a glass button morphs out of it; tapping elsewhere cancels)'],
  target: 'apps/mobile/components/ui/liquid-pop-up-button.tsx',
  layer: 'ui-visual',
  siblings: ['P292-liquid-tab-plane'],
  mutation: 'check every option, or keep the menu open after a choice, or call onChange from the outside tap — the checked, close or dismiss case turns red',
} as const satisfies PillarManifest

const OPTIONS = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tuần', value: 'week' },
  { label: 'Tháng', value: 'month' },
  { label: 'Năm', value: 'year' },
] as const

function mount(value: (typeof OPTIONS)[number]['value'] = 'month') {
  const onChange = jest.fn()
  render(
    <LiquidPopUpButton
      accessibilityHint="Mở bốn kỳ thu nhập"
      accessibilityLabel="Kỳ thu nhập: Tháng"
      menuAccessibilityLabel="Chọn kỳ thu nhập"
      onChange={onChange}
      options={OPTIONS}
      testID="period"
      tokens={getCustomerThemeTokens('light')}
      value={value}
    />,
  )
  // The RN jest mock never answers measureInWindow; answer it like a device would.
  for (let node = screen.getByTestId('period-trigger').parent; node; node = node.parent) {
    const instance = node.instance as { measureInWindow?: jest.Mock } | null
    if (instance?.measureInWindow?.mockImplementation) {
      instance.measureInWindow.mockImplementation((callback: (x: number, y: number, w: number, h: number) => void) => callback(266, 223, 84, 32))
      break
    }
  }
  return { onChange }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('Liquid Glass pop-up button', () => {
  it('shows the current choice on a collapsed button', () => {
    mount('month')
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByText('Tháng')).toBeTruthy()
        expect(screen.getByTestId('period-trigger').props.accessibilityState).toMatchObject({ expanded: false })
        expect(screen.queryByTestId('period-week')).toBeNull()
      },
      'HIG Pop-up buttons: the button identifies the current selection without being opened',
    )
  })

  it('opens every option with exactly the current one checked', () => {
    mount('month')
    fireEvent.press(screen.getByTestId('period-trigger'))
    const items = screen.getAllByRole('menuitem')
    withPillarContext(
      PILLAR,
      () => {
        expect(items.map((item) => item.props.accessibilityLabel)).toEqual(['Ngày', 'Tuần', 'Tháng', 'Năm'])
        expect(items.filter((item) => item.props.accessibilityState?.checked).map((item) => item.props.accessibilityLabel)).toEqual(['Tháng'])
        expect(screen.getByTestId('period-trigger').props.accessibilityState).toMatchObject({ expanded: true })
      },
      'HIG Menus: a checkmark shows the one option in effect',
    )
  })

  it('commits a choice and closes the menu', () => {
    const { onChange } = mount('month')
    fireEvent.press(screen.getByTestId('period-trigger'))
    fireEvent.press(screen.getByTestId('period-week'))
    act(() => jest.runAllTimers())
    withPillarContext(
      PILLAR,
      () => {
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith('week')
        expect(screen.queryByTestId('period-week')).toBeNull()
      },
      'HIG Pop-up buttons: after people choose an item the menu closes',
    )
  })

  it('lets a VoiceOver user escape the menu without changing the value', () => {
    const { onChange } = mount('month')
    fireEvent.press(screen.getByTestId('period-trigger'))
    fireEvent(screen.getByTestId('period-menu'), 'accessibilityEscape')
    act(() => jest.runAllTimers())
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByTestId('period-menu')).toBeNull()
  })

  it('closes on a tap anywhere else without changing the value', () => {
    const { onChange } = mount('month')
    fireEvent.press(screen.getByTestId('period-trigger'))
    fireEvent.press(screen.getByTestId('period-dismiss', { includeHiddenElements: true }))
    act(() => jest.runAllTimers())
    withPillarContext(
      PILLAR,
      () => {
        expect(onChange).not.toHaveBeenCalled()
        expect(screen.queryByTestId('period-menu')).toBeNull()
      },
      'WWDC25 284: the cancel action is implicit by tapping anywhere else',
    )
  })
})
