import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import React from 'react'
import * as ReactNative from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'

import { STAGE_MIN_FONT_SIZE } from '../jobs/stage-ratio'
import { StageTenContent } from '../jobs/stage-ten/stage-ten-content'
import { buildStageTenModel, fitStageTenValueSize } from '../jobs/stage-ten/stage-ten-model'
import { stageTenTokens } from '../jobs/stage-ten/stage-ten-tokens'
import {
  ZIP_STAGE_SCREEN_IDS,
  resolveZipPrototypeSelection,
} from '../jobs/worker-jobs-zip-prototype'
import { stageTwoCardTokens, stageTwoPalette } from '../jobs/worker-jobs-zip-prototype-style-stage-two'
import { getWorkerThemeTokens } from '../worker-theme'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P33-worker-jobs-zip-prototype',
  invariant: 'the approved eleven-stage Jobs surface remains the single visual source for Prototype and Production, with Stage 4 fidelity, workflow transitions, and backend route data kept intact',
  authority: [
    'governance/RULES.md (workflow integrity and visual consistency)',
    'governance/protocols/frontend-test.md G1 (layout) and G2 (state coverage)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype.tsx',
  layer: 'ui-visual',
  siblings: ['P22-worker-jobs-workart-alpha', 'P23-worker-jobs-empty-copy', 'P09-native-ios-liquid-tabs'],
  mutation: 'remove the Stage 4 production surface, its backend map adapter, or its V3 hierarchy markers — the Stage 4 fidelity and boundary assertions turn red',
} as const satisfies PillarManifest

// The layout assertions below are multi-line substrings written with `\n`.
// `core.autocrlf` checks these sources out as CRLF on Windows and LF on the
// Linux CI runner, so reading them raw makes the same commit pass on CI and
// fail on a Windows machine. Every read goes through one normaliser, and
// `sourcesAreNewlineNormalised` below fails if it is ever removed.
const readSource = (...segments: string[]): string =>
  readFileSync(resolve(__dirname, ...segments), 'utf8').replace(/\r\n/g, '\n')

const prototypeHostSource = readSource('../jobs/worker-jobs-zip-prototype.tsx')
const stageTenContentSource = readSource('../jobs/stage-ten/stage-ten-content.tsx')
const stageTenPreviewSource = readSource('../../../app/worker-stage-ten-preview.tsx')
const stageTenModelSource = readSource('../jobs/stage-ten/stage-ten-model.ts')
const stageTenTokensSource = readSource('../jobs/stage-ten/stage-ten-tokens.ts')
const source = [
  'worker-jobs-zip-prototype-surface.tsx',
  'worker-jobs-zip-prototype-shared.tsx',
  'worker-jobs-zip-prototype-early-stages.tsx',
  'worker-jobs-zip-prototype-work-stages.tsx',
  'worker-jobs-zip-prototype-settlement-stages.tsx',
  'worker-jobs-zip-prototype-style-core.ts',
  'worker-jobs-zip-prototype-style-stages.ts',
  'worker-jobs-zip-prototype-style-stage-two.ts',
  'worker-jobs-stage-two-workart.tsx',
  'worker-jobs-zip-prototype-styles.ts',
  'worker-jobs-zip-prototype-route-stage.tsx',
  'worker-jobs-zip-prototype-stage-four.tsx',
  'worker-jobs-zip-prototype-stage-four-styles.ts',
].map((fileName) => readSource('../jobs', fileName)).join('\n')
const stageTwoGlyphList = (constant: string): string[] => {
  const declaration = source.match(new RegExp(`const ${constant} = \\[([^\\]]*)\\] as const`))
  return declaration ? [...declaration[1].matchAll(/'(\w+)'/g)].map((match) => match[1]) : []
}
const STAGE_TWO_ROW_GLYPH_CONSTANTS = {
  address: stageTwoGlyphList('STAGE_TWO_ADDRESS_GLYPHS'),
  price: stageTwoGlyphList('STAGE_TWO_PRICE_GLYPHS'),
  ready: stageTwoGlyphList('STAGE_TWO_READY_GLYPHS'),
  request: stageTwoGlyphList('STAGE_TWO_REQUEST_GLYPHS'),
}
const workerFlowSource = readSource('../worker-v5-flow.tsx')
const evidenceSource = readSource('../../ui/job-evidence-gallery.tsx')
const advisoryStylesSource = readSource('../jobs/advisory-styles.ts')
const progressSource = readSource('../jobs/progress-surfaces.tsx')
const progressStylesSource = readSource('../jobs/progress-styles.ts')

