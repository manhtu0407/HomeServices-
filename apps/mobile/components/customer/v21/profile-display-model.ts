import type { AppLanguage } from '@/lib/app-language'
import type { CustomerProfileInsightsResponse } from '@/lib/api-types'

import { formatNumber } from './case-work-display-model'
import { customerV21ProfileStageIds, type CustomerV21ScreenId } from './types'
import { metadataString } from './value-display-model'

export type CustomerProfilePanel = 'overview' | 'ranking' | 'money'
export type CustomerProfileUtility = 'address' | 'payment' | 'settings'

const profileScreenIds: CustomerV21ScreenId[] = [...customerV21ProfileStageIds]
const millisecondsPerDay = 86_400_000
const hoChiMinhUtcOffsetMs = 7 * 60 * 60 * 1000

export type CustomerAccountJourneyDisplay = {
  accessibilityLabel: string
  activeDaysLabel: string
  activeDaysValue: string
  memberSince: string
  title: string
  totalDaysLabel: string
  totalDaysValue: string
}

export function insightNumber(
  insights: CustomerProfileInsightsResponse | null,
  key: keyof CustomerProfileInsightsResponse,
  fallback: string,
  language: AppLanguage,
  formatter?: (value: number) => string,
) {
  const value = insights?.[key]
  if (typeof value !== 'number') return fallback
  return formatter ? formatter(value) : formatNumber(value, language)
}

export function protectedTransactionLabel(
  insights: CustomerProfileInsightsResponse | null,
  language: AppLanguage,
  fallback: string,
) {
  if (typeof insights?.protected_transaction_count !== 'number' || typeof insights?.total_transaction_count !== 'number') {
    return fallback
  }
  if (insights.total_transaction_count <= 0) return fallback
  return `${formatNumber(insights.protected_transaction_count, language)} / ${formatNumber(insights.total_transaction_count, language)}`
}

export function rankLabel(rank: number, language: AppLanguage) {
  if (language !== 'vi') return `L${rank}`
  if (rank === 1) return 'Mới'
  if (rank === 2) return 'Hoạt động'
  if (rank === 3) return 'Tin cậy'
  if (rank === 4) return 'Cao cấp'
  return 'Tối đa'
}

export function profileRankStatus(rank: number, language: AppLanguage, fallback: string) {
  if (rank <= 0) return fallback
  if (rank >= 3) return language === 'vi' ? 'Khách hàng Tin cậy' : 'Trusted customer'
  return language === 'vi' ? 'Đang xây hạng' : 'Building level'
}

export function fairPriceStatusLabel(
  status: CustomerProfileInsightsResponse['fair_price_status'] | undefined,
  language: AppLanguage,
  fallback: string,
) {
  if (status === 'verified') return language === 'vi' ? 'Đã xác minh' : 'Verified'
  if (status === 'mixed') return language === 'vi' ? 'Đang xét' : 'Reviewing'
  if (status === 'pending') return language === 'vi' ? 'Đang chờ' : 'Pending'
  return fallback
}

export function profileStageSubtitle(screenId: CustomerV21ScreenId, language: AppLanguage) {
  if (screenId === '6.2-usage-ranking') {
    return ''
  }
  if (screenId === '6.3-protect-money') {
    return language === 'vi' ? 'Đúng giá, đúng quy trình và minh bạch' : 'Fair price, proper workflow, transparent'
  }
  return language === 'vi' ? 'Tài khoản, bảo vệ và các tiện ích phụ' : 'Account, protection, and utilities'
}

export function formatWorkerJobs(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return language === 'vi' ? 'Chưa có dữ liệu' : 'Data pending'
  }
  const count = value
  return language === 'vi' ? `${formatNumber(count, language)} đơn` : `${formatNumber(count, language)} jobs`
}

export function percentFromConfidenceLabel(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return null
  const parsed = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, parsed))
}
export function profileName(metadata: Record<string, unknown> | undefined, language: AppLanguage) {
  return metadataString(metadata, 'nickname')
    ?? metadataString(metadata, 'full_name')
    ?? metadataString(metadata, 'name')
    ?? (language === 'vi' ? 'Khách NestScout' : 'NestScout customer')
}

export function initialsForName(name: string) {
  const parts = name
    .split(/\s+/)
    .flatMap((part) => {
      const trimmed = part.trim()
      return trimmed ? [trimmed] : []
    })
  if (parts.length === 0) return 'NS'
  const first = parts[0]?.[0] ?? 'N'
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]
  return `${first}${last ?? ''}`.toLocaleUpperCase('vi-VN')
}

