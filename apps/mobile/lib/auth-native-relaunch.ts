import { Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { getRememberedAuthCredentials } from './remembered-auth-credentials'

function isSocialAuthSession(session: Session) {
  const appMetadata = session.user.app_metadata
  const metadataProvider = typeof appMetadata?.provider === 'string' ? appMetadata.provider : null
  const metadataProviders = Array.isArray(appMetadata?.providers)
    ? appMetadata.providers.filter((provider): provider is string => typeof provider === 'string')
    : []
  const identityProviders = (session.user.identities ?? []).map((identity) => identity.provider)
  return [metadataProvider, ...metadataProviders, ...identityProviders].some((provider) => provider === 'apple' || provider === 'google')
}

export function getRememberedCredentialsForNativeRelaunch(session: Session | null, passwordRecoveryPending: boolean) {
  if (!session?.user || Platform.OS === 'web' || passwordRecoveryPending || isSocialAuthSession(session)) {
    return Promise.resolve(null)
  }
  return getRememberedAuthCredentials()
}
