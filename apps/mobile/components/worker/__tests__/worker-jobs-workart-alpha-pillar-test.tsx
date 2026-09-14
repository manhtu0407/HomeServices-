import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { prototypeStyles } from '../jobs/worker-jobs-zip-prototype-surface'
import { stageTwoStyles } from '../jobs/worker-jobs-zip-prototype-styles'

export const PILLAR = {
  id: 'P22-worker-jobs-workart-alpha',
  invariant:
    'Worker Jobs Workart has no baked white, mint, or checkerboard background for any supported service or the approval stage, while its visual shell stays transparent',
  authority: [
    'governance/RULES.md (data honesty and visual consistency)',
    'governance/protocols/frontend-test.md G2 (state coverage) and G4 (Reduce Transparency)',
    'governance/design/runtime.md (Workart is context, not a repeated opaque tile)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype-shared.tsx',
  layer: 'ui-visual',
  siblings: ['P06-payment-unlock-gate', 'P08-worker-dock-motion'],
  mutation:
    'map a supported service back to a baked-background asset or restore a repeated Workart tile shell — the asset and shell assertions turn red',
} as const satisfies PillarManifest

const clientImageAsset = (fileName: string) =>
  resolve(__dirname, `../../../assets/client-image-icons/${fileName}`)
const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf8')
const bookingWorkartSource = read('../jobs/worker-jobs-stage-two-workart.tsx')

describe('Worker Jobs Workart background contract', () => {
  it('ships a dedicated transparent asset for every supported Jobs service', () => {
    const opportunitySource = read('../jobs/worker-jobs-zip-prototype-shared.tsx')

    for (const service of ['electrical', 'plumbing', 'cleaning', 'hvac', 'handyman', 'upholstery']) {
      const assetName = `worker-jobs-workart-${service}-transparent.png`

      withPillarContext(
        PILLAR,
        () => {
          expect(existsSync(clientImageAsset(assetName))).toBe(true)
          expect(opportunitySource).toContain(assetName)
          expect(opportunitySource).not.toContain(`client-booking-workart-${service}.png`)
        },
        `${service} must not regress to a baked-background asset`,
      )
    }

    withPillarContext(
      PILLAR,
      () => {
        expect(existsSync(clientImageAsset('worker-stage-seven-approval-workart-transparent.png'))).toBe(true)
        expect(opportunitySource).toContain('worker-stage-seven-approval-workart-transparent.png')
        expect(opportunitySource).not.toContain('worker-stage-seven-approval-workart.png')
      },
      'the approval-stage Workart must use the transparent asset too',
    )
  })

  it('keeps opportunity Workart full-bleed and free of a repeated tile shell', () => {
    const opportunityWorkart = StyleSheet.flatten(stageTwoStyles.heroWorkart)
    const opportunityWorkartPanel = StyleSheet.flatten(stageTwoStyles.heroWorkartPanel)
    const offerSummaryArtwork = StyleSheet.flatten(prototypeStyles.offerSummaryArtwork)

    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(prototypeStyles.opportunityCard)).toMatchObject({ flexDirection: 'row', minHeight: 172 })
        expect(opportunityWorkartPanel).toMatchObject({ flexBasis: '40%', width: '40%', overflow: 'hidden' })
        expect(opportunityWorkart).toMatchObject({ height: '100%', width: '100%' })
        expect(bookingWorkartSource).toContain('customerV21BookingWorkartAssets')
        expect(bookingWorkartSource).toContain('contentFit="cover"')
        expect(opportunityWorkart).not.toHaveProperty('backgroundColor')
        expect(offerSummaryArtwork).not.toHaveProperty('backgroundColor')
      },
      'the Workart must sit directly on the card surface without a white tile or border shell',
    )
  })
})
