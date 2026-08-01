import { localizedProblemLabel, type AppLanguage } from '@/lib/app-language'
import { HCMC_TIME_ZONE, hcmcCalendarDate, hcmcScheduledAt } from '@/lib/hcmc-schedule'
import type { PendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'
import type { ServiceType } from '@nestscout/shared'

import { customerV21ServiceCopy } from '../ui/copy'

export const bookingTimeSlots = ['08:00', '10:00', '14:00', '16:00'] as const
const bookingScheduleWindowMinutes = 120
type BookingScheduleWindow = {
  date: string
  start: string
  end: string
  timeZone: 'Asia/Ho_Chi_Minh'
}

export function bookingScheduleDraft(
  selectedDate: string | null,
  selectedTime: string | null,
  runtimeNow: Date = new Date(),
): { scheduledAt?: string; scheduleWindow?: BookingScheduleWindow } {
  if (!selectedDate || !selectedTime) return {}
  const start = bookingCustomTimeValue(selectedTime)
  const end = start ? bookingScheduleEndTime(start) : null
  if (!start || !end) return {}
  const scheduledAt = hcmcScheduledAt(selectedDate, start)
  if (!scheduledAt || Date.parse(scheduledAt) <= runtimeNow.getTime()) return {}
  return {
    scheduledAt,
    scheduleWindow: {
      date: selectedDate,
      start,
      end,
      timeZone: HCMC_TIME_ZONE,
    },
  }
}

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
  const visibleProblems = problems.map((problem) => localizedProblemLabel(problem, serviceType, language))
  if (language === 'vi') {
    return [
      `Dịch vụ: ${service}`,
      `Vấn đề: ${visibleProblems.length > 0 ? visibleProblems.join(', ') : 'Theo mô tả'}`,
      `Khu vực: ${address.trim()}`,
      `Thời gian: ${scheduleLabel ?? 'Chưa chọn'}`,
      `Mô tả: ${description.trim()}`,
    ].join('\n')
  }
  return [
    `Service: ${service}`,
    `Issue: ${visibleProblems.length > 0 ? visibleProblems.join(', ') : 'From description'}`,
    `Area: ${address.trim()}`,
    `Time: ${scheduleLabel ?? 'Not selected'}`,
    `Description: ${description.trim()}`,
  ].join('\n')
}

export function localizedPendingBookingDraftMessage(
  draft: PendingKaelChatDraft | null,
  language: AppLanguage,
) {
  if (!draft) return null
  if (draft.locale === language || !draft.serviceType) return draft.message
  return buildBookingDraftMessage({
    address: draft.addressLabel ?? draft.districtLabel ?? '',
    description: draft.description ?? '',
    language,
    problems: draft.problemChips ?? [],
    scheduleLabel: draft.scheduleWindow
      ? `${draft.scheduleWindow.date} · ${draft.scheduleWindow.start}-${draft.scheduleWindow.end}`
      : null,
    serviceType: draft.serviceType,
  })
}

type BookingScheduleDateOption = {
  dateLabel: string
  dayLabel: string
  label: string
  value: string
}

export function buildBookingScheduleDateOptions(language: AppLanguage, runtimeNow: Date = new Date()): BookingScheduleDateOption[] {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = hcmcCalendarDate(runtimeNow, index)
    const dayLabel = index === 0
      ? (language === 'vi' ? 'Hôm nay' : 'Today')
      : weekdayLabel(date.weekday, language)
    const dateLabel = `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`
    return {
      dateLabel,
      dayLabel,
      label: `${dayLabel} ${dateLabel}`,
      value: date.date,
    }
  })
}

export function bookingCustomDateValue(input: string, runtimeNow: Date = new Date()) {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const value = `${year}-${month}-${day}`
  return bookingScheduleDateIsBookable(value, runtimeNow) ? value : null
}

export function normalizeBookingCustomDateInput(input: string) {
  const digits = input.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function bookingCustomTimeValue(input: string) {
  const match = input.trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, hour, minute] = match
  if (Number(hour) > 23 || Number(minute) > 59) return null
  return bookingScheduleEndTime(`${hour}:${minute}`) ? `${hour}:${minute}` : null
}

export function normalizeBookingCustomTimeInput(input: string) {
  const digits = input.replace(/\D/g, '').slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function bookingScheduleDateIsBookable(value: string, runtimeNow: Date = new Date()) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const [, year, month, day] = match
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const realDate = candidate.getUTCFullYear() === Number(year)
    && candidate.getUTCMonth() === Number(month) - 1
    && candidate.getUTCDate() === Number(day)
  return realDate && value >= hcmcCalendarDate(runtimeNow).date
}

export function availableBookingTimeSlots(selectedDate: string | null, runtimeNow: Date = new Date()) {
  if (!selectedDate) return [...bookingTimeSlots]
  return bookingTimeSlots.filter((slot) => {
    const scheduledAt = hcmcScheduledAt(selectedDate, slot.split('-')[0] ?? '')
    return Boolean(scheduledAt && Date.parse(scheduledAt) > runtimeNow.getTime())
  })
}

export function bookingScheduleLabel(
  options: BookingScheduleDateOption[],
  selectedDate: string | null,
  selectedTime: string | null,
  language: AppLanguage,
) {
  const dateLabel = selectedDate
    ? options.find((option) => option.value === selectedDate)?.label ?? customDateLabel(selectedDate, language)
    : null
  const timeLabel = selectedTime
    ? (language === 'vi' ? `Bắt đầu lúc ${selectedTime}` : `Starts at ${selectedTime}`)
    : null
  if (dateLabel && timeLabel) return `${dateLabel} · ${timeLabel}`
  if (dateLabel) return `${dateLabel} · ${language === 'vi' ? 'Chưa chọn giờ' : 'No time'}`
  if (timeLabel) return `${language === 'vi' ? 'Chưa chọn ngày' : 'No date'} · ${timeLabel}`
  return null
}

export function bookingScheduleDateParam(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function bookingScheduleTimeParam(value: string | undefined) {
  if (!value) return null
  return bookingCustomTimeValue(value.split('-')[0] ?? '')
}

function customDateLabel(value: string, language: AppLanguage) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return value
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return `${weekdayLabel(date.getUTCDay(), language)} ${day}/${month}/${year}`
}

function bookingScheduleEndTime(start: string) {
  const [hour, minute] = start.split(':').map(Number)
  const startMinutes = hour * 60 + minute
  if (!Number.isInteger(startMinutes) || startMinutes >= 23 * 60 + 59) return null
  const endMinutes = Math.min(startMinutes + bookingScheduleWindowMinutes, 23 * 60 + 59)
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
}
function weekdayLabel(day: number, language: AppLanguage) {
  const vi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return language === 'vi' ? vi[day] : en[day]
}
