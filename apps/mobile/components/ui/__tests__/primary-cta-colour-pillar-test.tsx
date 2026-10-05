import React from 'react'
import { render } from '@testing-library/react-native'
import { LinearGradient, RadialGradient, Stop } from 'react-native-svg'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { PrimaryButton } from '@/components/auth/entry-access/components/materials'
import { StageNineButtonSurface } from '@/components/worker/jobs/stage-nine/stage-nine-button-surface'
import { WorkerV5NavButton, WorkerV5PrimaryButtonFill } from '@/components/worker/ui/primitives-surfaces'
import { component } from '@/design/theme'

import { KaelButton } from '../kael-primitives'
import { PrimaryCtaFill } from '../primary-cta-fill'

let mockMode: 'light' | 'dark' = 'light'
jest.mock('@/components/worker/worker-theme', () => ({
  ...jest.requireActual('@/components/worker/worker-theme'),
  getWorkerThemeModeNow: () => mockMode,
  useWorkerThemeMode: () => mockMode,
}))

export const PILLAR = {
  id: 'P322-primary-cta-colour',
  invariant:
    'every filled primary call-to-action, in Auth, Customer, Worker and Admin and in light and dark, paints the sign-in button recipe through PrimaryCtaFill: the #49CFC0 → #24B3A1 → #088779 horizontal gradient with its soft top-left white light, white rim and mint glow; a primary-variant button that paints its own danger fill opts out',
  authority: [
    'governance/design/signature.md (one mint accent, one primary CTA recipe)',
    'component.button.primary in apps/mobile/design/theme.ts (the single source of the recipe)',
  ],
  target: 'apps/mobile/components/ui/primary-cta-fill.tsx',
  layer: 'ui-visual',
  siblings: ['P318-dark-text-contrast', 'P320-worker-derived-dark-styles'],
  mutation:
    'put #31D7C2 back as the first token stop, or let KaelButton skip PrimaryCtaFill for the primary variant — the recipe stop or the shared-button case turns red',
} as const satisfies PillarManifest

function linearStops(root: ReturnType<typeof render>) {
  const linear = root.UNSAFE_getAllByType(LinearGradient)[0]
  return root.UNSAFE_getAllByType(Stop).filter((stop) => {
    let node: typeof stop | null = stop
    while (node && node !== linear) node = node.parent
    return node === linear
  }).map((stop) => stop.props.stopColor)
}

describe('P322 primary CTA colour', () => {
  afterEach(() => {
    mockMode = 'light'
  })

  it('paints the reference gradient with its top-left light', () => {
    withPillarContext(PILLAR, () => {
      const root = render(<PrimaryCtaFill radius={24} />)
      expect(linearStops(root)).toEqual(['#49CFC0', '#24B3A1', '#088779'])
      expect(root.UNSAFE_getByType(RadialGradient).props).toMatchObject({ cx: '22%', cy: '0%', r: '78%' })
      expect(component.button.primary.border).toBe('rgba(255,255,255,0.68)')
    })
  })

  it('is the fill of the Auth, shared Kael and Worker primary buttons', () => {
    withPillarContext(PILLAR, () => {
      const fills = (element: React.ReactElement) => render(element).UNSAFE_queryAllByType(PrimaryCtaFill).length
      expect(fills(<PrimaryButton label="Đăng nhập" onPress={jest.fn()} />)).toBe(1)
      expect(fills(<KaelButton label="Lưu thay đổi" onPress={jest.fn()} />)).toBe(1)
      expect(fills(<WorkerV5NavButton disabled={false} label="Tiếp tục" onPress={jest.fn()} primary />)).toBe(1)
      expect(fills(<WorkerV5PrimaryButtonFill disabled={false} variant="source" />)).toBe(1)
      expect(fills(<StageNineButtonSurface />)).toBe(1)
    })
  })

  it('keeps the same colours in dark mode and leaves danger and disabled buttons unpainted', () => {
    withPillarContext(PILLAR, () => {
      mockMode = 'dark'
      const worker = render(<WorkerV5NavButton disabled={false} label="Tiếp tục" onPress={jest.fn()} primary />)
      expect(linearStops(worker)).toEqual(['#49CFC0', '#24B3A1', '#088779'])
      expect(render(<KaelButton label="Xóa tài khoản" onPress={jest.fn()} showPrimaryGradient={false} />).UNSAFE_queryAllByType(PrimaryCtaFill)).toHaveLength(0)
      expect(render(<KaelButton disabled label="Lưu" onPress={jest.fn()} />).UNSAFE_queryAllByType(PrimaryCtaFill)).toHaveLength(0)
    })
  })
})
