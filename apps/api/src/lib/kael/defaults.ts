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
