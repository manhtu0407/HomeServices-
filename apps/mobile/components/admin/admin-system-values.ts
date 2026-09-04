import type { AppLanguage } from '@/lib/app-language'

import { formatAdminDateTime, formatAdminVnd } from './admin-intl'

export function adminSystemFormatDate(value: string | null, language: AppLanguage) {
  return value ? formatAdminDateTime(value, language) : language === 'vi' ? 'Chưa ghi nhận' : 'Not recorded'
}

export function adminSystemServiceLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    cleaning: ['Vệ sinh nhà', 'Home cleaning'], electrical: ['Điện', 'Electrical repair'], handyman: ['Sửa chữa nhỏ', 'Handyman'],
    hvac: ['Điều hòa', 'Air conditioning'], plumbing: ['Nước', 'Plumbing repair'], upholstery: ['Vệ sinh nội thất', 'Upholstery care'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? value
}

export function adminSystemComplexityLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = { small: ['Nhỏ', 'Small'], medium: ['Vừa', 'Medium'], large: ['Lớn', 'Large'] }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? value
}

export function adminSystemFormatVnd(value: number, language: AppLanguage) {
  return formatAdminVnd(value, language)
}
