import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { typography, type AppleTypographyRole } from '@/design/theme'

import { STAGE_MIN_FONT_SIZE, stageTapSize, stageTypeBand, stageTypography } from '../stage-ratio'

export const PILLAR = {
  id: 'P202-stage-typography-scale',
  invariant: 'every eleven-stage Worker Jobs screen resolves text through one canonical Apple type scale — the same 12 Dynamic Type roles Admin Sections already enforces — never a bespoke per-stage size, ratio, or scaling formula',
  authority: [
    'apps/mobile/design/theme.ts Apple semantic typography contract',
    'apps/mobile/components/admin/__tests__/admin-typography-pillar-test.tsx (the sibling contract this one mirrors for Worker Jobs)',
  ],
  target: 'apps/mobile/components/worker/jobs/stage-ratio.ts',
  layer: 'unit',
  siblings: ['P47-admin-semantic-typography', 'P28-text-scale-reflow', 'P33-worker-jobs-zip-prototype'],
  mutation: 'reintroduce a bespoke per-stage font-size ramp or scaling formula, or let a role shrink below the house floor at a narrow width — the shared-scale and floor assertions below turn red',
} as const satisfies PillarManifest

const ROLES: AppleTypographyRole[] = ['largeTitle', 'title1', 'title2', 'title3', 'headline', 'body', 'callout', 'subheadline', 'footnote', 'caption1', 'caption2', 'tabularBody']

describe('stageTypography', () => {
  it('matches the app canonical role exactly at the 390pt reference width', () => {
    withPillarContext(PILLAR, () => {
      for (const role of ROLES) {
        const result = stageTypography(role, 390)
        expect(result.fontSize).toBe(typography[role].fontSize)
        expect(result.lineHeight).toBe(typography[role].lineHeight)
        expect(result.letterSpacing).toBe(typography[role].letterSpacing)
        expect(result.fontWeight).toBe(typography[role].fontWeight)
      }
    }, 'a 390pt window is the design reference; the band must resolve to 1 and hand back the role untouched')
  })

  it('clamps the band to 0.9–1.1 instead of shrinking or growing without bound', () => {
    withPillarContext(PILLAR, () => {
      expect(stageTypeBand(200)).toBeCloseTo(0.9, 5)
      expect(stageTypeBand(390)).toBeCloseTo(1, 5)
      expect(stageTypeBand(900)).toBeCloseTo(1.1, 5)
    }, 'a very narrow or very wide window must not shrink or stretch stage text past the approved band')
  })

  it('floors every role at caption2 fontSize even at the narrow end of the band', () => {
    withPillarContext(PILLAR, () => {
      for (const role of ROLES) {
        expect(stageTypography(role, 200).fontSize as number).toBeGreaterThanOrEqual(STAGE_MIN_FONT_SIZE)
      }
      // caption2 (11) is the one role the narrow band (0.9) would otherwise round below 11 on its own.
      expect(stageTypography('caption2', 200).fontSize).toBe(STAGE_MIN_FONT_SIZE)
    }, 'text under the house floor fails accessibility minimums; a narrow phone must never render smaller than caption2')
  })

  it('scales an oversized numeral off a real role instead of inventing a bespoke size', () => {
    withPillarContext(PILLAR, () => {
      const factor = 47 / 34
      const numeral = stageTypography('largeTitle', 390, factor)
      expect(numeral.fontSize).toBe(Math.round(typography.largeTitle.fontSize * factor))
      expect(numeral.lineHeight).toBe(Math.round(typography.largeTitle.lineHeight * factor))
    }, 'a countdown timer or hero money amount is still largeTitle underneath, just scaled up — not a made-up number')
  })

  it('keeps the tap-size floor independent of the type scale', () => {
    withPillarContext(PILLAR, () => {
      expect(stageTapSize(20, 0.5)).toBe(44)
      expect(stageTapSize(100, 1)).toBe(100)
    }, 'touch targets have their own accessibility floor, unrelated to the text-role floor above')
  })
})
