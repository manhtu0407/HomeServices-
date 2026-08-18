import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { prototypeStyles } from '../jobs/worker-jobs-legacy-prototype-styles'

export const PILLAR = {
  id: 'P23-worker-jobs-empty-copy',
  invariant:
    'Worker Jobs empty opportunity copy stays readable beside the Workart without changing the copy or workflow affordances',
  authority: [
    'governance/RULES.md (language and visual consistency)',
    'governance/protocols/frontend-test.md G1 (layout and typography) and G2 (state coverage)',
    'governance/design/runtime.md (content remains readable beside contextual Workart)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-legacy-prototype-opportunity.tsx',
  layer: 'ui-visual',
  siblings: ['P22-worker-jobs-workart-alpha'],
  mutation:
    'remove the dedicated empty-state copy style or regress it to the compact footnote treatment — the readability contract turns red',
} as const satisfies PillarManifest

describe('Worker Jobs empty opportunity copy contract', () => {
  it('keeps the empty-state message short enough to fit without truncation', () => {
    const opportunitySource = readFileSync(resolve(__dirname, '../jobs/worker-jobs-legacy-prototype-opportunity.tsx'), 'utf8')

    withPillarContext(
      PILLAR,
      () => {
        expect(opportunitySource).toContain("textByLanguage(language, 'Kael sẽ gửi việc tới bạn.', 'Kael will send you a job.')")
        expect(opportunitySource).not.toContain('Cơ hội thật sẽ hiện khi Kael gửi việc tới bạn.')
      },
      'the empty-state message must be concise in both supported languages',
    )
  })

  it('uses a readable body rhythm beside the enlarged Workart', () => {
    const emptyMeta = StyleSheet.flatten(prototypeStyles.opportunityCardEmptyMeta)

    withPillarContext(
      PILLAR,
      () => {
        expect(emptyMeta).toMatchObject({
          fontSize: 15,
          fontWeight: '500',
          letterSpacing: -0.23,
          lineHeight: 20,
          maxWidth: '100%',
        })
      },
      'empty opportunity copy must remain legible without changing the workflow',
    )
  })

  it('gives the selected status a clearer visual treatment without changing the card workflow', () => {
    const selectedItem = StyleSheet.flatten(prototypeStyles.opportunityMetaItemSelected)
    const selectedText = StyleSheet.flatten(prototypeStyles.opportunityMetaTextSelected)

    withPillarContext(
      PILLAR,
      () => {
        expect(selectedItem).toMatchObject({ gap: 7, minHeight: 28 })
        expect(selectedText).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: '700' })
      },
      'selected status must be easier to scan while selection and continuation remain behaviorally unchanged',
    )
  })
})
