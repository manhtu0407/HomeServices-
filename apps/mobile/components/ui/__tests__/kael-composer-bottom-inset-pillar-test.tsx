import { act, renderHook } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Keyboard } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { kaelComposerBottomPadding, useKaelComposerBottomInset } from '../use-kael-composer-bottom-inset'

export const PILLAR = {
  id: 'P316-kael-composer-bottom-inset',
  invariant:
    'the Kael chat composer sits near the bottom of the device in the Customer and Worker chats: the screens leave the bottom safe-area edge out and pad the frame 18pt on an iPhone with a home indicator (not 34pt plus a 12pt note margin), 8pt above the keyboard or on a phone without an inset, and Android keeps its full navigation-bar inset',
  authority: [
    'governance/design.md (controls keep clear of system UI; no dead space under the primary input)',
    'governance/design/runtime.md (safe areas and keyboard avoidance)',
  ],
  target: 'apps/mobile/components/ui/use-kael-composer-bottom-inset.ts',
  layer: 'ui-visual',
  siblings: ['P314-kael-chat-liquid-controls'],
  mutation:
    'return the full insetBottom on iOS, or put the bottom edge back in either SafeAreaView — the iPhone or screen-edge case turns red',
} as const satisfies PillarManifest

const mockInsets = { bottom: 34, left: 0, right: 0, top: 47 }
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}))

const mobileRoot = join(__dirname, '..', '..', '..')

describe('P316 Kael composer bottom inset', () => {
  it('pads 18pt above the iPhone home indicator and 8pt above the keyboard', () => {
    const listeners: Record<string, () => void> = {}
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
      listeners[event] = handler as () => void
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>
    })
    const { result } = renderHook(() => useKaelComposerBottomInset())
    withPillarContext(PILLAR, () => {
      expect(result.current).toBe(18)
    }, 'iPhone resting')
    act(() => listeners.keyboardWillShow())
    withPillarContext(PILLAR, () => {
      expect(result.current).toBe(8)
    }, 'keyboard open')
    act(() => listeners.keyboardWillHide())
    expect(result.current).toBe(18)
    addListener.mockRestore()
  })

  it('keeps a minimum gap without an inset and the full navigation-bar inset on Android', () => {
    withPillarContext(PILLAR, () => {
      expect(kaelComposerBottomPadding(0, false, 'ios')).toBe(8)
      expect(kaelComposerBottomPadding(21, false, 'ios')).toBe(18)
      expect(kaelComposerBottomPadding(48, false, 'android')).toBe(56)
      expect(kaelComposerBottomPadding(48, true, 'android')).toBe(8)
    })
  })

  it.each([
    ['Customer', 'components/customer/kael-chat/chat-stateful-surfaces.tsx', 'KAEL_CHAT_SAFE_AREA_EDGES'],
    ['Worker', 'components/worker/chat/orb-screen-surfaces.tsx', 'KAEL_ORB_SAFE_AREA_EDGES'],
  ])('%s chat leaves the bottom safe-area edge to the composer inset', (_role, file, edgesName) => {
    const source = readFileSync(join(mobileRoot, file), 'utf8')
    withPillarContext(PILLAR, () => {
      expect(source).toContain(`const ${edgesName}: Edge[] = ['top', 'left', 'right']`)
      expect(source).toContain(`<SafeAreaView edges={${edgesName}}`)
      expect(source).toContain('{ paddingBottom: composerBottomInset }')
    })
  })
})
