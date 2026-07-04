import type { ImageSourcePropType } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerKaelMemoryPreferenceKey, LocalDeal, LocalDealStatus } from '@nestscout/shared'

import { customerV21Assets } from './assets'
import { customerV21CommonCopy } from './copy'
import { formatVnd, paymentAmountLabel } from './case-work-display-model'
import { stringFromUnknown } from './value-display-model'

export type AgenticMemoryRowModel = {
  enabled: boolean
  image: ImageSourcePropType
  label: string
  preferenceKey: CustomerKaelMemoryPreferenceKey
  value: string
}
export type AgenticProcessedApprovalRowModel = {
  available: boolean
  body: string
  image: ImageSourcePropType
  status: string
  title: string
}
export function totalDealEvidenceCount(deal: LocalDeal | null) {
  if (!deal) return 0
  return Math.max(0, deal.draft.mediaCount ?? 0)
    + (deal.scopeChange?.evidencePhotoUrls?.length ?? 0)
    + (deal.completionPhotoUrls?.length ?? 0)
    + (deal.completionNotes ? 1 : 0)
}

export function agenticCommandStep(status: LocalDealStatus) {
  if (status === 'draft' || status === 'analyzing') return 1
  if (status === 'awaiting_customer_confirm' || status === 'scope_change_pending') return 2
  if (status === 'confirmed_by_customer') return 3
  if (status === 'broadcasting' || status === 'worker_matched' || status === 'worker_on_way') return 4
  return 5
}

export function agenticProcessedApprovalRows(deal: LocalDeal | null, language: AppLanguage): AgenticProcessedApprovalRowModel[] {
  const copy = customerV21CommonCopy[language]
  const step = deal ? agenticCommandStep(deal.status) : 0
  const quoteReady = Boolean(deal?.estimate || deal?.payment || step >= 3)
  const scheduleReady = Boolean(deal && step >= 3)
  const quoteValue = deal?.payment
    ? paymentAmountLabel(deal.payment, language, '0')
    : deal?.estimate?.priceRangeLabel ?? copy.dataPending
  const scheduleValue = scheduleReady
    ? (language === 'vi' ? 'Theo yêu cầu hiện tại' : 'Current request')
    : copy.dataPending
  const approvedLabel = language === 'vi' ? 'Đã có' : 'Ready'

  return [
    {
      available: quoteReady,
      body: quoteValue,
      image: customerV21Assets.request,
      status: quoteReady ? approvedLabel : copy.dataPending,
      title: language === 'vi' ? 'Báo giá dịch vụ' : 'Service quote',
    },
    {
      available: scheduleReady,
      body: scheduleValue,
      image: customerV21Assets.booking,
      status: scheduleReady ? approvedLabel : copy.dataPending,
      title: language === 'vi' ? 'Khung giờ làm việc' : 'Work window',
    },
  ]
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

export function agenticMemoryItemCount(rows: AgenticMemoryRowModel[]) {
  return rows.filter((row) => row.enabled).length
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
