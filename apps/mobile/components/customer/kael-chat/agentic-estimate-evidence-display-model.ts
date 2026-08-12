import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import {
  agenticProblemTaxonomyLabel,
  looksLikeRawProblemTaxonomy,
} from './case-work-display-model'
import { customerVisibleCaseRequestText } from './kael-chat-turn-display-model'
import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>
export function problemReceiptDetail(
  problem: NonNullable<NonNullable<AgenticEstimate['analysis_receipt']>['problem']>,
  fallbackProblemLabel: string,
  language: AppLanguage,
) {
  const mappedSummary = agenticProblemTaxonomyLabel(problem.summary, language)
  const summary = mappedSummary || (looksLikeRawProblemTaxonomy(problem.summary)
    ? fallbackProblemLabel
    : problem.summary)
  if (problem.severity_indicators.length === 0) return summary
  const indicators = problem.severity_indicators
    .map((indicator) => indicator.trim().replace(/[.;]+$/u, ''))
    .join('; ')
  return language === 'vi'
    ? `${summary}\nDấu hiệu đáng chú ý: ${indicators}.`
    : `${summary}\nNotable signs: ${indicators}.`
}

function evidenceFindingLabel(
  finding: Pick<
    NonNullable<NonNullable<AgenticEstimate['analysis_receipt']>['evidence']['findings']>[number],
    'evidence_index' | 'evidence_kind'
  >,
  language: AppLanguage,
) {
  if (language === 'vi') {
    return finding.evidence_kind === 'photo'
      ? `Hình ${finding.evidence_index}`
      : `Khung hình video ${finding.evidence_index}`
  }
  return finding.evidence_kind === 'photo'
    ? `Photo ${finding.evidence_index}`
    : `Video frame ${finding.evidence_index}`
}

function evidenceFindingDetail(
  finding: NonNullable<NonNullable<AgenticEstimate['analysis_receipt']>['evidence']['findings']>[number],
  language: AppLanguage,
) {
  return evidenceFindingSections(finding, language)
    .map((section) => section.value)
    .join('\n')
}

function evidenceFindingSections(
  finding: NonNullable<NonNullable<AgenticEstimate['analysis_receipt']>['evidence']['findings']>[number],
  language: AppLanguage,
) {
  return [
    {
      label: language === 'vi' ? 'Mức tin cậy' : 'Confidence',
      value: confidenceLabel(finding.confidence, language),
    },
    {
      label: language === 'vi' ? 'Quan sát' : 'Observation',
      value: finding.observation,
    },
    ...(finding.possible_meaning
      ? [{
          label: language === 'vi' ? 'Khả năng liên quan' : 'Possible meaning',
          value: finding.possible_meaning,
        }]
      : []),
  ]
}

export function evidenceAnalysisRows(
  evidence: NonNullable<AgenticEstimate['analysis_receipt']>['evidence'],
  language: AppLanguage,
  evidencePreviews: NonNullable<KaelChatResponse['session']['evidence_previews']>,
): AgenticEstimateSupportingPhaseModel['rows'] {
  const findings = evidence.findings ?? []
  const rows: AgenticEstimateSupportingPhaseModel['rows'] = []
  const findingsByEvidence = new Map<string, typeof findings[number]>()
  for (const finding of findings) {
    const lookupKey = evidenceLookupKey(finding.evidence_kind, finding.evidence_index)
    if (!findingsByEvidence.has(lookupKey)) findingsByEvidence.set(lookupKey, finding)
  }
  const previewsByEvidence = new Map<string, typeof evidencePreviews[number]>()
  for (const preview of evidencePreviews) {
    const lookupKey = evidenceLookupKey(preview.evidence_kind, preview.evidence_index)
    if (!previewsByEvidence.has(lookupKey)) previewsByEvidence.set(lookupKey, preview)
  }
  const kinds = [
    { count: evidence.photo_count, kind: 'photo' as const },
    { count: evidence.video_frame_count, kind: 'video_frame' as const },
  ]

  for (const { count, kind } of kinds) {
    for (let evidenceIndex = 1; evidenceIndex <= count; evidenceIndex += 1) {
      const lookupKey = evidenceLookupKey(kind, evidenceIndex)
      const finding = findingsByEvidence.get(lookupKey)
      const key = `evidence-${kind}-${evidenceIndex}` as const
      const mediaUrl = previewsByEvidence.get(lookupKey)?.url
      if (finding) {
        const sections = evidenceFindingSections(finding, language)
        rows.push({
          detail: evidenceFindingDetail(finding, language),
          key,
          label: evidenceFindingLabel(finding, language),
          layout: 'stacked',
          mediaUrl,
          sections,
        })
        continue
      }

      const unavailable = evidence.analysis_status === 'unavailable'
      const detail = language === 'vi'
        ? unavailable
          ? 'Kael chưa thể phân tích hình này nên không dùng nó cho kết luận hoặc khoảng giá.'
          : 'Hình này chưa có chi tiết đủ rõ để dùng vào kết luận.'
        : unavailable
          ? 'Kael could not analyze this image, so it is not used for the conclusion or price range.'
          : 'This image does not contain a clear enough detail to support the conclusion.'
      rows.push({
        detail,
        key,
        label: evidenceFindingLabel({ evidence_index: evidenceIndex, evidence_kind: kind }, language),
        layout: 'stacked',
        mediaUrl,
        sections: [{ label: language === 'vi' ? 'Trạng thái' : 'Status', value: detail }],
      })
    }
  }
  return rows
}

