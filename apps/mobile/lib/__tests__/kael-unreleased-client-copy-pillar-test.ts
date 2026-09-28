import { Platform } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { localizeKaelConversationFailure, unreleasedClientKaelCopy } from '../kael-conversation-failure'

export const PILLAR = {
  id: 'P250-kael-unreleased-client-copy',
  invariant: 'Kael chat names the same one-language compatibility block before a request that mobile-api would refuse with 426, and never blocks a released iOS/Android client',
  authority: ['governance/RULES.md #5 (one selected language)', 'governance/RULES.md #8 (honest unavailable state)'],
  target: 'apps/mobile/lib/kael-conversation-failure.ts',
  layer: 'unit',
  siblings: ['P249-worker-kael-release-client-guard', 'P248-worker-presence-release-client-only'],
  mutation: 'return null for web or a message for ios/android; the platform matrix turns red',
} as const satisfies PillarManifest

// The exact body mobile-api returned to the web Preview in Production logs.
const PRODUCTION_426 = {
  code: 'CLIENT_UPDATE_REQUIRED',
  status: 426,
  meta: { supportCode: null },
}

const originalPlatform = Platform.OS

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
})

it.each(['vi', 'en'] as const)('blocks web with the same %s copy the 426 response produces', (language) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
  const expected = localizeKaelConversationFailure(PRODUCTION_426, language, 'fallback')
  withPillarContext(PILLAR, () => {
    expect(expected).not.toBe('fallback')
    expect(unreleasedClientKaelCopy(language)).toBe(expected)
  })
})

it.each(['ios', 'android'] as const)('never blocks a released %s client', (platform) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
  withPillarContext(PILLAR, () => {
    expect(unreleasedClientKaelCopy('vi')).toBeNull()
    expect(unreleasedClientKaelCopy('en')).toBeNull()
  })
})
