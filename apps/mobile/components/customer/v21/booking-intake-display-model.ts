import type { AppLanguage } from '@/lib/app-language'
import type { ServiceType } from '@nestscout/shared'

import { customerV21ServiceCopy } from './copy'

export const bookingTimeSlots = ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00'] as const
export function buildBookingDraftMessage({
  address,
  description,
  language,
  problems,
  scheduleLabel,
  serviceType,
}: {
  address: string
  description: string
  language: AppLanguage
  problems: string[]
  scheduleLabel: string | null
  serviceType: ServiceType
}) {
  const service = customerV21ServiceCopy[language][serviceType].label
  if (language === 'vi') {
    return [
      `Dịch vụ: ${service}`,
      `Vấn đề: ${problems.length > 0 ? problems.join(', ') : 'Theo mô tả'}`,
      `Khu vực: ${address.trim()}`,
      `Thời gian: ${scheduleLabel ?? 'Chưa chọn'}`,
      `Mô tả: ${description.trim()}`,
    ].join('\n')
  }
  return [
    `Service: ${service}`,
    `Issue: ${problems.length > 0 ? problems.join(', ') : 'From description'}`,
    `Area: ${address.trim()}`,
    `Time: ${scheduleLabel ?? 'Not selected'}`,
    `Description: ${description.trim()}`,
  ].join('\n')
}
type BookingScheduleDateOption = {
  dateLabel: string
  dayLabel: string
  label: string
  value: string
}

export function buildBookingScheduleDateOptions(language: AppLanguage, runtimeNow: Date = new Date()): BookingScheduleDateOption[] {
  const now = new Date(runtimeNow)
  now.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() + index)
    const dayLabel = index === 0
      ? (language === 'vi' ? 'Hôm nay' : 'Today')
      : weekdayLabel(date.getDay(), language)
    const dateLabel = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      dateLabel,
      dayLabel,
      label: `${dayLabel} ${dateLabel}`,
      value: dateValue(date),
    }
  })
}

export function bookingScheduleLabel(
  options: BookingScheduleDateOption[],
  selectedDate: string | null,
  selectedTime: string | null,
  language: AppLanguage,
) {
  const dateLabel = selectedDate ? options.find((option) => option.value === selectedDate)?.label ?? selectedDate : null
  if (dateLabel && selectedTime) return `${dateLabel} · ${selectedTime}`
  if (dateLabel) return `${dateLabel} · ${language === 'vi' ? 'Chưa chọn giờ' : 'No time'}`
  if (selectedTime) return `${language === 'vi' ? 'Chưa chọn ngày' : 'No date'} · ${selectedTime}`
  return null
}

export function bookingScheduleDateParam(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function bookingScheduleTimeParam(value: string | undefined) {
  if (!value) return null
  return bookingTimeSlots.includes(value as (typeof bookingTimeSlots)[number]) ? value : null
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weekdayLabel(day: number, language: AppLanguage) {
  const vi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return language === 'vi' ? vi[day] : en[day]
}
