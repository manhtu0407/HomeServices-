import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color, customerTheme } from '@/design/theme'

import { deriveWorkerDarkStyles } from '../ui/worker-dark-styles'

export const PILLAR = {
  id: 'P320-worker-derived-dark-styles',
  invariant:
    'a static light Worker StyleSheet renders in dark mode with its colours mapped onto the shared dark tokens by role: light surfaces become dark cards, dark and brand ink becomes white or the dark mint accent, grey ink the secondary grey, light hairlines dark borders, while saturated brand fills, white text and non-colour properties are left as they are',
  authority: [
    'governance/design/signature.md §2 and §5 (one neutral dark token set for every surface)',
    'governance/design/accessible-content.md (text contrast ≥ 4.5:1 in both light and dark)',
  ],
  target: 'apps/mobile/components/worker/ui/worker-dark-styles.ts',
  layer: 'unit',
  siblings: ['P319-worker-kael-chat-dark'],
  mutation: 'return the light value unchanged from darkInkColor — the dark-ink case turns red',
} as const satisfies PillarManifest

const dark = customerTheme.darkLayer

describe('P320 derived dark styles for Worker screens', () => {
  const light = StyleSheet.create({
    brandButton: { backgroundColor: color.brand.primary, borderRadius: 12 },
    buttonLabel: { color: '#FFFFFF', fontSize: 15 },
    card: { backgroundColor: '#FFFFFF', borderColor: 'rgba(216,235,232,0.9)', padding: 12 },
    danger: { color: '#E5484D' },
    glass: { backgroundColor: 'rgba(255,255,255,0.78)' },
    link: { color: color.brand.primaryDark },
    secondary: { color: color.text.secondary },
    title: { color: color.text.strong, fontWeight: '700' },
  })
  const derived = deriveWorkerDarkStyles(light)

  it('maps surfaces, ink and lines onto the dark tokens', () => {
    withPillarContext(PILLAR, () => {
      expect(derived.card).toEqual({ backgroundColor: dark.base, borderColor: dark.border, padding: 12 })
      expect(derived.glass.backgroundColor).toBe(dark.glass)
      expect(derived.title).toEqual({ color: dark.text, fontWeight: '700' })
      expect(derived.secondary.color).toBe(dark.muted)
      expect(derived.link.color).toBe(dark.primary)
    })
  })

  it('leaves brand fills, white labels and red ink as they are, and caches per sheet', () => {
    withPillarContext(PILLAR, () => {
      expect(derived.brandButton).toEqual(light.brandButton)
      expect(derived.buttonLabel).toEqual(light.buttonLabel)
      expect(derived.danger.color).toBe('#E5484D')
      expect(deriveWorkerDarkStyles(light)).toBe(derived)
    })
  })
})
