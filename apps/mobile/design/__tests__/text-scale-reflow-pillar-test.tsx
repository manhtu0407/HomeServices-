import { scaledTypography, typography } from '@/design/theme'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

// The Dynamic Type steps governance/design/visual-qa.md section 1 names as the capture axis.
const SUPPORTED_SCALES = [1, 1.35, 1.6, 2] as const

const ROLES = [
  'largeTitle',
  'title1',
  'title2',
  'title3',
  'headline',
  'body',
  'callout',
  'subheadline',
  'footnote',
  'caption1',
  'caption2',
] as const

export const PILLAR = {
  id: 'P28-text-scale-reflow',
  invariant:
    'scaledTypography grows line height with font size at every supported Dynamic Type step, so large text reflows instead of clipping',
  authority: [
    'governance/design/accessible-content.md (support large dynamic type; reflow instead of clipping)',
    'governance/design/visual-qa.md section 1 (text scale is provable without a capture)',
  ],
  target: 'apps/mobile/design/theme.ts',
  layer: 'ui-visual',
  siblings: ['P27-theme-token-resolution'],
  mutation:
    'stop scaling line height in scaledTypography (return base.lineHeight unscaled) — at 200% the glyphs outgrow the line box and this pillar goes red',
} as const satisfies PillarManifest

describe('text scale reflow contract', () => {
  it.each(SUPPORTED_SCALES)('keeps line height above font size at %sx', (scale) => {
    for (const role of ROLES) {
      const scaled = scaledTypography(role, scale)
      withPillarContext(
        PILLAR,
        () => expect(scaled.lineHeight).toBeGreaterThan(scaled.fontSize ?? 0),
        `role ${role} at ${scale}x resolved to fontSize ${scaled.fontSize} / lineHeight ${scaled.lineHeight}`,
      )
    }
  })

  it('grows both metrics monotonically with scale', () => {
    for (const role of ROLES) {
      const sizes = SUPPORTED_SCALES.map((scale) => scaledTypography(role, scale))
      for (let i = 1; i < sizes.length; i += 1) {
        withPillarContext(
          PILLAR,
          () => {
            expect(sizes[i].fontSize ?? 0).toBeGreaterThan(sizes[i - 1].fontSize ?? 0)
            expect(sizes[i].lineHeight ?? 0).toBeGreaterThan(sizes[i - 1].lineHeight ?? 0)
          },
          `role ${role} did not grow between ${SUPPORTED_SCALES[i - 1]}x and ${SUPPORTED_SCALES[i]}x`,
        )
      }
    }
  })

  it('falls back to the unscaled role for a nonsense scale', () => {
    withPillarContext(PILLAR, () => {
      expect(scaledTypography('body', 0).fontSize).toBe(typography.body.fontSize)
      expect(scaledTypography('body', Number.NaN).fontSize).toBe(typography.body.fontSize)
    })
  })
})
