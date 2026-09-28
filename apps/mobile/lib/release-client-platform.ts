import { Platform } from 'react-native'

export type ReleaseClientPlatform = 'ios' | 'android'

/**
 * mobile-api accepts writes only from a released iOS/Android build and answers every other
 * client with 426 CLIENT_UPDATE_REQUIRED (enforceStage1ClientCompatibility). A null result
 * means no write from this client can succeed, so callers skip it instead of looping on 426.
 */
export function releaseClientPlatform(): ReleaseClientPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null
}
