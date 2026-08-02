export const HCMC_TIME_ZONE = 'Asia/Ho_Chi_Minh' as const

const hcmcOffsetMs = 7 * 60 * 60 * 1000
const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const wallClockPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

type HcmcCalendarDate = {
  date: string
  day: number
  month: number
  weekday: number
  year: number
}

export function hcmcCalendarDate(runtimeNow: Date, dayOffset = 0): HcmcCalendarDate {
  const hcmcNow = new Date(runtimeNow.getTime() + hcmcOffsetMs)
  const calendarDay = new Date(Date.UTC(
    hcmcNow.getUTCFullYear(),
    hcmcNow.getUTCMonth(),
    hcmcNow.getUTCDate() + dayOffset,
  ))
  const year = calendarDay.getUTCFullYear()
  const month = calendarDay.getUTCMonth() + 1
  const day = calendarDay.getUTCDate()
  return {
    date: `${year}-${twoDigits(month)}-${twoDigits(day)}`,
    day,
    month,
    weekday: calendarDay.getUTCDay(),
    year,
  }
}

export function hcmcScheduledAt(date: string, time: string): string | null {
  const dateMatch = calendarDatePattern.exec(date)
  const timeMatch = wallClockPattern.exec(time)
  if (!dateMatch || !timeMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const calendarDay = new Date(Date.UTC(year, month - 1, day))
  if (
    calendarDay.getUTCFullYear() !== year
    || calendarDay.getUTCMonth() !== month - 1
    || calendarDay.getUTCDate() !== day
  ) return null

  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute)).toISOString()
}

export function formatHcmcScheduledAt(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const hcmcTime = new Date(timestamp + hcmcOffsetMs)
  return `${twoDigits(hcmcTime.getUTCDate())}/${twoDigits(hcmcTime.getUTCMonth() + 1)} · ${twoDigits(hcmcTime.getUTCHours())}:${twoDigits(hcmcTime.getUTCMinutes())}`
}

function twoDigits(value: number) {
  return String(value).padStart(2, '0')
}
