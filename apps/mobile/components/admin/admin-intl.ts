import type { AppLanguage } from '@/lib/app-language'

type AdminDateTimeStyle = 'medium' | 'numeric' | 'short'

const locales = { en: 'en-US', vi: 'vi-VN' } as const
const dateTimeFormatters: Record<AppLanguage, Record<AdminDateTimeStyle, Intl.DateTimeFormat>> = {
  en: {
    medium: new Intl.DateTimeFormat(locales.en, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }),
    numeric: new Intl.DateTimeFormat(locales.en, { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }),
    short: new Intl.DateTimeFormat(locales.en, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }),
  },
  vi: {
    medium: new Intl.DateTimeFormat(locales.vi, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }),
    numeric: new Intl.DateTimeFormat(locales.vi, { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }),
    short: new Intl.DateTimeFormat(locales.vi, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }),
  },
}
const numberFormatters: Record<AppLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(locales.en),
  vi: new Intl.NumberFormat(locales.vi),
}
const vndFormatters: Record<AppLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(locales.en, { currency: 'VND', maximumFractionDigits: 0, style: 'currency' }),
  vi: new Intl.NumberFormat(locales.vi, { currency: 'VND', maximumFractionDigits: 0, style: 'currency' }),
}

export function formatAdminDateTime(value: string, language: AppLanguage, style: AdminDateTimeStyle = 'medium') {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatters[language][style].format(date)
}

export function formatAdminNumber(value: number, language: AppLanguage) {
  return numberFormatters[language].format(value)
}

export function formatAdminVnd(value: number, language: AppLanguage) {
  return vndFormatters[language].format(value)
}
