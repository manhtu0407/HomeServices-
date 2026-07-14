import type { ImageSourcePropType } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerKaelMemoryPreferenceKey } from '@nestscout/shared'

import { customerV21Assets } from './assets'
import { customerV21CommonCopy } from './copy'
import { formatVnd } from './case-work-display-model'
import { stringFromUnknown } from './value-display-model'

export type AgenticMemoryRowModel = {
  enabled: boolean
  image: ImageSourcePropType
  label: string
  preferenceKey: CustomerKaelMemoryPreferenceKey
  value: string
}
export function agenticMemoryRowsFromUnknown(memory: unknown, language: AppLanguage): AgenticMemoryRowModel[] {
  const copy = customerV21CommonCopy[language]
  const record = memory && typeof memory === 'object' ? memory as Record<string, unknown> : null
  const servicePrefs = record?.service_preferences && typeof record.service_preferences === 'object'
    ? record.service_preferences as Record<string, unknown>
    : null
  const permissionPrefs = servicePrefs?.memory_permissions && typeof servicePrefs.memory_permissions === 'object'
    ? servicePrefs.memory_permissions as Record<string, unknown>
    : null
  const address = firstMemoryString(record, servicePrefs, ['preferred_address', 'address_label', 'default_address', 'home_address'])
  const timeWindow = firstMemoryString(record, servicePrefs, ['preferred_time_window', 'schedule_window', 'time_window', 'preferred_schedule'])
  const budget = firstMemoryBudget(record, servicePrefs, ['budget_limit_vnd', 'max_budget_vnd', 'budget_limit', 'max_budget'], language)

  return [
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'preferred_address', Boolean(address)),
      image: customerV21Assets.map,
      label: language === 'vi' ? 'Địa chỉ ưu tiên' : 'Preferred address',
      preferenceKey: 'preferred_address',
      value: address ?? copy.dataPending,
    },
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'preferred_time_window', Boolean(timeWindow)),
      image: customerV21Assets.booking,
      label: language === 'vi' ? 'Khung giờ phù hợp' : 'Preferred time',
      preferenceKey: 'preferred_time_window',
      value: timeWindow ?? copy.dataPending,
    },
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'budget_limit_vnd', Boolean(budget)),
      image: customerV21Assets.wallet,
      label: language === 'vi' ? 'Giới hạn ngân sách' : 'Budget limit',
      preferenceKey: 'budget_limit_vnd',
      value: budget ?? copy.dataPending,
    },
  ]
}

function memoryPermissionEnabled(
  permissions: Record<string, unknown> | null,
  key: CustomerKaelMemoryPreferenceKey,
  fallback: boolean,
) {
  return typeof permissions?.[key] === 'boolean' ? permissions[key] === true : fallback
}

function firstMemoryString(
  primary: Record<string, unknown> | null,
  secondary: Record<string, unknown> | null,
  keys: string[],
) {
  for (const key of keys) {
    const value = stringFromUnknown(primary?.[key]) ?? stringFromUnknown(secondary?.[key])
    if (value) return value
  }
  return null
}

function firstMemoryBudget(
  primary: Record<string, unknown> | null,
  secondary: Record<string, unknown> | null,
  keys: string[],
  language: AppLanguage,
) {
  for (const key of keys) {
    const rawValue = primary?.[key] ?? secondary?.[key]
    if (typeof rawValue === 'number') return formatVnd(rawValue, language)
    const stringValue = stringFromUnknown(rawValue)
    if (stringValue) return stringValue
  }
  return null
}

export type MemoryPreferenceActionResult = boolean | { code?: string; status?: number; success: boolean }

export function memoryPreferenceActionSucceeded(result: MemoryPreferenceActionResult) {
  if (typeof result === 'boolean') return result
  return result.success
}

export function memoryPreferenceSyncFailureLabel(
  result: MemoryPreferenceActionResult,
  language: AppLanguage,
  sessionState: { accessToken: string | null; hasSession: boolean },
) {
  if (!sessionState.hasSession) return language === 'vi' ? 'Chưa đăng nhập' : 'Sign in'
  if (sessionState.accessToken === 'local-visual-audit') return language === 'vi' ? 'Bản xem trước' : 'Preview'
  if (typeof result !== 'boolean') {
    if (result.code === 'NOT_FOUND' || result.status === 404) return language === 'vi' ? 'Cần cập nhật' : 'Update needed'
    if (result.code === 'CONFIG_MISSING' || result.code === 'CONFIG_INVALID') return language === 'vi' ? 'Chưa cấu hình' : 'Not configured'
    if (result.status === 401 || result.status === 403) return language === 'vi' ? 'Chưa đăng nhập' : 'Sign in'
    if (result.status === 0) return language === 'vi' ? 'Mất kết nối' : 'Offline'
  }
  return language === 'vi' ? 'Chưa đồng bộ' : 'Not synced'
}

export function agenticBooleanFromMemory(memory: unknown, key: string) {
  if (!memory || typeof memory !== 'object') return false
  const record = memory as Record<string, unknown>
  const servicePrefs = record.service_preferences && typeof record.service_preferences === 'object'
    ? record.service_preferences as Record<string, unknown>
    : null
  const permissionPrefs = servicePrefs?.memory_permissions && typeof servicePrefs.memory_permissions === 'object'
    ? servicePrefs.memory_permissions as Record<string, unknown>
    : null
  const boundaries = record.data_boundaries && typeof record.data_boundaries === 'object'
    ? record.data_boundaries as Record<string, unknown>
    : null
  return record[key] === true || boundaries?.[key] === true || permissionPrefs?.[key] === true
}
