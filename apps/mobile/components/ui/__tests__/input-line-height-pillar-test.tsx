import { render, screen } from '@testing-library/react-native'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { customerV21KaelChatRootStyles } from '@/components/customer/kael-chat/chat-styles'
import { styles as workerV5Styles } from '@/components/worker/worker-v5-flow-styles'

import { withoutInputLineHeight } from '../input-text-style'
import { KaelTextField, KaelTextInput } from '../kael-primitives'

export const PILLAR = {
  id: 'P334-input-line-height',
  invariant:
    'no text input carries a lineHeight: iOS gives typed text a baseline offset the placeholder never gets, so a lineHeight taller than the font draws the placeholder and the text at different heights; every input sizes from the font’s own line, and the Kael chat composers centre that line with 13pt of padding',
  authority: [
    'governance/design/runtime.md (placeholder and typed text share one baseline)',
    'react-native 0.86.2 RCTUITextView.mm / RCTAttributedTextUtils.mm (RCTApplyBaselineOffset runs on typed text, not on the placeholder attributes)',
  ],
  target: 'apps/mobile/components/ui/input-text-style.ts',
  layer: 'ui-visual',
  siblings: ['P316-kael-composer-bottom-inset'],
  mutation:
    'return the flattened style untouched from withoutInputLineHeight, or add a bare TextInput style to a file that skips the helper — the helper, primitive, composer and source-scan cases turn red',
} as const satisfies PillarManifest

function sources(root: string): { path: string; source: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sources(path)
    return entry.name.endsWith('.tsx') ? [{ path: relative(process.cwd(), path).split('\\').join('/'), source: readFileSync(path, 'utf8') }] : []
  })
}

describe('P334 input line height', () => {
  it('drops lineHeight from any style shape and keeps the rest', () => {
    withPillarContext(PILLAR, () => {
      expect(withoutInputLineHeight([{ fontSize: 15, lineHeight: 20 }, null, false, { color: '#000', lineHeight: 30 }])).toEqual({
        color: '#000',
        fontSize: 15,
      })
      expect(withoutInputLineHeight(undefined)).toEqual({})
    })
  })

  it('strips lineHeight inside KaelTextInput and KaelTextField, which cover every shared input', () => {
    withPillarContext(PILLAR, () => {
      render(
        <>
          <KaelTextInput placeholder="a" style={{ fontSize: 15, lineHeight: 30 }} testID="kael-text-input" />
          <KaelTextInput multiline placeholder="b" style={{ fontSize: 15, lineHeight: 30 }} testID="kael-text-input-multiline" />
          <KaelTextField multiline placeholder="c" style={{ lineHeight: 30 }} testID="kael-text-field-multiline" />
          <KaelTextField placeholder="d" style={{ lineHeight: 30 }} testID="kael-text-field" />
        </>,
      )

      for (const testID of ['kael-text-input', 'kael-text-input-multiline', 'kael-text-field-multiline', 'kael-text-field']) {
        expect(StyleSheet.flatten(screen.getByTestId(testID).props.style)).not.toHaveProperty('lineHeight')
      }
      expect(StyleSheet.flatten(screen.getByTestId('kael-text-input').props.style)).toMatchObject({ fontSize: 15 })
    })
  })

  it('keeps lineHeight out of both Kael chat composers and centres the natural line in 44pt', () => {
    withPillarContext(PILLAR, () => {
      for (const composerInput of [
        StyleSheet.flatten(customerV21KaelChatRootStyles.composerInput),
        StyleSheet.flatten(workerV5Styles.kaelOrbComposerInput),
      ]) {
        expect(composerInput).not.toHaveProperty('lineHeight')
        expect(composerInput).toMatchObject({ fontSize: 15, minHeight: 44, paddingVertical: 13 })
      }
    }, 'the ghost overlay reuses this style, so a lineHeight here also offsets the suggestion from the typed text')
  })

  it('routes every TextInput rendered outside the shared primitives through the helper', () => {
    withPillarContext(PILLAR, () => {
      const offenders = [...sources(join(process.cwd(), 'components')), ...sources(join(process.cwd(), 'app'))]
        .filter(({ path }) => !path.endsWith('components/ui/kael-primitives.tsx'))
        .flatMap(({ path, source }) => {
          const inputs = [...source.matchAll(/<TextInput\s/g)].length
          const guarded = [...source.matchAll(/withoutInputLineHeight\(/g)].length
          return inputs > guarded ? [`${path}: ${inputs} TextInput, ${guarded} withoutInputLineHeight`] : []
        })
      expect(offenders).toEqual([])
    }, 'wrap the style of the new TextInput in withoutInputLineHeight(...), or render KaelTextInput / KaelTextField')
  })
})
