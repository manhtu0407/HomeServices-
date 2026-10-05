import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color, customerTheme } from '@/design/theme'

import { workerKaelOrbPalette } from '../chat/orb-palette'

export const PILLAR = {
  id: 'P319-worker-kael-chat-dark',
  invariant:
    'the Worker Kael chat draws its header, composer, replies, menus and session list from the shared neutral dark tokens in dark mode, so every text and icon colour reaches 4.5:1 on the black canvas and the raised menu surface, while light mode keeps its existing light-material colours',
  authority: [
    'governance/design/accessible-content.md (text contrast ≥ 4.5:1 in both light and dark)',
    'governance/design/signature.md §2 and §5 (one neutral dark token set for both roles)',
  ],
  target: 'apps/mobile/components/worker/chat/orb-palette.ts',
  layer: 'ui-visual',
  siblings: ['P318-dark-text-contrast'],
  mutation: 'return color.text.strong as the dark ink (the old light ink on a dark screen) — the dark contrast case turns red',
} as const satisfies PillarManifest

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) throw new Error(`expected an opaque #RRGGBB colour, got ${hex}`)
  const [r, g, b] = match.slice(1).map((part) => channel(parseInt(part, 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

describe('P319 Worker Kael chat in dark mode', () => {
  const dark = workerKaelOrbPalette('dark', customerTheme.darkLayer)

  it.each(['ink', 'icon', 'muted', 'secondary', 'accent'] as const)('%s reads at 4.5:1 on the canvas and the raised menu surface', (key) => {
    withPillarContext(PILLAR, () => {
      expect(contrast(dark[key], dark.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark[key], dark.opaqueFill)).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('keeps the light chat on its existing light-material colours', () => {
    const light = workerKaelOrbPalette('light', customerTheme.lightLayer)
    withPillarContext(PILLAR, () => {
      expect(light).toMatchObject({
        composerFill: color.surface.soft,
        headerFill: 'rgba(255,255,255,0.16)',
        icon: color.text.primary,
        ink: color.text.strong,
        muted: color.text.muted,
      })
      expect(dark.canvas).toBe(customerTheme.darkLayer.canvas)
    })
  })
})
