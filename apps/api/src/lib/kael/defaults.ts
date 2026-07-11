const HIGH_SEVERITY_KEYWORDS = [
  'nguy hiểm', 'cháy', 'rò rỉ lớn', 'mùi khét',
  'chập', 'nứt', 'ngập', 'hỏng nặng', 'hazard',
  'fire', 'burning smell', 'electrical leak', 'flood', 'overflow',
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
export const SEVERITY_ADVISORY_EN =
  'Note: The evidence indicates a serious issue. A worker must inspect it carefully before work starts.'

export function severityAdvisory(language: 'vi' | 'en' = 'vi') {
  return language === 'en' ? SEVERITY_ADVISORY_EN : SEVERITY_ADVISORY
}
