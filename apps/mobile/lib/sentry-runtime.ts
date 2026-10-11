import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'

import { sanitizeSentryBreadcrumb, sanitizeSentryEvent } from './sentry-sanitization'

const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined
const dsn = typeof extra?.sentryDsn === 'string' ? extra.sentryDsn.trim() : ''
const runtimeBuildInfo = extra?.runtimeBuildInfo && typeof extra.runtimeBuildInfo === 'object'
  ? extra.runtimeBuildInfo as Record<string, unknown>
  : {}
const releaseId = safeIdentity(runtimeBuildInfo.releaseId)
const easBuildId = safeIdentity(runtimeBuildInfo.easBuildId)
const buildNumber = Platform.OS === 'ios'
  ? Constants.expoConfig?.ios?.buildNumber
  : Platform.OS === 'android'
    ? Constants.expoConfig?.android?.versionCode
    : undefined

if (Platform.OS !== 'web' && dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    enableAutoSessionTracking: false,
    maxBreadcrumbs: 50,
    release: releaseId ?? undefined,
    dist: buildNumber ? String(buildNumber) : easBuildId ?? undefined,
    beforeSend: sanitizeSentryEvent,
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
  })
  Sentry.setTag('release_id', releaseId ?? 'unregistered')
  Sentry.setTag('build_id', easBuildId ?? (buildNumber ? String(buildNumber) : 'unknown'))
  Sentry.setTag('platform', Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown')
}

export { Sentry }

function safeIdentity(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:+-]{1,100}$/u.test(value) ? value : null
}
