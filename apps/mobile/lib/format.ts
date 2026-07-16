// Locale-aware formatting prevents English mode from inheriting Vietnamese grouping.
import type { AppLanguage } from './app-language'

const vndFormatters: Record<AppLanguage, Intl.NumberFormat> = {
  vi: new Intl.NumberFormat('vi-VN'),
  en: new Intl.NumberFormat('en-US'),
}

export function formatVnd(value: number, language: AppLanguage = 'vi'): string {
  const formatter = vndFormatters[language] ?? vndFormatters.vi
  if (!Number.isFinite(value)) return language === 'en' ? '0 VND' : '0 ₫'
  const formatted = formatter.format(Math.round(value))
  return language === 'en' ? `${formatted} VND` : `${formatted} ₫`
}

export function formatVndRange(
  min: number,
  max: number,
  language: AppLanguage = 'vi',
): string {
  return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
}
