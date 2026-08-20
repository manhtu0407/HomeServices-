import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { prototypeStyles } from '../jobs/worker-jobs-zip-prototype-surface'

export const PILLAR = {
  id: 'P23-worker-jobs-empty-copy',
  invariant:
    'Worker Jobs empty opportunity copy stays readable beside the approved Prototype Workart without changing workflow affordances',
  authority: [
    'governance/RULES.md (language and visual consistency)',
    'governance/protocols/frontend-test.md G1 (layout and typography) and G2 (state coverage)',
    'governance/design/runtime.md (content remains readable beside contextual Workart)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype-early-stages.tsx',
  layer: 'ui-visual',
  siblings: ['P22-worker-jobs-workart-alpha'],
  mutation:
    'replace the concise empty-state copy or regress the shared metadata text rhythm — the readability contract turns red',
} as const satisfies PillarManifest

describe('Worker Jobs empty opportunity copy contract', () => {
  it('keeps the empty-state message short enough to fit without truncation', () => {
    const opportunitySource = readFileSync(resolve(__dirname, '../jobs/worker-jobs-zip-prototype-early-stages.tsx'), 'utf8')

    withPillarContext(
      PILLAR,
      () => {
        expect(opportunitySource).toContain("textByLanguage(language, 'Kael sẽ gửi khi có việc.', 'Kael will send a job when one is available.')")
        expect(opportunitySource).not.toContain('Cơ hội thật sẽ hiện khi Kael gửi việc tới bạn.')
      },
      'the empty-state message must be concise in both supported languages',
    )
  })

  it('uses a readable body rhythm beside the enlarged Workart', () => {
    const metaText = StyleSheet.flatten(prototypeStyles.opportunityMetaText)

    withPillarContext(
      PILLAR,
      () => {
        expect(metaText).toMatchObject({
          fontSize: 11,
          fontWeight: '600',
          lineHeight: 13,
          includeFontPadding: false,
          textAlignVertical: 'center',
        })
      },
      'empty opportunity copy must remain legible without changing the workflow',
    )
  })

  it('keeps status and scheduled date in one stable metadata row', () => {
    const metadataItem = StyleSheet.flatten(prototypeStyles.opportunityMetaItem)
    const selectedText = StyleSheet.flatten(prototypeStyles.opportunityMetaTextSelected)

    withPillarContext(
      PILLAR,
      () => {
        expect(metadataItem).toMatchObject({ gap: 6, minHeight: 22 })
        expect(selectedText).toMatchObject({ fontWeight: '700' })
      },
      'selected status must be easier to scan while selection and continuation remain behaviorally unchanged',
    )
  })
})
