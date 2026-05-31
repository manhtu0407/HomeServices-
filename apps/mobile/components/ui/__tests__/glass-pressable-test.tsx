import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { GlassPressable } from '../glass-pressable'
import { createGlassSurfaceStyle } from '../tokens'

// GlassPressable is the shared interactive primitive behind CTAs and controls.
// These assert real interaction + accessibility contracts (touch target behavior,
// disabled safety, button role/name) — the things a money-impacting CTA must honor.
describe('GlassPressable', () => {
  it('renders its children', () => {
    render(
      <GlassPressable accessibilityLabel="Yêu cầu" onPress={() => {}}>
        <Text>Yêu cầu</Text>
      </GlassPressable>,
    )
    expect(screen.getByText('Yêu cầu')).toBeOnTheScreen()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(
      <GlassPressable accessibilityLabel="Yêu cầu" onPress={onPress}>
        <Text>Yêu cầu</Text>
      </GlassPressable>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Yêu cầu' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('keeps the liquid material path opt-in while preserving press behavior', () => {
    const onPress = jest.fn()
    render(
      <GlassPressable accessibilityLabel="Bật nhận việc" material="liquid" onPress={onPress}>
        <Text>Bật nhận việc</Text>
      </GlassPressable>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Bật nhận việc' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses opaque neutral fallback for liquid surfaces when Reduce Transparency is enabled', () => {
    const light = createGlassSurfaceStyle({ material: 'liquid', mode: 'light', reduceTransparency: true, variant: 'hero' })
    const dark = createGlassSurfaceStyle({ material: 'liquid', mode: 'dark', reduceTransparency: true, variant: 'hero' })

    expect(light.backgroundColor).toBe('#FFFFFF')
    expect(dark.backgroundColor).toBe('#161D1B')
    expect(light.boxShadow).toBe('none')
    expect(dark.boxShadow).toBe('none')
  })

  it('does not fire onPress when disabled (no accidental booking)', () => {
    const onPress = jest.fn()
    render(
      <GlassPressable accessibilityLabel="Yêu cầu" disabled onPress={onPress}>
        <Text>Yêu cầu</Text>
      </GlassPressable>,
    )
    fireEvent.press(screen.getByRole('button', { name: 'Yêu cầu' }))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('exposes a disabled accessibility state to assistive tech', () => {
    render(
      <GlassPressable accessibilityLabel="Yêu cầu" disabled onPress={() => {}}>
        <Text>Yêu cầu</Text>
      </GlassPressable>,
    )
    expect(screen.getByRole('button', { name: 'Yêu cầu' })).toBeDisabled()
  })
})
