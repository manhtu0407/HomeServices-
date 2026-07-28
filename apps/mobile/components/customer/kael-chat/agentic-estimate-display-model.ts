import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import { customerV21CommonCopy } from '../ui/copy'
import {
  agenticProblemTaxonomyLabel,
  formatVnd,
  looksLikeRawProblemTaxonomy,
} from './case-work-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export function agenticEstimateProblemLabel(
  estimate: AgenticEstimate,
  language: AppLanguage,
) {
  const candidates = [
    estimate.problem_summary,
    estimate.problem_category,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const candidate of candidates) {
    const mapped = agenticProblemTaxonomyLabel(candidate, language)
    if (mapped) return mapped
    if (!looksLikeRawProblemTaxonomy(candidate)) return candidate.trim()
  }
  return customerV21CommonCopy[language].dataPending
}

export function agenticEstimatePriceExplanation(
  estimate: AgenticEstimate,
  language: AppLanguage,
) {
  const range = formatPriceRange(estimate.price_min, estimate.price_max, language)
  if (language === 'vi') {
    return `Cách tính: Kael đối chiếu loại dịch vụ, vấn đề "${agenticEstimateProblemLabel(estimate, language)}", khu vực, bằng chứng hiện trạng và độ phức tạp để ra khoảng ${range}.`
  }
  return `How Kael estimated: service type, "${agenticEstimateProblemLabel(estimate, language)}", area, current evidence, and complexity produce the ${range} range.`
}

export function agenticEstimateSourceExplanation(language: AppLanguage) {
  return language === 'vi'
    ? 'Nguồn giá: dữ liệu hệ thống và bằng chứng bạn gửi. Giá cuối vẫn cần công việc thật và phạm vi đã xác nhận.'
    : 'Source: system data and your evidence. Final price still requires a real job and confirmed scope.'
}

export function formatPriceRange(min: number, max: number, language: AppLanguage = 'vi') {
  if (min === max) return formatVnd(min, language)
  return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
}
