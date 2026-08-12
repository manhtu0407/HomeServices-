import { Children } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, Text } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

import { component, shadow, typography } from '@/design/theme'
import { FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS, FormulaMintCanvasAura } from '../formula-mint-canvas'
import { FormulaMintCardAura } from '../formula-mint-card'
import { KAEL_CORE_V9_CONTRACT } from '../kael-core-v9-contract'
import { AlphaStop, NativeSafeLinearGradient } from '../svg-alpha-stop'
import { KaelButton, KaelChip, KaelTextField } from '../kael-primitives'

describe('Kael UI primitives', () => {
  it('keeps the primary CTA gradient aligned with the final mint aura colors without extra white overlays', () => {
    expect(component.button.primary.gradient).toEqual(['#31D7C2', '#09B29E', '#077C72'])
    expect(component.button.primary.gradientStops).toEqual([0, 0.5, 1])
    expect(shadow.primary).toEqual({
      boxShadow: '0px 14px 32px rgba(8,125,114,0.24)',
    })
  })

  it('keeps each primary button gradient reference unique on shared screens', () => {
    const { UNSAFE_getAllByType } = render(
      <>
        <KaelButton label="Chọn 3 sao" onPress={jest.fn()} size="small" />
        <KaelButton label="Gửi đánh giá" onPress={jest.fn()} size="small" />
      </>,
    )

    const gradients = UNSAFE_getAllByType(LinearGradient)
    const gradientIds = gradients.map((gradient) => gradient.props.id)
    const fills = UNSAFE_getAllByType(Rect).map((rect) => rect.props.fill)

    expect(new Set(gradientIds).size).toBe(2)
    expect(fills).toEqual(gradientIds.map((gradientId) => `url(#${gradientId})`))
  })

  it('normalizes rgba gradient stops into native-safe hex color plus opacity', () => {
    const { UNSAFE_getAllByType } = render(
      <Svg>
        <Defs>
          <LinearGradient id="test-gradient">
            <AlphaStop offset="0" stopColor="rgba(80,232,210,.34)" />
            <AlphaStop offset="1" stopColor="rgba(151,246,232,0.12)" />
            <AlphaStop offset="1" stopColor="rgba(151,246,232,1.2)" />
            <AlphaStop offset="1" stopColor="rgba(300,260,999,.5)" />
            <AlphaStop offset="1" stopColor="rgba( 1 , 2 , 3 , 0.4 )" stopOpacity={0.2} />
          </LinearGradient>
        </Defs>
      </Svg>,
    )

    const stops = UNSAFE_getAllByType(Stop)
    expect(stops[0].props).toMatchObject({ stopColor: '#50E8D2', stopOpacity: 0.34 })
    expect(stops[1].props).toMatchObject({ stopColor: '#97F6E8', stopOpacity: 0.12 })
    expect(stops[2].props).toMatchObject({ stopColor: '#97F6E8', stopOpacity: 1 })
    expect(stops[3].props).toMatchObject({ stopColor: '#FFFFFF', stopOpacity: 0.5 })
    expect(stops[4].props).toMatchObject({ stopColor: '#010203', stopOpacity: 0.2 })
  })

  it('passes normalized stops directly to react-native-svg before native gradient extraction', () => {
    const { UNSAFE_getByType } = render(
      <Svg>
        <Defs>
          <NativeSafeLinearGradient id="native-safe-gradient">
            <AlphaStop offset="0" stopColor="rgba(80,232,210,0.34)" />
            <AlphaStop offset="1" stopColor="rgba(151,246,232,0)" />
          </NativeSafeLinearGradient>
        </Defs>
      </Svg>,
    )

    const gradient = UNSAFE_getByType(LinearGradient)
    const stops = Children.toArray(gradient.props.children)

    expect(stops).toHaveLength(2)
    expect(stops[0]).toMatchObject({ props: { stopColor: '#50E8D2', stopOpacity: 0.34 } })
    expect(stops[1]).toMatchObject({ props: { stopColor: '#97F6E8', stopOpacity: 0 } })
  })

  it('renders the formula mint canvas with native-safe gradient stops', () => {
    const { getByTestId, UNSAFE_getAllByType } = render(
      <FormulaMintCanvasAura reduceTransparency scope="Customer Chat Test" testID="formula-mint-canvas-test" />,
    )

    expect(getByTestId('formula-mint-canvas-test')).toBeOnTheScreen()
    const stops = UNSAFE_getAllByType(Stop)
    expect(stops.some((stop) => typeof stop.props.stopColor === 'string' && stop.props.stopColor.includes('rgba('))).toBe(false)
    expect(stops.map((stop) => stop.props.stopColor)).toEqual(expect.arrayContaining([
      '#F9FFFD',
      '#F3FBF9',
      '#EDF9F6',
      '#50E8D2',
      '#88F1DF',
      '#53DCCE',
      '#91E8DE',
    ]))
    expect(stops.map((stop) => stop.props.stopOpacity)).toEqual(expect.arrayContaining([0.34, 0.12, 0.22, 0.24, 0.23, 0]))
  })

  it('keeps the card aura visible and preserves a mint fallback when transparency is reduced', () => {
    const { getByTestId, UNSAFE_getAllByType, rerender } = render(
      <FormulaMintCardAura scope="Admin Transaction" testID="formula-mint-card-test" />,
    )

    expect(getByTestId('formula-mint-card-test')).toBeOnTheScreen()
    const stops = UNSAFE_getAllByType(Stop)
    expect(stops.map((stop) => stop.props.stopColor)).toEqual(expect.arrayContaining(['#50E8D2', '#97F6E8', '#53DCCE', '#E6FBF3']))
    expect(stops.map((stop) => stop.props.stopOpacity)).toEqual(expect.arrayContaining([0.28, 0.168, 0.168, 0.112, 0]))

    rerender(<FormulaMintCardAura reduceTransparency scope="Admin Transaction" testID="formula-mint-card-test" />)
    expect(StyleSheet.flatten(getByTestId('formula-mint-card-test').props.style)).toMatchObject({ backgroundColor: '#E6FBF3' })
  })

  it('uses standard SVG radial geometry so the light mint canvas stays consistent on web and native', () => {
    const { UNSAFE_getAllByType } = render(
      <FormulaMintCanvasAura reduceTransparency scope="Customer Home Test" testID="formula-mint-canvas-parity-test" />,
    )

    const gradients = UNSAFE_getAllByType(RadialGradient)
    expect(gradients).toHaveLength(7)
    gradients.forEach((gradient) => {
      expect(gradient.props.gradientUnits).toBe('userSpaceOnUse')
      expect(gradient.props.r).toBe(FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS)
      expect(gradient.props.rx).toBeUndefined()
      expect(gradient.props.ry).toBeUndefined()
    })
  })

  it('uses a dark canvas palette instead of the light mint wash', () => {
    const { UNSAFE_getAllByType } = render(
      <FormulaMintCanvasAura mode="dark" scope="Customer Dark Test" testID="formula-mint-canvas-dark-test" />,
    )

    const stopColors = UNSAFE_getAllByType(Stop).map((stop) => stop.props.stopColor)
    expect(stopColors).toEqual(expect.arrayContaining(['#0B0F0E', '#0E1513', '#101A17', '#32C2A9']))
    expect(stopColors).not.toContain('#F9FFFD')
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

  it('keeps Kael visual identity to one vector core, one Home clip, and one bow interaction', () => {
    expect(KAEL_CORE_V9_CONTRACT).toMatchObject({
      legacyMotionCount: 0,
      legacyStatusCount: 0,
      motionVocabulary: ['autoplay-clip', 'formal-bow'],
      renderer: 'inline-svg',
    })
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

  it('keeps chip and input content visible', () => {
    render(
      <>
        <KaelChip accessibilityState={{ selected: true }} label="Đã chọn" testID="kael-selected-chip" textStyle={{ fontWeight: '600' }} variant="selected" />
        <KaelTextField inputShellAdornment={<Text testID="kael-field-adornment">A</Text>} inputShellTestID="kael-field-shell" placeholder="Nhập nội dung..." value="" />
      </>,
    )

    expect(screen.getByText('Đã chọn')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-selected-chip').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
    expect(screen.getByTestId('kael-field-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-field-adornment')).toBeOnTheScreen()
    expect(screen.getByPlaceholderText('Nhập nội dung...')).toBeOnTheScreen()
  })

  it('keeps the Apple system typography scale from the handoff theme', () => {
    expect(typography.fontFamily).toBe(Platform.OS === 'ios' ? undefined : 'System')
    expect(typography.fontPolicy).toMatchObject({
      dynamicType: true,
      embedFontFiles: false,
      family: 'system',
      resolvedOnIOS: 'SF Pro',
    })
    expect(typography.tabularBody.fontVariant).toEqual(['tabular-nums'])
    expect(typography.h1).toBe(typography.largeTitle)
  })

})
