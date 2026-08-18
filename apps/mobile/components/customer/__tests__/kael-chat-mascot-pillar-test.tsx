import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react-native'

import type { PillarManifest } from '@/__tests__/pillar-manifest'
import { KaelChatMascot } from '../kael-chat/kael-chat-mascot'

export const PILLAR = {
  id: 'P25-customer-kael-chat-mascot',
  invariant:
    'Customer Kael chat surfaces use the shared accessible mascot asset with a static fallback when motion is reduced',
  authority: [
    'governance/RULES.md (accessibility and visual consistency)',
    'governance/protocols/frontend-test.md G1 (layout) and G4 (accessibility)',
    'governance/design/runtime.md (mascot and motion constraints)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/kael-chat-mascot.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P24-worker-earnings-period-palette'],
  mutation:
    'remove the shared mascot integration or its reduced-motion fallback — the customer chat mascot contract turns red',
} as const satisfies PillarManifest

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

describe('Kael Chat mascot production integration', () => {
  const mobileRoot = join(process.cwd())

  it('renders the approved mascot asset with the static accessibility fallback', () => {
    expect(existsSync(join(mobileRoot, 'assets/kael/kael-chat-support-wrap-monocle.png'))).toBe(true)

    render(
      <KaelChatMascot
        accessibilityLabel="Kael đang chờ bạn"
        motion="static"
        reduceMotion
        size={116}
        testID="kael-chat-mascot"
      />,
    )

    expect(screen.getByRole('image', { name: 'Kael đang chờ bạn' })).toBeOnTheScreen()
    expect(screen.getByTestId('kael-chat-mascot-body')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-chat-mascot-bow')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-chat-mascot-blink')).toBeOnTheScreen()
  })

  it('uses the shared mascot on empty, response, case-work, and process surfaces', () => {
    const sources = [
      readFileSync(join(mobileRoot, 'components/customer/kael-chat/kael-empty-hero.tsx'), 'utf8'),
      readFileSync(join(mobileRoot, 'components/customer/kael-chat/kael-response-surface.tsx'), 'utf8'),
      readFileSync(join(mobileRoot, 'components/customer/kael-chat/case-work-response.tsx'), 'utf8'),
      readFileSync(join(mobileRoot, 'components/customer/kael-chat/kael-process-line-view.tsx'), 'utf8'),
    ]

    sources.forEach((source) => expect(source).toContain('KaelChatMascot'))
    expect(sources[0]).not.toContain('KaelCoreV9')
  })
})