describe('Worker Jobs ZIP Prototype', () => {
  it('reads every source with newlines normalised, so the layout assertions mean the same on Windows and CI', () => {
    for (const [name, text] of Object.entries({
      prototypeHostSource,
      stageTenContentSource,
      stageTenPreviewSource,
      stageTenModelSource,
      stageTenTokensSource,
      source,
      workerFlowSource,
      evidenceSource,
      advisoryStylesSource,
      progressSource,
      progressStylesSource,
    })) {
      withPillarContext(
        PILLAR,
        () => {
          expect(text.includes('\r')).toBe(false)
        },
        `${name} still carries a carriage return, so the multi-line layout substrings below would pass on the Linux runner and fail on a Windows checkout`,
      )
    }
  })

  it('keeps the supplied visual surface and excludes the retired navigator chrome', () => {
    expect(source).toContain('export function WorkerJobsLegacyPrototypeBody')
    expect(source).not.toContain('WorkerJobsLegacyPrototypeNavigator')
    expect(source).not.toContain('Quy trình công việc')
    expect(source).not.toContain('Đặt lại Prototype')
    expect(prototypeHostSource).not.toContain('WorkerJobsPrototypeStageNavigator')
    expect(prototypeHostSource).not.toContain('worker-jobs-prototype-stage-navigator')
    expect(prototypeHostSource).not.toContain('Xem Prototype')
  })

  it('uses alpha Workart assets instead of checkerboard-backed exports', () => {
    expect(source).toContain('worker-jobs-workart-cleaning-transparent.png')
    expect(source).toContain('worker-jobs-workart-handyman-transparent.png')
    expect(source).toContain('worker-jobs-workart-upholstery-transparent.png')
    expect(source).toContain('worker-stage-seven-approval-workart-transparent.png')
    expect(source).toContain('worker-stage-eight-completion-record-workart-transparent.png')
    expect(source).not.toContain('client-booking-workart-cleaning-cutout.png')
    expect(source).not.toContain('client-booking-workart-handyman-cutout.png')
    expect(source).not.toContain('client-booking-workart-upholstery-cutout.png')
    expect(source).not.toContain('worker-stage-seven-approval-workart.png')
  })

  it('places a transparent completion-record Workart in the Stage 8 hero', () => {
    expect(source).toContain('testID="worker-v5-stage-eight-workart"')
    expect(source).toContain('contentFit="contain"')
    expect(source).toContain('stageCompletionWorkart')
  })

  it('maps all eleven review stages to the existing Worker screen IDs', () => {
    expect(ZIP_STAGE_SCREEN_IDS).toHaveLength(11)
    expect(ZIP_STAGE_SCREEN_IDS[0]).toBe('2.1-opportunity-inbox')
    expect(ZIP_STAGE_SCREEN_IDS[9]).toBe('2.12-case-closed')
    expect(ZIP_STAGE_SCREEN_IDS[10]).toBe('2.12-case-closed')
  })

  it('keeps prototype stage query construction in one route helper', () => {
    expect(prototypeHostSource).toContain('const openPrototypeStage = (stage: string) =>')
    expect(prototypeHostSource).toContain('openPrototypeStage(targetStage)')
  })

  it('keeps the payment-confirmed state conditional on Stage 11', () => {
    expect(resolveZipPrototypeSelection({ ns_worker_stage: '10' }).prototypeStage).toBeUndefined()
    expect(resolveZipPrototypeSelection({ ns_worker_stage: '11' }).prototypeStage).toBe('payment-confirmed')
    expect(resolveZipPrototypeSelection({ ns_worker_stage: 'payment-confirmed' }).prototypeStage).toBe('payment-confirmed')
  })

  it('keeps Stage 2 details in tokenized section cards with honest workflow states', () => {
    expect(source).toContain('WorkerJobsStageTwoInfoGroup')
    expect(source).toContain('testID="worker-v5-offer-request-list"')
    expect(source).toContain('testID="worker-v5-offer-address-list"')
    expect(source).toContain('testID="worker-v5-offer-price-list"')
    expect(source).toContain('testID="worker-v5-accept-checklist-card"')
    expect(source).toContain('testID="worker-v5-accept-commitment"')
    expect(source).toContain("const STAGE_TWO_REQUEST_GLYPHS = ['bubble', 'wrench', 'photo'] as const")
    expect(source).toContain("const STAGE_TWO_READY_GLYPHS = ['envelope', 'shieldCheck', 'lock', 'receipt'] as const")
    expect(source).toContain('glyph="clock"')
    expect(source).not.toContain('WorkerRequestDetailsSections')
    expect(source).not.toContain('buildWorkerRequestDetailsGroups')
  })

  it('keeps Stage 4 on the approved V3 hierarchy and the real backend boundary', () => {
    expect(source).toContain('WorkerJobsProductionStageFour')
    expect(source).toContain('stage4-map-hero')
    expect(source).toContain('stage4-destination-chip')
    expect(source).toContain('stage4-eta-sheet')
    expect(source).toContain('stage4-destination-card')
    expect(source).toContain('stage4-metrics')
    expect(source).toContain('stage4-customer-card')
    expect(source).toContain('stage4-customer-note')
    expect(source).toContain('stage4-utility-actions')
    expect(source).toContain('stage4-primary')
    expect(source).toContain('WorkerV5AuthenticatedRouteMapPreview')
    expect(source).toContain('routePreview.mapUri')
    expect(source).toContain('runRouteAction')
    expect(source).not.toContain('travel-work-demo')
    expect(source).not.toContain('__fixtures__')
    expect(source).not.toContain('stage4-refined-map-v3')
    expect(workerFlowSource).toContain('headerState.usesTravelHandoff ? null')
    expect(workerFlowSource).toContain("screen.id === '2.4-route-eta' || screen.id === '5.3-skills-service-area'")
    expect(workerFlowSource).toContain('!usesRouteEtaHandoff')
  })

  it('uses the Booking Workart treatment on the left 40 percent of the Stage 2 summary', () => {
    expect(source).toContain('WorkerStageTwoOfferWorkart')
    expect(source).toContain('panelTestID = \'worker-v5-offer-detail-workart-panel\'')
    expect(source).toContain('testID={panelTestID}')
    expect(source).toContain('contentFit="cover"')
    expect(source).toContain("flexBasis: '40%'")
    expect(source).toContain("width: '40%'")
    expect(source).toContain("panelColor={tokens.mode === 'dark' ? tokens.ghost : '#E8F5F1'}")
    expect(source).toContain('surfaceColor={reduceTransparency ? tokens.base : tokens.raised}')
    expect(source).toContain("borderRadius: 24")
    expect(source).toContain('minHeight: 168')
    expect(source).not.toContain("maxWidth: '56%'")
  })

  it('uses the same Booking Workart treatment for Stage 1 opportunity cards', () => {
    expect(source).toContain('const workartView = (')
    expect(source).toContain('panelColor={workartPanelColor}')
    expect(source).toContain('surfaceColor={surfaceColor}')
    expect(source).toContain('{workartView}{copy}')
    expect(source).toContain("maxWidth: '60%'")
    expect(source).toContain('...typography.title2')
  })
  it('uses distinct semantic glyphs for the section headers and the request, address, price, and readiness rows', () => {
    const rowGlyphs = [
      ...STAGE_TWO_ROW_GLYPH_CONSTANTS.request,
      ...STAGE_TWO_ROW_GLYPH_CONSTANTS.address,
      ...STAGE_TWO_ROW_GLYPH_CONSTANTS.price,
      ...STAGE_TWO_ROW_GLYPH_CONSTANTS.ready,
    ]
    const sectionGlyphs = ['clipboard', 'map', 'coins', 'briefcase']

    expect(rowGlyphs.length).toBeGreaterThan(0)
    expect(new Set(rowGlyphs).size).toBe(rowGlyphs.length)
    for (const glyph of sectionGlyphs) {
      expect(source).toContain(`glyph="${glyph}"`)
      expect(rowGlyphs).not.toContain(glyph)
    }
    expect(source).toContain("const STAGE_TWO_ADDRESS_GLYPHS = ['home', 'user'] as const")
    expect(source).toContain("const STAGE_TWO_PRICE_GLYPHS = ['tag', 'banknote', 'wallet', 'check'] as const")
  })

  it('draws every Stage 2 mark at one size and one weight, with no tile behind it', () => {
    const sharedSource = readSource('../jobs/worker-jobs-zip-prototype-shared.tsx')
    const glyphSizes = sharedSource.match(/size=\{px\(stageTwoGeometry\.glyph\)\}/g) ?? []
    const glyphStrokes = sharedSource.match(/strokeWidth=\{stageTwo\.stroke\.glyph\}/g) ?? []

    expect(glyphSizes).toHaveLength(2)
    expect(glyphStrokes).toHaveLength(2)
    expect(sharedSource).not.toMatch(/StageTwoTile|sectionTile|rowTile|sectionGlyph|rowGlyph/)
    expect(Object.keys(stageTwoCardTokens.geometry)).not.toEqual(expect.arrayContaining(['rowTile', 'sectionTile']))
    expect(stageTwoPalette(getWorkerThemeTokens('light'))).not.toHaveProperty('rowTile')
    expect(stageTwoPalette(getWorkerThemeTokens('light'))).not.toHaveProperty('sectionTile')
  })

  it('keeps the approved Stage 2 card metrics and colours in light mode and the theme tokens in dark mode', () => {
    const light = stageTwoPalette(getWorkerThemeTokens('light'))
    const darkTokens = getWorkerThemeTokens('dark')
    const dark = stageTwoPalette(darkTokens)

    expect(stageTwoCardTokens.canvasWidth).toBe(728)
    expect(stageTwoCardTokens.geometry).toMatchObject({
      cardRadius: 29,
      cardSpacing: 22,
      glyph: 54,
      pillHeight: 50,
    })
    expect(light).toMatchObject({
      glyph: '#11AA8F',
      line: '#E2EAEE',
      sectionTitle: '#0B1D35',
    })
    expect(light.pill.amber.text).toBe('#C67A16')
    expect(light.pill.mint.text).toBe('#0F8F7E')
    expect(light.primary.colors).toEqual(['#20CBB0', '#10B896', '#06977D'])
    expect(dark).toMatchObject({ card: darkTokens.raised, cardBorder: darkTokens.border, glyph: darkTokens.primary })
    expect(dark.primary.glow).toBeNull()
    expect(light.disabled.background).toBe(getWorkerThemeTokens('light').disabled)
  })

  it('keeps direct stage review independent from workflow conditions', () => {
    const stageThree = resolveZipPrototypeSelection({ ns_worker_stage: '3' })
    const stageEleven = resolveZipPrototypeSelection({ ns_worker_stage: '11' })

    expect(stageThree.screen.id).toBe('2.3-customer-confirmation-wait')
    expect(stageEleven.screen.id).toBe('2.12-case-closed')
    expect(stageEleven.prototypeStage).toBe('payment-confirmed')
  })

  it('removes Prototype add-photo pills without removing the upload slots', () => {
    expect(evidenceSource).toContain("styleVariant?: 'default' | 'jobs-review'")
    expect(evidenceSource).toContain('!isJobsReview ? (')
    expect(evidenceSource).toContain('testID={`${testID}-add-${slot}`}')
    expect(evidenceSource).toContain('testID={`${testID}-add-mark-${slot}`}')
  })

  it('uses one flat checklist frame instead of repeated Prototype cards', () => {
    expect(progressSource).toContain('styles.stepRowJobsReviewLast')
    expect(progressSource).toContain('index === items.length - 1')
    expect(progressStylesSource).toContain("backgroundColor: '#FFFFFF'")
    expect(progressStylesSource).toContain('borderBottomWidth: StyleSheet.hairlineWidth')
    expect(progressStylesSource).toContain("backgroundColor: '#F1FBF8'")
  })

  it('separates primary work from contextual active status visually', () => {
    expect(progressSource).toContain('const primaryActiveIndex')
    expect(progressSource).toContain('styles.stepRowJobsReviewContext')
    expect(progressStylesSource).toContain('stepStateJobsReviewContext')
  })

  it('removes the Formula Mint Aura from the ZIP Prototype progress rail only', () => {
    expect(source).toContain('<WorkerV5ProgressRail activeStep={4} formulaAura={false}')
    expect(progressSource).toContain('formulaAura = true')
    expect(progressSource).toContain('{formulaAura ? (')
  })

  it('gives Stage 5 review controls and markers a clearer shared scale', () => {
    expect(advisoryStylesSource).toContain('navButtonTextJobsReview')
    expect(advisoryStylesSource).toContain('...typography.callout')
    expect(progressStylesSource).toContain('borderRadius: 18')
    expect(progressStylesSource).toContain('height: 36')
    expect(progressStylesSource).toContain('width: 36')
    expect(progressStylesSource).toContain('borderWidth: 1')
    expect(progressStylesSource).toContain('fontSize: 17')
    expect(progressSource).toContain('styles.stepStateTextJobsReview')
  })

  it('keeps Stage 10 Concept B aligned to the supplied completion surface', () => {
    expect(stageTenContentSource).not.toContain('testID="stage10-progress"')
    expect(stageTenContentSource).not.toContain('stage10-progress-step-')
    expect(stageTenPreviewSource).not.toContain('previewHeading')
    expect(stageTenPreviewSource).not.toContain('previewTitle')
    expect(stageTenPreviewSource).not.toContain('previewSubtitle')
    expect(stageTenPreviewSource).not.toContain('showProgress')
    expect(stageTenPreviewSource).not.toContain('__fixtures__')
    expect(stageTenPreviewSource).not.toContain('Dữ liệu minh họa')
    expect(stageTenContentSource).toContain('testID="worker-v5-stage-ten-status-workart"')
    expect(stageTenContentSource).toContain('testID="stage10-job-card"')
    expect(stageTenContentSource).toContain('testID="stage10-metric-grid"')
    expect(stageTenContentSource).not.toContain('stage10-summary-icon-frame')
    expect(stageTenContentSource).toContain('name="chart" size={s(25)}')
    expect(stageTenContentSource).not.toContain('comparisonPercent')
    expect(stageTenContentSource).not.toContain('rankPosition')
    expect(stageTenContentSource).not.toContain('Khách hàng rất hài lòng!')
    expect(stageTenContentSource).toContain('STAGE_REFERENCE_SCALE.stageTen')
    expect(stageTenContentSource).toContain('preferred={21.5}')
    expect(stageTenContentSource).toContain('marginTop={s(5)}')
    expect(stageTenContentSource).not.toContain('ScrollView')
    expect(stageTenContentSource).not.toContain('SafeAreaView')
    expect(stageTenModelSource).toContain('payment_state')
    expect(stageTenModelSource).toContain("entry_type === 'worker_credit'")
    expect(stageTenModelSource).not.toContain('supplement')
    expect(stageTenModelSource).not.toContain('rankChange')
    expect(stageTenTokensSource).toContain('referenceContentWidth: 366')
  })

  it('keeps Stage 10 readable, its money uncut, and its summary icons unframed from compact phones to tablets', () => {
    const originalScreen = ReactNative.Dimensions.get('screen')
    const originalWindow = ReactNative.Dimensions.get('window')
    const layout = (width: number) => ({ nativeEvent: { layout: { height: 0, width, x: 0, y: 0 } } })
    const styleOf = (node: { props: { style?: unknown } }) =>
      ReactNative.StyleSheet.flatten(node.props.style as ReactNative.StyleProp<ReactNative.TextStyle>) ?? {}
    const model = buildStageTenModel({
      averageRating: 4.8,
      completedAt: '2026-09-14T03:15:00.000Z',
      district: 'Quận 7',
      jobId: 'job_stage10_fit',
      ledger: [{ entry_type: 'worker_credit', job_id: 'job_stage10_fit', payment_state: 'available', recorded_at: '2026-09-14T03:20:00.000Z', worker_net: 1250000 }],
      performanceScore: 92,
      reviewCount: 12,
      serviceType: 'hvac',
      status: 'paid',
    })

    ReactNative.Dimensions.set({
      screen: { fontScale: 1, height: 568, scale: 2, width: 320 },
      window: { fontScale: 1, height: 568, scale: 2, width: 320 },
    })
    try {
      render(<StageTenContent actions={{ onEarnings: jest.fn(), onRanking: jest.fn() }} language="vi" model={model} photoSource={null} />)
      fireEvent(screen.getByTestId('worker-v5-stage-ten-prototype'), 'layout', layout(280))

      withPillarContext(PILLAR, () => {
        const sizes = screen.UNSAFE_getAllByType(ReactNative.Text).map((node) => styleOf(node).fontSize)
        expect(Math.min(...sizes.map(Number))).toBeGreaterThanOrEqual(STAGE_MIN_FONT_SIZE)
      }, 'a 320pt window must not render any Stage 10 text below the house minimum, whatever the card width')

      withPillarContext(PILLAR, () => {
        const income = screen.getByText('1.250.000đ')
        const unmeasured = styleOf(income).fontSize as number
        fireEvent(screen.getByTestId('stage10-income-frame'), 'layout', layout(82))
        const fitted = styleOf(screen.getByText('1.250.000đ')).fontSize as number
        expect(fitted).toBeLessThan(unmeasured)
        expect(fitted).toBeGreaterThanOrEqual(STAGE_MIN_FONT_SIZE)
        expect(screen.getByText('1.250.000đ').props.numberOfLines).toBeUndefined()
        expect(fitStageTenValueSize('1.250.000đ', 0, 20, 11)).toBe(20)
        expect(fitStageTenValueSize('1.250.000đ', 40, 20, 11)).toBe(11)
        expect(fitStageTenValueSize('1.250.000đ', 82, 20, 11, 2)).toBeLessThan(fitStageTenValueSize('1.250.000đ', 82, 20, 11))
      }, 'a seven-digit amount must shrink to its tile and never be truncated behind numberOfLines')

      withPillarContext(PILLAR, () => {
        const halos = new Set<unknown>([stageTenTokens.mintSoft, stageTenTokens.goldSoft])
        const framed = screen.getByTestId('worker-v5-stage-ten-summary-card').findAll((node) => halos.has(styleOf(node).backgroundColor))
        expect(framed).toHaveLength(0)
        expect(screen.queryByTestId('stage10-summary-icon-frame')).toBeNull()
      }, 'the summary chart and the three metric icons render bare, with no tinted frame behind them')

      withPillarContext(PILLAR, () => {
        const root = styleOf(screen.getByTestId('worker-v5-stage-ten-prototype'))
        expect(root.alignSelf).toBe('center')
        expect(root.maxWidth).toBeLessThanOrEqual(440)
      }, 'on a tablet the completion surface stays at a readable width instead of stretching its phone geometry')
    } finally {
      ReactNative.Dimensions.set({ screen: originalScreen, window: originalWindow })
    }
  })

  it('keeps payment heroes and detail rows flexible on narrow screens', () => {
    expect(source).toContain("offerSummaryCard: {\n    alignItems: 'stretch'")
    expect(source).toContain("offerSummaryCopy: {\n    flex: 1,\n    flexBasis: 196")
    expect(source).toContain("offerSummaryArtwork: {\n    alignSelf: 'stretch',\n    flexBasis: 132")
    expect(source).toContain("maxWidth: 180")
    expect(source).toContain("offerInfoRow: {\n    alignItems: 'flex-start',")
    expect(source).toContain("offerInfoRowStatus: {")
    expect(source).toContain("maxWidth: '42%'")
    expect(source).toContain("fontVariant: ['tabular-nums']")
    expect(source).toContain("stageActionRow: {\n    flexDirection: 'row',\n    flexWrap: 'wrap'")
  })
})
