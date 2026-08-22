import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

export type UserPermissionState = 'granted' | 'limited' | 'denied' | 'blocked'

export type UserPermissionSnapshot = {
  canAskAgain: boolean
  state: UserPermissionState
}

export type UserInitiatedPermissionDecision = UserPermissionSnapshot & {
  requestedThisAttempt: boolean
}

type ExpoPermissionSnapshot = {
  accessPrivileges?: 'all' | 'limited' | 'none'
  canAskAgain: boolean
  granted: boolean
}

export function classifyPermissionState(permission: ExpoPermissionSnapshot): UserPermissionSnapshot {
  if (permission.granted) {
    return {
      canAskAgain: permission.canAskAgain,
      state: permission.accessPrivileges === 'limited' ? 'limited' : 'granted',
    }
  }
  return {
    canAskAgain: permission.canAskAgain,
    state: permission.canAskAgain ? 'denied' : 'blocked',
  }
}

export async function resolveUserInitiatedCameraPermission(): Promise<UserInitiatedPermissionDecision> {
  const current = classifyPermissionState(await ImagePicker.getCameraPermissionsAsync())
  if (cameraPermissionAllowsAccess(current) || !current.canAskAgain) {
    return { ...current, requestedThisAttempt: false }
  }

  const requested = classifyPermissionState(await ImagePicker.requestCameraPermissionsAsync())
  return { ...requested, requestedThisAttempt: true }
}

export function cameraPermissionAllowsAccess(permission: UserPermissionSnapshot): boolean {
  return permission.state === 'granted' || permission.state === 'limited'
}

export function shouldOfferCameraSettings(permission: UserInitiatedPermissionDecision): boolean {
  return permission.state === 'blocked' && !permission.requestedThisAttempt
}

export function presentBlockedCameraSettings(language: AppLanguage): void {
  Alert.alert(
    language === 'vi' ? 'Camera chưa khả dụng' : 'Camera unavailable',
    language === 'vi'
      ? 'Bạn có thể tiếp tục mà không chụp ảnh, hoặc mở Cài đặt để thay đổi quyền Camera.'
      : 'You can continue without taking a photo, or open Settings to change Camera access.',
    [
      { style: 'cancel', text: language === 'vi' ? 'Hủy' : 'Cancel' },
      {
        onPress: () => {
          void Linking.openSettings().catch(() => undefined)
        },
        text: language === 'vi' ? 'Mở Cài đặt' : 'Open Settings',
      },
    ],
  )
}