export function homeGreeting(name: string, language: AppLanguage) {
  const hour = new Date().getHours()
  if (language === 'vi') {
    const moment = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
    return `${moment}, ${name}`
  }
  const moment = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${moment}, ${name}`
}

export function customerAccountJourneyDisplay({
  activeServiceDays,
  createdAt,
  fallback,
  language,
  now = new Date(),
}: {
  activeServiceDays: number | null | undefined
  createdAt: string | null | undefined
  fallback: string
  language: AppLanguage
  now?: Date
}): CustomerAccountJourneyDisplay {
  const memberSince = memberSinceLabel(createdAt, language, fallback)
  const totalDays = accountTotalDays(createdAt, now)
  const safeActiveDays = typeof activeServiceDays === 'number' && Number.isFinite(activeServiceDays)
    ? Math.max(0, Math.floor(activeServiceDays))
    : null
  const activeDaysValue = safeActiveDays === null
    ? fallback
    : language === 'vi'
      ? `${formatNumber(safeActiveDays, language)} ngày`
      : `${formatNumber(safeActiveDays, language)} ${safeActiveDays === 1 ? 'day' : 'days'}`
  const totalDaysValue = totalDays === null
    ? fallback
    : language === 'vi'
      ? `Ngày thứ ${formatNumber(totalDays, language)}`
      : `Day ${formatNumber(totalDays, language)}`
  const title = language === 'vi' ? 'Hành trình tài khoản' : 'Account journey'
  const activeDaysLabel = language === 'vi' ? 'Dùng dịch vụ' : 'Service use'
  const totalDaysLabel = language === 'vi' ? 'Từ khi tạo tài khoản' : 'Since account creation'

  return {
    accessibilityLabel: `${title}. ${memberSince}. ${activeDaysLabel}: ${activeDaysValue}. ${totalDaysLabel}: ${totalDaysValue}.`,
    activeDaysLabel,
    activeDaysValue,
    memberSince,
    title,
    totalDaysLabel,
    totalDaysValue,
  }
}

export function memberSinceLabel(value: string | null | undefined, language: AppLanguage, fallback: string) {
  const date = parseAccountDate(value)
  if (!date) return fallback
  const shiftedDate = new Date(date.getTime() + hoChiMinhUtcOffsetMs)
  const day = String(shiftedDate.getUTCDate()).padStart(2, '0')
  const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0')
  const year = String(shiftedDate.getUTCFullYear())
  return language === 'vi' ? `Thành viên từ ${day}/${month}/${year}` : `Member since ${month}/${day}/${year}`
}

export function accountTotalDays(value: string | null | undefined, now = new Date()) {
  const createdAt = parseAccountDate(value)
  if (!createdAt || Number.isNaN(now.getTime())) return null
  const createdDay = Math.floor((createdAt.getTime() + hoChiMinhUtcOffsetMs) / millisecondsPerDay)
  const currentDay = Math.floor((now.getTime() + hoChiMinhUtcOffsetMs) / millisecondsPerDay)
  if (currentDay < createdDay) return null
  return currentDay - createdDay + 1
}

function parseAccountDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function profilePanelParam(value: string | undefined): CustomerProfilePanel | null {
  return value === 'overview' || value === 'ranking' || value === 'money' ? value : null
}

export function profileUtilityParam(value: string | undefined): CustomerProfileUtility | null {
  if (value === 'notifications' || value === 'support') return 'settings'
  return value === 'address' || value === 'payment' || value === 'settings' ? value : null
}

export function profileUtilityTitle(kind: CustomerProfileUtility, language: AppLanguage) {
  if (kind === 'payment') return language === 'vi' ? 'Thanh toán' : 'Payment'
  if (kind === 'settings') return language === 'vi' ? 'Cài đặt' : 'Settings'
  return language === 'vi' ? 'Địa chỉ' : 'Addresses'
}

export function profileUtilitySubtitle(kind: CustomerProfileUtility, language: AppLanguage) {
  if (kind === 'payment' || kind === 'settings') {
    return ''
  }
  return language === 'vi' ? 'Địa chỉ dùng cho đặt dịch vụ' : 'Addresses used for booking'
}

export function profileScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return profileScreenIds.includes(value as CustomerV21ScreenId) ? value as CustomerV21ScreenId : null
}

export function profilePanelForScreen(screenId: CustomerV21ScreenId | null): CustomerProfilePanel | null {
  if (screenId === '6.2-usage-ranking') return 'ranking'
  if (screenId === '6.3-protect-money') return 'money'
  if (screenId === '6.1-profile-overview') return 'overview'
  return null
}
