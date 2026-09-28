import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { WorkerV5KaelOrbNavigationSurface } from '../chat/orb-navigation-surface'

export const PILLAR = {
  id: 'P251-worker-kael-mode-pill-fit',
  invariant: 'The Worker Kael mode pill sizes to its label with a 114pt floor, so "Trò chuyện" and "Công việc" are never clipped by a fixed width on any platform or text size',
  authority: ['governance/design/runtime.md (no truncated status copy)', 'kael-accessible-content (no truncation of state labels)'],
  target: 'apps/mobile/components/worker/worker-v5-flow-styles.ts',
  layer: 'ui-visual',
  siblings: ['P207-worker-kael-transcript-follow'],
  mutation: 'restore width: 114 on kaelOrbCustomerModeTrigger or flex: 1 on its press target; the fixed-width assertion turns red (and the web Preview clips the label to "Trò chuy...")',
} as const satisfies PillarManifest

jest.mock('@/components/ui/glass-surface', () => {
  const React = require('react') as typeof import('react')
  const { View } = require('react-native') as typeof import('react-native')
  return {
    GlassSurface: ({ children, ...props }: React.ComponentProps<typeof View>) => React.createElement(View, props, children),
  }
})

jest.mock('@/components/ui/liquid-back-button', () => ({
  LiquidBackButton: () => null,
  LiquidSurfaceOverlay: () => null,
}))

const modeOptions = [
  { description: 'Hỏi đáp và hỗ trợ nhanh', label: 'Trò chuyện', value: 'normal' as const },
  { description: 'Lọc và chuẩn bị cơ hội phù hợp', label: 'Công việc', value: 'intake' as const },
]

it.each(modeOptions)('lets the $label pill grow past its floor instead of clipping', (activeMode) => {
  render(
    <WorkerV5KaelOrbNavigationSurface
      activeMode={activeMode}
      animatedModeMenuContentStyle={{}}
      animatedModeMenuStyle={{}}
      animatedModeTriggerStyle={{}}
      chat={{} as never}
      language="vi"
      mode={activeMode.value}
      modeMenuOpen={false}
      modeOptions={modeOptions}
      onBack={jest.fn()}
      onOpenSession={jest.fn()}
      onSelectMode={jest.fn()}
      onStartNewSession={jest.fn()}
      onToggleModeMenu={jest.fn()}
      onToggleSessionMenu={jest.fn()}
      reduceMotion
      reduceTransparency
      sessionMenuOpen={false}
      showMenus={false}
    />,
  )

  const frame = StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-trigger-frame').props.style)
  const pressTarget = StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-toggle').props.style)
  withPillarContext(PILLAR, () => {
    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent(activeMode.label)
    expect(frame.width).toBeUndefined()
    expect(frame.minWidth).toBe(114)
    expect(pressTarget.flex).toBeUndefined()
    expect(pressTarget.flexGrow).toBe(1)
  }, `mode ${activeMode.value}`)
})
