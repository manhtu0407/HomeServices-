import { customerTheme } from '@/design/theme'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P318-dark-text-contrast',
  invariant:
    'every text colour of the dark theme (text, muted, subtle, primary, status, danger and the mint-button label) reaches WCAG 4.5:1 on each dark surface it is drawn on (black canvas, base card, raised layer and the tinted status surface), so the neutral iOS dark never ships unreadable copy',
  authority: [
    'governance/design/accessible-content.md (text contrast ≥ 4.5:1 in both light and dark)',
    'Apple HIG Dark Mode ("make sure the contrast ratio between colors is no lower than 4.5:1")',
  ],
  target: 'apps/mobile/design/theme.ts',
  layer: 'ui-visual',
  siblings: ['P27-theme-token-resolution'],
  mutation: 'set darkLayer.subtleText back to a mid grey such as #6E6E73 — the subtle-text case turns red',
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

function contrastRatio(foreground: string, background: string) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

const dark = customerTheme.darkLayer
const surfaces = { canvas: dark.canvas, base: dark.base, raised: dark.raised } as const
const textTokens = { text: dark.text, muted: dark.muted, subtleText: dark.subtleText, primary: dark.primary, danger: dark.danger } as const

describe('P318 dark theme text contrast', () => {
  it.each(Object.entries(textTokens))('%s reads at 4.5:1 or better on every dark surface', (name, foreground) => {
    withPillarContext(PILLAR, () => {
      for (const [surface, background] of Object.entries(surfaces)) {
        expect({ pair: `${name} on ${surface}`, ok: contrastRatio(foreground, background) >= 4.5 }).toEqual({ pair: `${name} on ${surface}`, ok: true })
      }
    })
  })

  it('keeps status text and the mint-button label readable', () => {
    withPillarContext(PILLAR, () => {
      expect(contrastRatio(dark.statusText, dark.statusSurface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.text, dark.statusSurface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.primaryText, dark.primary)).toBeGreaterThanOrEqual(4.5)
    })
  })
})
