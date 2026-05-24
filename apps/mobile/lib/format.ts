// Phase 5.8 (plan §22.10.I, 2026-05-23): one helper for VND formatting.
// Locale aware so EN mode does not silently fall back to Vietnamese grouping.
// Keeps every surface honest about currency presentation.
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
