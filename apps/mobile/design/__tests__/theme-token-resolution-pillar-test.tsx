import { customerTheme } from '@/design/theme'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P27-theme-token-resolution',
  invariant:
    'customerTheme.darkLayer exposes exactly the light layer key set and resolves every surface token to its own value, so no dark-mode surface silently falls back to a light-mode literal',
  authority: [
    'governance/design/tokens.md (one canonical source, no raw values outside the token boundary)',
    'governance/design/visual-qa.md section 1 (theme is provable without a capture)',
  ],
  target: 'apps/mobile/design/theme.ts',
  layer: 'ui-visual',
  siblings: ['P28-text-scale-reflow'],
  mutation:
    'copy any lightLayer surface value into darkLayer (for example set darkLayer.canvas to signature.bg) — dark mode then renders a light surface and this pillar goes red',
} as const satisfies PillarManifest

describe('theme token resolution contract', () => {
  it('keeps the two layers structurally identical', () => {
    const light = Object.keys(customerTheme.lightLayer).sort()
    const dark = Object.keys(customerTheme.darkLayer).sort()

    withPillarContext(
      PILLAR,
      () => expect(dark).toEqual(light),
      'a key present in one layer and missing from the other means that surface is undefined in one theme',
    )
  })

  it('declares the correct mode on each layer', () => {
    withPillarContext(PILLAR, () => {
      expect(customerTheme.lightLayer.mode).toBe('light')
      expect(customerTheme.darkLayer.mode).toBe('dark')
    })
  })

  it('resolves every surface token to a distinct value per layer', () => {
    const light = customerTheme.lightLayer as Record<string, unknown>
    const dark = customerTheme.darkLayer as Record<string, unknown>
    // `mode` is the one key that is meant to differ by name rather than by value.
    const shared = Object.keys(light)
      .filter((key) => key !== 'mode')
      .filter((key) => light[key] === dark[key])

    withPillarContext(
      PILLAR,
      () => expect(shared).toEqual([]),
      `these tokens hold the same value in both layers, so dark mode renders the light surface: ${shared.join(', ')}`,
    )
  })
})
