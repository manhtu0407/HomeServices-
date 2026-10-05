import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { LiquidPillButton, liquidPillPalette } from '../liquid-pill-button'
import { NormalChatStarterRail } from '../normal-chat-starter-rail'

export const PILLAR = {
  id: 'P314-kael-chat-liquid-controls',
  invariant:
    'Kael chat pill controls (starter chips, the latest-reply pill) use the header "+ Chat" liquid glass material in light and dark instead of a fixed solid fill, and fall back to an opaque themed surface with no glass layers when the person turns on Reduce Transparency',
  authority: [
    'governance/design.md (one material per control family; the header liquid pill is the reference)',
    'governance/design/runtime.md (Reduce Transparency removes glass)',
  ],
  target: 'apps/mobile/components/ui/liquid-pill-button.tsx',
  layer: 'ui-visual',
  siblings: ['P313-kael-chat-turn-images'],
  mutation:
    'give liquidPillPalette.light a solid mint fill, or drop the opaque themed colour under Reduce Transparency — the material or fallback case turns red',
} as const satisfies PillarManifest

const mockGlass = { reduceMotion: true, reduceTransparency: false }
jest.mock('../accessibility-motion', () => ({
  ...jest.requireActual('../accessibility-motion'),
  useGlassAccessibility: () => mockGlass,
}))

function renderPill(mode: 'light' | 'dark') {
  const onPress = jest.fn()
  render(
    <LiquidPillButton accessibilityLabel="Phần mới" mode={mode} onPress={onPress} opaqueBackgroundColor="#123456" opaqueBorderColor="#D8EBE8" testID="pill">
      <Text>Phần mới</Text>
    </LiquidPillButton>,
  )
  return onPress
}

describe('P314 Kael chat liquid controls', () => {
  afterEach(() => { mockGlass.reduceTransparency = false })

  it.each(['light', 'dark'] as const)('uses the header liquid glass in %s mode', (mode) => {
    const onPress = renderPill(mode)
    withPillarContext(PILLAR, () => {
      expect(liquidPillPalette.light).toEqual({ background: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.72)' })
      expect(screen.getByTestId('pill-surface')).toHaveStyle({ backgroundColor: liquidPillPalette[mode].background, borderRadius: 22, minHeight: 44 })
      expect(screen.getByTestId('pill-liquid-layers', { includeHiddenElements: true })).toBeTruthy()
    })
    fireEvent.press(screen.getByTestId('pill'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('falls back to an opaque themed surface without glass layers under Reduce Transparency', () => {
    mockGlass.reduceTransparency = true
    renderPill('light')
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('pill-surface')).toHaveStyle({ backgroundColor: "#123456" })
      expect(screen.queryByTestId('pill-liquid-layers', { includeHiddenElements: true })).toBeNull()
    })
  })

  it('renders starter chips in dark glass with themed text, not the old light mint fill', () => {
    render(
      <NormalChatStarterRail
        actorRole="customer"
        colors={{ opaqueBackground: '#1C2422', opaqueBorder: '#2D3A37', text: '#EAF1EF' }}
        language="vi"
        mode="dark"
        onSelect={jest.fn()}
        visible
      />,
    )
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('normal-chat-starter-what-can-kael-do-surface')).toHaveStyle({ backgroundColor: liquidPillPalette.dark.background })
      expect(screen.getByTestId('normal-chat-starter-what-can-kael-do-surface')).not.toHaveStyle({ backgroundColor: '#F2FAF9' })
      expect(screen.getByText('Kael giúp được gì?')).toHaveStyle({ color: '#EAF1EF' })
    })
  })
})
