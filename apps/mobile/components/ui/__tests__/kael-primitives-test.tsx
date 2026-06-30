import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, Text } from 'react-native'
import Svg, { Rect } from 'react-native-svg'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

import { KAEL_CONTEXTUAL_STATES, KAEL_CORE_STATES, KAEL_EMOTIONS, getKaelMascotAssetStatus } from '@/components/kael/kael-mascot-assets'
import { KaelMascot } from '@/components/kael/kael-mascot'
import { component, shadow, typography } from '@/design/theme'
import {
  KaelAlertBadge,
  KaelBadge,
  KaelButton,
  KaelCard,
  KaelChip,
  KaelInlineStepper,
  KaelProgressPill,
  KaelRatingCapsule,
  KaelSegmentedControl,
  KaelSwitch,
  KaelText,
  KaelTextField,
} from '../kael-primitives'

describe('Kael UI primitives', () => {
  it('keeps the primary CTA gradient aligned with the Entry Gate colors without extra white overlays', () => {
    expect(component.button.primary.gradient).toEqual(['#49CFC0', '#24B3A1', '#088779'])
    expect(component.button.primary.gradientStops).toEqual([0, 0.5, 1])
    expect(shadow.primary).toMatchObject({
      shadowColor: '#088779',
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
    })
  })

  it('renders the primary button and handles presses', () => {
    const onPress = jest.fn()

    render(<KaelButton label="Tiếp tục" onPress={onPress} />)

    const button = screen.getByRole('button', { name: 'Tiếp tục' })
    const buttonStyle = StyleSheet.flatten(button.props.style)

    expect(buttonStyle.backgroundColor).toBe('transparent')
    fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('fills small primary buttons with the same pill radius as the Home CTA', () => {
    const onPress = jest.fn()
    const { getByRole, UNSAFE_getAllByType } = render(<KaelButton label="Bắt đầu dịch vụ" onPress={onPress} size="small" />)
    const button = getByRole('button', { name: 'Bắt đầu dịch vụ' })
    const buttonStyle = StyleSheet.flatten(button.props.style)

    expect(buttonStyle.borderRadius).toBe(18)
    expect(UNSAFE_getAllByType(Svg)[0].props.viewBox).toBe('0 0 100 36')
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(1)
    expect(UNSAFE_getAllByType(Rect)[0].props).toMatchObject({
      height: 36,
    })
    expect(UNSAFE_getAllByType(Rect)[0].props.rx).toBeUndefined()
  })

  it('keeps the full official mascot state and emotion taxonomy addressable', () => {
    expect(KAEL_CORE_STATES).toHaveLength(10)
    expect(KAEL_CONTEXTUAL_STATES).toHaveLength(10)
    expect(KAEL_EMOTIONS).toHaveLength(10)
    expect([...KAEL_CORE_STATES, ...KAEL_CONTEXTUAL_STATES]).toEqual([
      'welcome',
      'listening',
      'thinking',
      'analyzing',
      'processing',
      'understood',
      'proposing',
      'success',
      'warning',
      'error',
      'typing',
      'recording',
      'fileReview',
      'locationMap',
      'findingWorker',
      'priceCheck',
      'compareOptions',
      'report',
      'reminder',
      'miniCelebration',
    ])
  })

  it('prevents disabled primary actions from firing', () => {
    const onPress = jest.fn()

    render(<KaelButton disabled label="Tiếp tục" onPress={onPress} />)

    fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(onPress).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })

  it('preserves explicit button accessibility state overrides', () => {
    const onPress = jest.fn()

    render(<KaelButton accessibilityState={{ busy: true, expanded: true }} disabled label="Đang xử lý" onPress={onPress} testID="kael-stateful-button" />)

    expect(screen.getByTestId('kael-stateful-button').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
      expanded: true,
    })
  })

  it('keeps button adornments visible without replacing the action label', () => {
    const onPress = jest.fn()

    render(<KaelButton label="Google" leftAdornment={<Text testID="kael-button-adornment">G</Text>} onPress={onPress} />)

    expect(screen.getByTestId('kael-button-adornment')).toHaveTextContent('G')
    fireEvent.press(screen.getByRole('button', { name: 'Google' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('keeps segmented control option ids and disabled state stable', () => {
    const onChange = jest.fn()

    const options = [
      { label: 'Male', testID: 'kael-segment-male', value: 'male' },
      { label: 'Female', testID: 'kael-segment-female', value: 'female' },
    ] as const

    const { rerender } = render(
      <KaelSegmentedControl
        onChange={onChange}
        options={options}
        testID="kael-segmented-control"
        value="male"
      />,
    )

    fireEvent.press(screen.getByTestId('kael-segment-female'))
    expect(onChange).toHaveBeenCalledWith('female')

    rerender(
      <KaelSegmentedControl
        disabled
        onChange={onChange}
        options={options}
        testID="kael-segmented-control"
        value="male"
      />,
    )
    fireEvent.press(screen.getByTestId('kael-segment-female'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('kael-segment-female')).toBeDisabled()
  })

  it('keeps inline stepper controls addressable and disabled when bounded', () => {
    const onDecrement = jest.fn()
    const onIncrement = jest.fn()

    render(
      <KaelInlineStepper
        decrementButtonTestID="kael-stepper-minus"
        decrementDisabled
        incrementButtonTestID="kael-stepper-plus"
        incrementLabel="Increase"
        onDecrement={onDecrement}
        onIncrement={onIncrement}
        testID="kael-inline-stepper"
        value="8 km"
        valueTestID="kael-stepper-value"
      />,
    )

    fireEvent.press(screen.getByTestId('kael-stepper-minus'))
    fireEvent.press(screen.getByTestId('kael-stepper-plus'))

    expect(screen.getByTestId('kael-stepper-value')).toHaveTextContent('8 km')
    expect(screen.getByTestId('kael-stepper-minus')).toBeDisabled()
    expect(onDecrement).not.toHaveBeenCalled()
    expect(onIncrement).toHaveBeenCalledTimes(1)
  })

  it('keeps chip, input, and card content visible', () => {
    render(
      <KaelCard>
        <KaelChip accessibilityState={{ selected: true }} label="Đã chọn" testID="kael-selected-chip" textStyle={{ fontWeight: '600' }} variant="selected" />
        <KaelTextField inputShellAdornment={<KaelText testID="kael-field-adornment">A</KaelText>} inputShellTestID="kael-field-shell" placeholder="Nhập nội dung..." value="" />
        <Text>Card content</Text>
      </KaelCard>,
    )

    expect(screen.getByText('Đã chọn')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-selected-chip').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
    expect(screen.getByTestId('kael-field-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-field-adornment')).toBeOnTheScreen()
    expect(screen.getByPlaceholderText('Nhập nội dung...')).toBeOnTheScreen()
    expect(screen.getByText('Card content')).toBeOnTheScreen()
  })

  it('renders copy through the Apple system typography scale from the handoff theme', () => {
    render(<KaelText testID="kael-typography-h1" variant="h1">NestScout</KaelText>)

    const style = StyleSheet.flatten(screen.getByTestId('kael-typography-h1').props.style)
    expect(typography.fontFamily).toBe(Platform.OS === 'ios' ? undefined : 'System')
    expect(typography.fontPolicy).toMatchObject({
      dynamicType: true,
      embedFontFiles: false,
      family: 'system',
      resolvedOnIOS: 'SF Pro',
    })
    expect(typography.tabularBody.fontVariant).toEqual(['tabular-nums'])
    expect(typography.h1).toBe(typography.largeTitle)
    expect(style).toMatchObject({
      fontFamily: typography.fontFamily,
      fontSize: typography.largeTitle.fontSize,
      fontWeight: typography.largeTitle.fontWeight,
      letterSpacing: 0,
      lineHeight: typography.largeTitle.lineHeight,
    })
  })

  it('renders the Component System status and utility primitives', () => {
    const onSwitch = jest.fn()

    render(
      <>
        <KaelSwitch accessibilityLabel="Availability" onValueChange={onSwitch} testID="kael-switch" value={false} />
        <KaelBadge label="Moi" testID="kael-badge" />
        <KaelProgressPill testID="kael-progress" value={0.66} />
        <KaelRatingCapsule rating={4.8} testID="kael-rating" />
        <KaelAlertBadge count={3} testID="kael-alert-badge" />
        <KaelAlertBadge count={0} testID="kael-hidden-alert-badge" />
      </>,
    )

    fireEvent.press(screen.getByRole('switch', { name: 'Availability' }))

    expect(onSwitch).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('kael-badge')).toHaveTextContent('Moi')
    expect(screen.getByTestId('kael-progress').props.accessibilityValue).toMatchObject({ now: 66 })
    expect(screen.getByTestId('kael-rating')).toHaveTextContent(/4\.8\/5/)
    expect(screen.getByTestId('kael-alert-badge')).toHaveTextContent('3')
    expect(screen.queryByTestId('kael-hidden-alert-badge')).toBeNull()
  })

  it('uses official mascot board assets for states and emotions', () => {
    expect(getKaelMascotAssetStatus('findingWorker')).toBe('state')
    expect(getKaelMascotAssetStatus('welcome', 'happy')).toBe('emotion')

    render(<KaelMascot state="findingWorker" />)
    expect(screen.getByTestId('kael-mascot-findingWorker').props.accessibilityRole).toBe('image')
    expect(screen.getByTestId('kael-mascot-findingWorker').props.accessibilityLabel).toBe('Kael findingWorker')

    expect(screen.queryByText(/Asset/)).toBeNull()
  })
})
