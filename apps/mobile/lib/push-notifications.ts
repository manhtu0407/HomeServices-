import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { UserRole } from '@nestscout/shared'
import type { DevicePushTokenInput } from './api-types'
import { notificationService } from './services'

type PermissionStatus = DevicePushTokenInput['permission_status']
type NotificationData = Record<string, unknown> | undefined
type NotificationSubscription = { remove: () => void }
type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>
      }
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_NOTIFICATION_PATH_LENGTH = 2_048

type ExpoNotificationsModule = {
  AndroidImportance?: { HIGH?: number }
  addNotificationResponseReceivedListener?: (listener: (response: NotificationResponse) => void) => NotificationSubscription
  getExpoPushTokenAsync: (options?: { projectId?: string }) => Promise<{ data: string }>
  getPermissionsAsync: () => Promise<{ status: PermissionStatus }>
  requestPermissionsAsync: () => Promise<{ status: PermissionStatus }>
  setNotificationChannelAsync?: (channelId: string, channel: { importance?: number; name: string }) => Promise<unknown>
}

export type PushSetupResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' | 'unavailable' | 'unsupported' }
  | { status: 'error'; message: string }

export type PushUnregisterResult =
  | { status: 'unregistered' | 'not_registered' }
  | { status: 'error'; message: string }

export function addPushNotificationResponseListener(openPath: (path: string) => void): NotificationSubscription {
  if (pushNotificationsDisabledForRuntime()) {
    return { remove: () => undefined }
  }

  const Notifications = loadExpoNotifications()
  if (!Notifications?.addNotificationResponseReceivedListener) {
    return { remove: () => undefined }
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    const path = toNotificationPath(response.notification.request.content.data)
    if (path) openPath(path)
  })
}

export async function setupPushNotifications(input: {
  accessToken: string
  role: UserRole | null
}): Promise<PushSetupResult> {
  if (pushNotificationsDisabledForRuntime()) return { status: 'unsupported' }
  if (Platform.OS === 'web') return { status: 'unsupported' }

  const Notifications = loadExpoNotifications()
  if (!Notifications) return { status: 'unavailable' }

  try {
    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('workflow', {
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        name: 'Workflow',
      })
    }

    const existingPermission = await Notifications.getPermissionsAsync()
    const finalPermission = existingPermission.status === 'granted'
      ? existingPermission
      : await Notifications.requestPermissionsAsync()

    if (finalPermission.status !== 'granted') {
      return { status: 'denied' }
    }

    const projectId = getExpoProjectId()
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    if (!token.data) return { status: 'error', message: 'Expo push token is empty' }

    const payload: DevicePushTokenInput = {
      permission_status: 'granted',
      platform: normalizePlatform(Platform.OS),
      push_token: token.data,
      safe_metadata: {
        project_id_available: Boolean(projectId),
        role: input.role,
        source: 'expo-notifications',
      },
    }
    const registered = await notificationService.registerDeviceToken(payload, input.accessToken)
    if (!registered.success) return { status: 'error', message: registered.error }
    if (!registered.data.enabled) {
      return { status: 'error', message: 'Push token registration was not enabled' }
    }

    return { status: 'registered', token: token.data }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Push setup failed' }
  }
}

export async function unregisterPushNotifications(input: {
  accessToken: string
  token: string
}): Promise<PushUnregisterResult> {
  try {
    const result = await notificationService.unregisterDeviceToken(
      { push_token: input.token },
      input.accessToken,
    )
    if (!result.success) return { status: 'error', message: result.error }
    return { status: result.data.unregistered ? 'unregistered' : 'not_registered' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Push unregister failed',
    }
  }
}

function pushNotificationsDisabledForRuntime() {
  return process.env.EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS === '1'
}

export function toNotificationPath(data: NotificationData) {
  const explicitPath = normalizeNotificationPath(
    readString(data, 'deep_link') ?? readString(data, 'deepLink') ?? readString(data, 'url') ?? readString(data, 'path'),
  )
  if (explicitPath) return explicitPath

  const scopeChangeId = readUuid(data, 'scope_change') ?? readUuid(data, 'scope_change_id') ?? readUuid(data, 'scopeChangeId')
  if (scopeChangeId) {
    const jobId = readUuid(data, 'job_id') ?? readUuid(data, 'jobId')
    const params = new URLSearchParams({ scope_change: scopeChangeId })
    if (jobId) params.set('job_id', jobId)
    return `/(customer)/history?${params.toString()}`
  }

  const broadcastId = readUuid(data, 'broadcast_id') ?? readUuid(data, 'broadcastId')
  if (broadcastId) {
    const params = new URLSearchParams({ broadcast_id: broadcastId })
    return `/(worker)/jobs?${params.toString()}`
  }

  return null
}

function loadExpoNotifications(): ExpoNotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Preserve the optional native-module fallback on unsupported runtimes.
    return require('expo-notifications') as ExpoNotificationsModule
  } catch {
    return null
  }
}

function normalizeNotificationPath(value: string | null) {
  if (!value || value.length > MAX_NOTIFICATION_PATH_LENGTH) return null
  const trimmed = value.trim()
  if (trimmed !== value) return null
  const withoutScheme = trimmed.replace(/^(?:nestscout|homeservices):\/\//i, '')
  if (!withoutScheme.startsWith('/') || withoutScheme.includes('#')) return null
  try {
    const parsed = new URL(withoutScheme, 'https://notification.invalid')
    if (parsed.origin !== 'https://notification.invalid') return null
    const queryIndex = withoutScheme.indexOf('?')
    const rawPath = queryIndex === -1 ? withoutScheme : withoutScheme.slice(0, queryIndex)
    if (rawPath !== parsed.pathname) return null
    const allowedKeys = parsed.pathname === '/(customer)/history'
      ? new Set(['job_id', 'scope_change'])
      : parsed.pathname === '/(worker)/jobs'
        ? new Set(['broadcast_id', 'job_id'])
        : null
    if (!allowedKeys) return null
    for (const key of parsed.searchParams.keys()) {
      const values = parsed.searchParams.getAll(key)
      if (!allowedKeys.has(key) || values.length !== 1 || !UUID_PATTERN.test(values[0] ?? '')) return null
    }
    const canonical = new URLSearchParams()
    for (const key of allowedKeys) {
      const value = parsed.searchParams.get(key)
      if (value) canonical.set(key, value)
    }
    const query = canonical.toString()
    return query ? `${parsed.pathname}?${query}` : parsed.pathname
  } catch {
    return null
  }
}

function readString(data: NotificationData, key: string) {
  const value = data?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readUuid(data: NotificationData, key: string) {
  const value = readString(data, key)?.trim() ?? null
  return value && UUID_PATTERN.test(value) ? value : null
}

function normalizePlatform(platform: typeof Platform.OS): DevicePushTokenInput['platform'] {
  if (platform === 'ios' || platform === 'android' || platform === 'web') return platform
  return 'unknown'
}

function getExpoProjectId() {
  const constants = Constants as {
    easConfig?: { projectId?: string }
    expoConfig?: { extra?: { eas?: { projectId?: string } } }
    manifest?: { extra?: { eas?: { projectId?: string } } }
    manifest2?: { extra?: { expoClient?: { extra?: { eas?: { projectId?: string } } } } }
  }

  return constants.expoConfig?.extra?.eas?.projectId
    ?? constants.easConfig?.projectId
    ?? constants.manifest2?.extra?.expoClient?.extra?.eas?.projectId
    ?? constants.manifest?.extra?.eas?.projectId
    ?? null
}
