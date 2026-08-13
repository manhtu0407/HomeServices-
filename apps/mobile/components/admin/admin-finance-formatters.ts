export function createFinanceFormatters(language: 'vi' | 'en', unavailable: string) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  return {
    formatCount(value: number | null | undefined) {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value ?? 0)
    },
    formatCurrency(value: number | null) {
      return new Intl.NumberFormat(locale, { currency: 'VND', maximumFractionDigits: 0, style: 'currency' }).format(value ?? 0)
    },
    formatDate(value: string | null) {
      if (!value) return unavailable
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      } catch {
        return unavailable
      }
    },
    formatPercent(value: number | null | undefined) {
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format((value ?? 0) / 100)}%`
    },
    formatUsd(value: number | null | undefined) {
      return new Intl.NumberFormat(locale, { currency: 'USD', maximumFractionDigits: 4, style: 'currency' }).format(value ?? 0)
    },
  }
}
