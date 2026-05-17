import type { ComplexityLevel } from '@home-services/shared'

// Fallback price baselines — used ONLY when DB price_baselines table
// returns no data. Production: admin manages baselines in Supabase.
// These exist so the system can still function during cold-start
// before any baselines are seeded.
const FALLBACK_BASELINES: Record<ComplexityLevel, { priceMin: number; priceMax: number }> = {
  small: { priceMin: 150_000, priceMax: 350_000 },
  medium: { priceMin: 250_000, priceMax: 700_000 },
  large: { priceMin: 500_000, priceMax: 1_500_000 },
}

export function getFallbackBaseline(complexity: ComplexityLevel): { priceMin: number; priceMax: number } {
  return FALLBACK_BASELINES[complexity] ?? FALLBACK_BASELINES.medium
}

// Severity keywords that trigger advisory messages.
// Production: move to Supabase advisory_config table for admin control.
const HIGH_SEVERITY_KEYWORDS = [
  'nguy hiểm', 'cháy', 'rò rỉ lớn', 'mùi khét',
  'chập', 'nứt', 'ngập', 'hỏng nặng',
]

export function hasHighSeverity(indicators: string[]): boolean {
  return indicators.some((indicator) =>
    HIGH_SEVERITY_KEYWORDS.some((kw) =>
      indicator.toLowerCase().includes(kw),
    ),
  )
}

export const SEVERITY_ADVISORY =
  'Lưu ý: Vấn đề có dấu hiệu nghiêm trọng. Thợ sẽ kiểm tra kỹ trước khi bắt đầu sửa chữa.'
