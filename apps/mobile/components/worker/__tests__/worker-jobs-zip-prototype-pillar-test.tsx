import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ZIP_STAGE_SCREEN_IDS,
  resolveZipPrototypeSelection,
} from '../jobs/worker-jobs-zip-prototype'
import type { PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P33-worker-jobs-zip-prototype',
  invariant: 'the approved eleven-stage Jobs surface remains the single visual source for Prototype and Production, with workflow transitions and route data kept intact',
  authority: [
    'governance/RULES.md (workflow integrity and visual consistency)',
    'governance/protocols/frontend-test.md G1 (layout) and G2 (state coverage)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype.tsx',
  layer: 'ui-visual',
  siblings: ['P22-worker-jobs-workart-alpha', 'P23-worker-jobs-empty-copy', 'P09-native-ios-liquid-tabs'],
  mutation: 'route Production through the retired Jobs surface or change the eleven-stage screen mapping — the source and workflow assertions turn red',
} as const satisfies PillarManifest

const prototypeHostSource = readFileSync(resolve(__dirname, '../jobs/worker-jobs-zip-prototype.tsx'), 'utf8')
const source = [
  'worker-jobs-zip-prototype-surface.tsx',
  'worker-jobs-zip-prototype-shared.tsx',
  'worker-jobs-zip-prototype-early-stages.tsx',
  'worker-jobs-zip-prototype-work-stages.tsx',
  'worker-jobs-zip-prototype-settlement-stages.tsx',
  'worker-jobs-zip-prototype-style-core.ts',
  'worker-jobs-zip-prototype-style-stages.ts',
  'worker-jobs-zip-prototype-style-stage-two.ts',
  'worker-jobs-zip-prototype-styles.ts',
].map((fileName) => readFileSync(resolve(__dirname, '../jobs', fileName), 'utf8')).join('\n')
const evidenceSource = readFileSync(resolve(__dirname, '../../ui/job-evidence-gallery.tsx'), 'utf8')
const advisoryStylesSource = readFileSync(resolve(__dirname, '../jobs/advisory-styles.ts'), 'utf8')
const progressSource = readFileSync(resolve(__dirname, '../jobs/progress-surfaces.tsx'), 'utf8')
const progressStylesSource = readFileSync(resolve(__dirname, '../jobs/progress-styles.ts'), 'utf8')

describe('Worker Jobs ZIP Prototype', () => {
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

  it('keeps the payment-confirmed state conditional on Stage 11', () => {
    expect(resolveZipPrototypeSelection({ ns_worker_stage: '10' }).prototypeStage).toBeUndefined()
    expect(resolveZipPrototypeSelection({ ns_worker_stage: '11' }).prototypeStage).toBe('payment-confirmed')
    expect(resolveZipPrototypeSelection({ ns_worker_stage: 'payment-confirmed' }).prototypeStage).toBe('payment-confirmed')
  })

  it('uses one functional icon frame scale across Stage 2', () => {
    expect(source).toContain('height: 56')
    expect(source).toContain('width: 56')
    expect(source).toContain('borderRadius: 16')
    expect(source).toContain('name={iconNames[index] ?? \'request\'} size={24}')
    expect(source).toContain('name={iconName} size={24}')
    expect(source).toContain('name="time" size={24}')
  })

  it('uses distinct semantic icons for the offer, cleaning, and earnings rows', () => {
    expect(source).toContain("iconNames={['home', 'service', 'photo']}")
    expect(source).toContain("? 'inbox'")
    expect(source).toContain(": 'wallet'")
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

  it('keeps Stage 10 hero focused on the Workart without a duplicate status caption', () => {
    expect(source).toContain('testID="worker-v5-stage-ten-status-workart"')
    expect(source).toContain("stageClosedHero: {")
    expect(source).toContain("flexWrap: 'wrap'")
    expect(source).toContain("stageClosedStatusArtwork: {\n    flexShrink: 1,\n    height: 126,\n    maxWidth: 164,\n    width: '100%',")
    expect(source).not.toContain('stageClosedStatusText')
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
