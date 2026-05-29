import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { GlassPressable } from '../glass-pressable'

// GlassPressable is the shared interactive primitive behind CTAs and controls.
// These assert real interaction + accessibility contracts (touch target behavior,
// disabled safety, button role/name) — the things a money-impacting CTA must honor.
describe('GlassPressable', () => {
  it('renders its children', () => {
    render(
      <GlassPressable accessibilityLabel="Đặt lịch" onPress={() => {}}>
        <Text>Đặt lịch</Text>
      </GlassPressable>,
    )
    expect(screen.getByText('Đặt lịch')).toBeOnTheScreen()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(
      <GlassPressable accessibilityLabel="Đặt lịch" onPress={onPress}>
        <Text>Đặt lịch</Text>
      </GlassPressable>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Đặt lịch' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire onPress when disabled (no accidental booking)', () => {
    const onPress = jest.fn()
    render(
      <GlassPressable accessibilityLabel="Đặt lịch" disabled onPress={onPress}>
        <Text>Đặt lịch</Text>
      </GlassPressable>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Đặt lịch' }))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('exposes a disabled accessibility state to assistive tech', () => {
    render(
      <GlassPressable accessibilityLabel="Đặt lịch" disabled onPress={() => {}}>
        <Text>Đặt lịch</Text>
      </GlassPressable>,
    )
    expect(screen.getByRole('button', { name: 'Đặt lịch' })).toBeDisabled()
  })
})
