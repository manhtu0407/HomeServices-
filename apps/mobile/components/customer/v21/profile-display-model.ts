import type { AppLanguage } from '@/lib/app-language'
import type { CustomerProfileInsightsResponse } from '@/lib/api-types'

import { customerV21CommonCopy, customerV21ServiceCopy } from './copy'
import { formatNumber } from './case-work-display-model'
import { customerV21AgenticScreenIds, customerV21ProfileStageIds, type CustomerV21ScreenId } from './types'
import { serviceParam } from './route-params'
import { metadataString, stringFromUnknown } from './value-display-model'

export type CustomerProfilePanel = 'overview' | 'ranking' | 'money' | 'memory'
export type CustomerProfileUtility = 'address' | 'payment' | 'settings'

const profileScreenIds: CustomerV21ScreenId[] = [
  ...customerV21AgenticScreenIds,
  ...customerV21ProfileStageIds,
]

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
    return language === 'vi' ? 'Hạng phản ánh cách bạn sử dụng dịch vụ' : 'Level reflects how you use service'
  }
  if (screenId === '6.3-protect-money') {
    return language === 'vi' ? 'Đúng giá, đúng quy trình và minh bạch' : 'Fair price, proper workflow, transparent'
  }
  return language === 'vi' ? 'Tài khoản, bảo vệ và các tiện ích phụ' : 'Account, protection, and utilities'
}

export function formatWorkerJobs(value: number | null | undefined, language: AppLanguage) {
  const count = typeof value === 'number' ? value : 0
  return language === 'vi' ? `${formatNumber(count, language)} đơn` : `${formatNumber(count, language)} jobs`
}

export function percentFromConfidenceLabel(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return 0
  const parsed = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}
export function servicePreferenceLabel(value: unknown, language: AppLanguage) {
  const service = serviceParam(stringFromUnknown(value) ?? undefined)
  return service ? customerV21ServiceCopy[language][service].label : null
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
    .map((part) => part.trim())
    .filter(Boolean)
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

export function memberSinceLabel(value: string | null | undefined, language: AppLanguage, fallback: string) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return language === 'vi' ? `Thành viên ${month}/${year}` : `Member ${month}/${year}`
}

export function profilePanelParam(value: string | undefined): CustomerProfilePanel | null {
  return value === 'overview' || value === 'ranking' || value === 'money' || value === 'memory' ? value : null
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
  if (kind === 'payment') {
    return language === 'vi' ? 'Ngân hàng mặc định và nơi nhận tiền' : 'Default bank and payout destination'
  }
  if (kind === 'settings') {
    return language === 'vi' ? 'Bảo mật, ngôn ngữ và dữ liệu tài khoản' : 'Security, language, and account data'
  }
  return language === 'vi' ? 'Địa chỉ dùng cho đặt dịch vụ' : 'Addresses used for booking'
}

export function profileScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return profileScreenIds.includes(value as CustomerV21ScreenId) ? value as CustomerV21ScreenId : null
}

export function agenticScreenParam(screenId: CustomerV21ScreenId | null, utility: string | undefined): CustomerV21ScreenId | null {
  if (screenId && customerV21AgenticScreenIds.includes(screenId)) return screenId
  return utility === 'agentic' ? '5.1-agentic-home' : null
}

export function profilePanelForScreen(screenId: CustomerV21ScreenId | null): CustomerProfilePanel | null {
  if (screenId === '5.4-memory') return 'memory'
  if (screenId === '6.2-usage-ranking') return 'ranking'
  if (screenId === '6.3-protect-money') return 'money'
  if (screenId === '6.1-profile-overview') return 'overview'
  return null
}