function evidenceLookupKey(kind: 'photo' | 'video_frame', evidenceIndex: number) {
  return `${kind}:${evidenceIndex}`
}

export function estimateScopeSections(
  estimate: AgenticEstimate,
  diagnosisScope: Record<string, unknown> | null | undefined,
  fallbackProblemLabel: string,
  language: AppLanguage,
) {
  const facts = recordValue(diagnosisScope?.facts)
  const customerGoal = stringValue(facts?.customer_goal)
  const latestCustomerDetail = stringValue(facts?.latest_customer_detail)
  const customerGoalParts = scopeDescriptionParts(customerGoal, language)
  const latestCustomerDetailParts = scopeDescriptionParts(latestCustomerDetail, language)
  const receiptSummary = estimate.analysis_receipt?.problem?.summary
  const receiptScope = receiptSummary
    ? agenticProblemTaxonomyLabel(receiptSummary, language) ||
      (looksLikeRawProblemTaxonomy(receiptSummary) ? '' : scopeDescription(receiptSummary, language))
    : ''
  const primary = customerGoalParts[0] ||
    receiptScope ||
    fallbackProblemLabel
  const primaryKey = normalizeScopeText(primary)
  const additions: string[] = []
  const additionKeys = new Set<string>()

  for (const part of [...customerGoalParts.slice(1), ...latestCustomerDetailParts]) {
    const normalized = normalizeScopeText(part)
    if (!normalized || normalized === primaryKey || normalized.includes(primaryKey)) continue
    if (additionKeys.has(normalized)) continue
    additions.push(part)
    additionKeys.add(normalized)
  }

  return [
    {
      label: language === 'vi' ? 'Mô tả chính' : 'Main description',
      value: primary,
    },
    ...(additions.length > 0
      ? [{
          label: language === 'vi' ? 'Thông tin bổ sung' : 'Additional information',
          value: additions.join('\n'),
        }]
      : []),
  ]
}

function scopeDescriptionParts(value: string | null, language: AppLanguage) {
  if (!value) return []
  const updateMarker = language === 'vi'
    ? /(Thông tin bổ sung|Bổ sung(?: lần (?:hai|ba|\d+))?|Tôi vừa kiểm tra lại)\s*:\s*/giu
    : /(Additional information|Update(?: number \d+)?)\s*:\s*/giu
  return value
    .replace(updateMarker, '\n\n$1: ')
    .split(/\n{2,}/u)
    .flatMap((part) => {
      const description = scopeDescription(part, language)
      return description ? [description] : []
    })
}

function scopeDescription(value: string | null, language: AppLanguage) {
  if (!value) return ''
  const visible = customerVisibleCaseRequestText(value, language).trim()
  if (!visible) return ''
  const descriptionLabel = language === 'vi' ? 'Mô tả:' : 'Description:'
  const descriptionIndex = visible.indexOf(descriptionLabel)
  const description = descriptionIndex >= 0
    ? visible.slice(descriptionIndex + descriptionLabel.length).trim()
    : visible
  return sentenceCase(description
    .replace(/^(?:Mô tả đã xác nhận|Confirmed description)\s*:\s*/iu, '')
    .replace(/^(?:Thông tin bổ sung|Bổ sung(?: lần (?:hai|ba|\d+))?|Tôi vừa kiểm tra lại|Additional information|Update(?: number \d+)?)\s*:\s*/iu, '')
    .trim())
}

function normalizeScopeText(value: string) {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi-VN')
}

function sentenceCase(value: string) {
  if (!value) return value
  return `${value.charAt(0).toLocaleUpperCase('vi-VN')}${value.slice(1)}`
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function confidenceLabel(
  confidence: 'low' | 'medium' | 'high',
  language: AppLanguage,
) {
  if (language === 'vi') {
    if (confidence === 'high') return 'Cao'
    if (confidence === 'medium') return 'Vừa'
    return 'Thấp'
  }
  if (confidence === 'high') return 'High'
  if (confidence === 'medium') return 'Medium'
  return 'Low'
}
