import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { UserRole } from '@home-services/shared'
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

export async function setupPushNotifications(input: { role: UserRole | null }): Promise<PushSetupResult> {
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
    const registered = await notificationService.registerDeviceToken(payload)
    if (!registered.success) return { status: 'error', message: registered.error }

    return { status: 'registered', token: token.data }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Push setup failed' }
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

  const scopeChangeId = readString(data, 'scope_change') ?? readString(data, 'scope_change_id') ?? readString(data, 'scopeChangeId')
  if (scopeChangeId) {
    const jobId = readString(data, 'job_id') ?? readString(data, 'jobId')
    const params = new URLSearchParams({ scope_change: scopeChangeId })
    if (jobId) params.set('job_id', jobId)
    return `/(customer)/history?${params.toString()}`
  }

  const broadcastId = readString(data, 'broadcast_id') ?? readString(data, 'broadcastId')
  if (broadcastId) {
    const params = new URLSearchParams({ broadcast_id: broadcastId })
    return `/(worker)/jobs?${params.toString()}`
  }

  return null
}

function loadExpoNotifications(): ExpoNotificationsModule | null {
  try {
    return require('expo-notifications') as ExpoNotificationsModule
  } catch {
    return null
  }
}

function normalizeNotificationPath(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  const withoutScheme = trimmed.replace(/^homeservices:\/\//i, '')
  if (withoutScheme.startsWith('/(customer)/history')) return withoutScheme
  if (withoutScheme.startsWith('/(worker)/jobs')) return withoutScheme
  return null
}

function readString(data: NotificationData, key: string) {
  const value = data?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
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
