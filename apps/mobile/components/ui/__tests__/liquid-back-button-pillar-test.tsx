import { fireEvent, render, screen } from '@testing-library/react-native'
import { Circle, Path, RadialGradient, Rect } from 'react-native-svg'

import { LiquidBackButton, LiquidSendArrowIcon, LiquidSurfaceOverlay } from '../liquid-back-button'

describe('LiquidBackButton', () => {
  it('keeps the compact accessible control and preserves its callback', () => {
    const onPress = jest.fn()

    render(<LiquidBackButton label="Quay lại" onPress={onPress} testID="liquid-back-button-test" />)

    const button = screen.getByTestId('liquid-back-button-test')
    expect(button).toHaveProp('accessibilityLabel', 'Quay lại')
    expect(button).toHaveProp('accessibilityRole', 'button')
    expect(screen.getByTestId('liquid-back-button-test-surface')).toHaveStyle({ borderRadius: 25, borderWidth: 1, height: 50, width: 50 })
    expect(screen.getByTestId('liquid-back-button-test-layers')).toBeOnTheScreen()
    expect(button.findAllByType(RadialGradient).length).toBeGreaterThanOrEqual(2)
    expect(button.findAllByType(Rect).length).toBeGreaterThanOrEqual(2)
    expect(button.findAllByType(Circle).length).toBeGreaterThanOrEqual(1)
    expect(button.findAllByType(Path).some((path) => path.props.strokeWidth === 2.35)).toBe(true)

    fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses a symmetric vector arrow for centered send controls', () => {
    render(<LiquidSendArrowIcon color="#0B3732" size={21} testID="liquid-send-arrow-test" />)

    const icon = screen.getByTestId('liquid-send-arrow-test')
    expect(icon).toHaveProp('width', 21)
    expect(icon).toHaveProp('height', 21)
    expect(icon.findAllByType(Path)).toHaveLength(1)
    expect(icon.findAllByType(Path)[0].props.d).toBe('M12 19V5M6.8 10.2 12 5l5.2 5.2')
  })

  it('reuses the liquid layers for non-circular controls', () => {
    render(
      <LiquidSurfaceOverlay
        designHeight={120}
        designWidth={180}
        height={120}
        radius={18}
        testID="liquid-surface-overlay-test"
        width={180}
      />,
    )

    const layers = screen.getByTestId('liquid-surface-overlay-test-layers')
    expect(layers).toBeOnTheScreen()
    expect(layers.findAllByType(Rect).length).toBeGreaterThanOrEqual(2)
  })
})
