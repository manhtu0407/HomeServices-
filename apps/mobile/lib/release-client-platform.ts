import { Platform } from 'react-native'
import { mobileRuntimeConfig } from './runtime-config'

export type ReleaseClientPlatform = 'ios' | 'android' | 'web-preview'

/**
 * The Production API accepts native writes only from an attested release. The guarded local
 * Preview uses a distinct identity accepted only from the API's allowlisted localhost origins.
 */
export function releaseClientPlatform(): ReleaseClientPlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS
  return Platform.OS === 'web' && mobileRuntimeConfig.webPreviewClientEnabled
    ? 'web-preview'
    : null
}
