import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import { customerV21CommonCopy, customerV21ServiceCopy } from '../ui/copy'
import {
  agenticProblemTaxonomyLabel,
  formatVnd,
  looksLikeRawProblemTaxonomy,
} from './case-work-display-model'
import { customerVisibleCaseRequestText } from './kael-chat-turn-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export type AgenticEstimateSupportingPhaseModel = {
  title: string
  rows: {
    detail: string
    key:
      | 'conclusion'
      | 'evidence'
      | `evidence-photo-${number}`
      | `evidence-video_frame-${number}`
      | 'price'
      | 'problem'
      | 'resolution'
      | 'scope'
      | 'uncertainty'
    label: string
    layout?: 'columns' | 'stacked'
    mediaUrl?: string
    sections?: {
      label: string
      value: string
    }[]
  }[]
  valueStatement: string
}

export function agenticEstimateHeaderTitle(
  estimate: AgenticEstimate,
  language: AppLanguage,
) {
  return customerV21ServiceCopy[language][estimate.service_type].label
}

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
  _estimate: AgenticEstimate,
  language: AppLanguage,
) {
  return language === 'vi'
    ? 'Khoảng ước tính theo phạm vi hiện tại.'
    : 'Estimated range for the current scope.'
}

export function agenticEstimateSourceExplanation(language: AppLanguage) {
  return language === 'vi'
    ? 'Cơ sở giá được đối chiếu theo phạm vi, khu vực và dữ liệu đã kiểm chứng. Giá cuối phụ thuộc công việc thực tế.'
    : 'The price basis is checked against the scope, area, and validated data. Final price depends on the actual work.'
}

export function agenticEstimateSupportingPhase(
  estimate: AgenticEstimate,
  language: AppLanguage,
  diagnosisScope?: Record<string, unknown> | null,
  evidencePreviews: NonNullable<KaelChatResponse['session']['evidence_previews']> = [],
): AgenticEstimateSupportingPhaseModel | null {
  const receipt = estimate.analysis_receipt
  if (!receipt || receipt.schema_version !== 'analysis_receipt.v1') return null
  const problemReceipt = receipt.problem
  const evidenceFindings = receipt.evidence.findings ?? []
  const analysisCompleted = receipt.evidence.analysis_status === 'analyzed' ||
    (receipt.evidence.analysis_status === undefined && evidenceFindings.length > 0)
  const enriched = Boolean(problemReceipt || evidenceFindings.length)
  const rows: AgenticEstimateSupportingPhaseModel['rows'] = []

  if (problemReceipt) {
    rows.push({
      detail: problemReceiptDetail(problemReceipt, estimate, language),
      key: 'problem',
      label: analysisCompleted
        ? (language === 'vi' ? 'Vấn đề Kael nhận thấy' : 'What Kael found')
        : (language === 'vi' ? 'Vấn đề đã xác nhận' : 'Confirmed issue'),
    })
  }

  const hasSubmittedEvidence = receipt.evidence.photo_count > 0 ||
    receipt.evidence.video_frame_count > 0 ||
    receipt.evidence.voice_transcript_count > 0
  const evidenceRows = evidenceAnalysisRows(receipt.evidence, language, evidencePreviews)
  const evidenceDetail = evidenceReceiptDetail(
    receipt.evidence,
    language,
    evidenceRows.length === 0,
  )
  if (evidenceDetail && (hasSubmittedEvidence || !enriched)) {
    rows.push({
      detail: evidenceDetail,
      key: 'evidence',
      label: evidenceReceiptLabel(receipt.evidence, language),
    })
  }

  rows.push(...evidenceRows)

  if (problemReceipt?.recommended_scope) {
    rows.push({
      detail: problemReceipt.recommended_scope,
      key: 'resolution',
      label: language === 'vi' ? 'Hướng xử lý đề xuất' : 'Suggested next scope',
    })
  }

  const scopeSections = estimateScopeSections(estimate, diagnosisScope, language)
  rows.push({
    detail: scopeSections.map((section) => section.value).join('\n'),
    key: 'scope',
    label: language === 'vi' ? 'Thông tin Kael đã nhận' : 'Information Kael received',
    layout: scopeSections.length > 1 ? 'columns' : 'stacked',
    sections: scopeSections,
  })
  rows.push({
    detail: priceReceiptDetail(estimate, language),
    key: 'price',
    label: enriched
      ? (language === 'vi' ? 'Vì sao có khoảng giá này' : 'Why this price range')
      : (language === 'vi' ? 'Cơ sở giá' : 'Price basis'),
  })

  if (problemReceipt?.remaining_uncertainty) {
    rows.push({
      detail: problemReceipt.remaining_uncertainty,
      key: 'uncertainty',
      label: language === 'vi' ? 'Điều chưa thể kết luận' : 'What remains uncertain',
    })
  }

  if (enriched) {
    rows.push({
      detail: estimateConclusion(estimate, language),
      key: 'conclusion',
      label: language === 'vi' ? 'Kết luận của Kael' : "Kael's conclusion",
    })
  }

  return {
    title: enriched && analysisCompleted
      ? (language === 'vi'
          ? 'Kael phân tích vấn đề và cơ sở giá'
          : 'Kael analyzed the issue and price basis')
      : enriched
        ? (language === 'vi'
            ? 'Kael kiểm tra thông tin và cơ sở giá'
            : 'Kael checked the information and price basis')
        : (language === 'vi' ? 'Kael đã kiểm tra' : 'Kael completed these checks'),
    rows,
    valueStatement: language === 'vi'
      ? 'Khoảng giá gắn với phạm vi hiện tại; phần phát sinh chỉ được tính sau khi bạn xác nhận.'
      : 'This range is tied to the current scope; extra work is priced only after you approve it.',
  }
}

function problemReceiptDetail(
  problem: NonNullable<NonNullable<AgenticEstimate['analysis_receipt']>['problem']>,
  estimate: AgenticEstimate,
  language: AppLanguage,
) {
  const mappedSummary = agenticProblemTaxonomyLabel(problem.summary, language)
  const summary = mappedSummary || (looksLikeRawProblemTaxonomy(problem.summary)
    ? agenticEstimateProblemLabel(estimate, language)
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

function evidenceAnalysisRows(
  evidence: NonNullable<AgenticEstimate['analysis_receipt']>['evidence'],
  language: AppLanguage,
  evidencePreviews: NonNullable<KaelChatResponse['session']['evidence_previews']>,
): AgenticEstimateSupportingPhaseModel['rows'] {
  const findings = evidence.findings ?? []
  const rows: AgenticEstimateSupportingPhaseModel['rows'] = []
  const kinds = [
    { count: evidence.photo_count, kind: 'photo' as const },
    { count: evidence.video_frame_count, kind: 'video_frame' as const },
  ]

  for (const { count, kind } of kinds) {
    for (let evidenceIndex = 1; evidenceIndex <= count; evidenceIndex += 1) {
      const finding = findings.find((item) => (
        item.evidence_kind === kind && item.evidence_index === evidenceIndex
      ))
      const key = `evidence-${kind}-${evidenceIndex}` as const
      const mediaUrl = evidencePreviews.find((preview) => (
        preview.evidence_kind === kind && preview.evidence_index === evidenceIndex
      ))?.url
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

function estimateScopeSections(
  estimate: AgenticEstimate,
  diagnosisScope: Record<string, unknown> | null | undefined,
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
    agenticEstimateProblemLabel(estimate, language)
  const primaryKey = normalizeScopeText(primary)
  const additions: string[] = []

  for (const part of [...customerGoalParts.slice(1), ...latestCustomerDetailParts]) {
    const normalized = normalizeScopeText(part)
    if (!normalized || normalized === primaryKey || normalized.includes(primaryKey)) continue
    if (additions.some((current) => normalizeScopeText(current) === normalized)) continue
    additions.push(part)
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
    .map((part) => scopeDescription(part, language))
    .filter(Boolean)
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

function estimateConclusion(estimate: AgenticEstimate, language: AppLanguage) {
  if (estimate.needs_inspection || estimate.price_source === 'inspection_required') {
    return language === 'vi'
      ? 'Khoảng ước tính hiển thị phía trên chỉ để tham khảo; cần khảo sát hiện trường trước khi chốt.'
      : 'The estimate shown above is for reference only; an on-site inspection is required before confirmation.'
  }
  return language === 'vi'
    ? 'Kael đề xuất khoảng ước tính hiển thị phía trên cho phạm vi đã xác nhận.'
    : 'Kael proposes the estimate shown above for the confirmed scope.'
}

function evidenceReceiptDetail(
  evidence: NonNullable<AgenticEstimate['analysis_receipt']>['evidence'],
  language: AppLanguage,
  includeVisualEvidence = true,
) {
  const parts = language === 'vi'
    ? [
        includeVisualEvidence && evidence.photo_count > 0 ? `${evidence.photo_count} ảnh` : null,
        includeVisualEvidence && evidence.video_frame_count > 0
          ? `${evidence.video_frame_count} khung hình video`
          : null,
        evidence.voice_transcript_count > 0
          ? `${evidence.voice_transcript_count} bản chép lời đã duyệt`
          : null,
      ]
    : [
        includeVisualEvidence && evidence.photo_count > 0
          ? `${evidence.photo_count} ${evidence.photo_count === 1 ? 'photo' : 'photos'}`
          : null,
        includeVisualEvidence && evidence.video_frame_count > 0
          ? `${evidence.video_frame_count} video ${evidence.video_frame_count === 1 ? 'frame' : 'frames'}`
          : null,
        evidence.voice_transcript_count > 0
          ? `${evidence.voice_transcript_count} reviewed ${evidence.voice_transcript_count === 1 ? 'transcript' : 'transcripts'}`
          : null,
      ]
  const visible = parts.filter((part): part is string => Boolean(part))
  const submittedEvidence = visible.join(' · ')
  const hasVisualEvidence = evidence.photo_count > 0 || evidence.video_frame_count > 0
  if (!includeVisualEvidence && hasVisualEvidence) {
    const voiceSuffix = submittedEvidence
      ? (language === 'vi'
          ? ` Kael cũng đã nhận ${submittedEvidence}.`
          : ` Kael also received ${submittedEvidence}.`)
      : ''
    if (evidence.analysis_status === 'unavailable') {
      return language === 'vi'
        ? `Kael đã nhận hình ảnh nhưng chưa thể xác nhận chi tiết. Các hình này không được dùng cho kết luận hoặc khoảng giá.${voiceSuffix}`
        : `Kael received visual evidence but could not verify its details. It is not used for the conclusion or price range.${voiceSuffix}`
    }
    if (evidence.analysis_status === 'analyzed') {
      const findingCount = evidence.findings?.length ?? 0
      return language === 'vi'
        ? `${findingCount > 0
            ? 'Kael đã đối chiếu từng hình; các chi tiết liên quan được trình bày bên dưới.'
            : 'Kael đã đối chiếu từng hình; chưa có chi tiết đủ rõ để dùng làm kết luận.'}${voiceSuffix}`
        : `${findingCount > 0
            ? 'Kael checked each visual item; relevant details are shown below.'
            : 'Kael checked each visual item; no detail was clear enough to support a conclusion.'}${voiceSuffix}`
    }
    return language === 'vi'
      ? `Kael đã nhận hình ảnh; từng hình được trình bày bên dưới.${voiceSuffix}`
      : `Kael received visual evidence; each item is shown below.${voiceSuffix}`
  }
  if (!includeVisualEvidence) {
    return submittedEvidence
      ? (language === 'vi'
          ? `Kael đã nhận ${submittedEvidence}.`
          : `Kael received ${submittedEvidence}.`)
      : null
  }
  if (evidence.analysis_status === 'unavailable' && submittedEvidence) {
    return language === 'vi'
      ? `Kael đã nhận ${submittedEvidence} nhưng chưa thể xác nhận chi tiết hình ảnh. Khoảng giá chưa dựa trên suy luận từ phần hình ảnh này.`
      : `Kael received ${submittedEvidence} but could not verify the visual details. The price range does not rely on inferences from this visual evidence.`
  }
  if (evidence.analysis_status === 'analyzed' && submittedEvidence) {
    const findingCount = evidence.findings?.length ?? 0
    if (findingCount > 0) {
      return language === 'vi'
        ? `Kael đã đối chiếu ${submittedEvidence}; ${findingCount} chi tiết liên quan được trình bày bên dưới.`
        : `Kael checked ${submittedEvidence}; ${findingCount} relevant ${findingCount === 1 ? 'detail is' : 'details are'} shown below.`
    }
    return language === 'vi'
      ? `Kael đã đối chiếu ${submittedEvidence}; chưa có chi tiết đủ rõ để dùng làm kết luận.`
      : `Kael checked ${submittedEvidence}; no detail was clear enough to support a conclusion.`
  }
  if (visible.length > 0) return `${submittedEvidence}.`
  if (evidence.skipped) {
    return language === 'vi'
      ? 'Không có bằng chứng kèm theo; Kael chỉ dùng mô tả đã xác nhận.'
      : 'No evidence was attached; Kael used only the confirmed description.'
  }
  return language === 'vi'
    ? 'Mô tả và phạm vi đã xác nhận.'
    : 'Confirmed description and scope.'
}

function evidenceReceiptLabel(
  evidence: NonNullable<AgenticEstimate['analysis_receipt']>['evidence'],
  language: AppLanguage,
) {
  if (evidence.analysis_status === 'unavailable') {
    return language === 'vi' ? 'Trạng thái bằng chứng' : 'Evidence status'
  }
  if (evidence.analysis_status === 'analyzed') {
    return language === 'vi' ? 'Bằng chứng đã đối chiếu' : 'Checked evidence'
  }
  return language === 'vi' ? 'Bằng chứng' : 'Evidence'
}

function priceReceiptDetail(estimate: AgenticEstimate, language: AppLanguage) {
  const acceptedSources = estimate.analysis_receipt?.market.accepted_source_count
  const highTrustSources = estimate.analysis_receipt?.market.high_trust_source_count
  const quorumMet = estimate.analysis_receipt?.market.quorum_met
  const priceConfidence = estimate.needs_inspection || estimate.price_source === 'inspection_required'
    ? 'low'
    : estimate.confidence >= 0.75
      ? 'high'
      : estimate.confidence >= 0.45
        ? 'medium'
        : 'low'
  const confidence = language === 'vi'
    ? `Mức tin cậy của khoảng giá: ${confidenceLabel(priceConfidence, language)}.`
    : `Price-range confidence: ${confidenceLabel(priceConfidence, language)}.`
  if (estimate.price_source === 'inspection_required') {
    return language === 'vi'
      ? `${confidence}\nBằng chứng chưa đủ để chốt mức độ và hạng mục có thể bị che khuất; cần khảo sát hiện trường trước khi xác nhận giá.`
      : `${confidence}\nEvidence is not sufficient to confirm the severity or hidden work; an on-site inspection is required before pricing is confirmed.`
  }
  if (quorumMet === false) {
    return language === 'vi'
      ? `${confidence}\nĐối chiếu thị trường chưa đủ nguồn giá tin cậy; khoảng hiện tại dựa trên mức giá cơ sở theo phạm vi và khu vực.\nKhoảng này chưa bao gồm phần phát sinh ngoài phạm vi đã xác nhận.`
      : `${confidence}\nThe market check did not reach a sufficient trusted-source quorum, so this range relies on the governed baseline for the scope and area.\nThis range excludes work outside the confirmed scope.`
  }
  const priceBasis = priceEvidenceBasis(estimate, acceptedSources, highTrustSources, language)
  const complexity = complexityLabel(estimate.complexity, language).toLocaleLowerCase(
    language === 'vi' ? 'vi-VN' : 'en-US',
  )
  return language === 'vi'
    ? `${confidence}\nKael đối chiếu phạm vi đã xác nhận, mức độ ${complexity} và ${priceBasis}.\nKhoảng này chưa bao gồm phần phát sinh ngoài phạm vi đã xác nhận.`
    : `${confidence}\nKael checked the confirmed scope, ${complexity} complexity, and ${priceBasis}.\nThis range excludes work outside the confirmed scope.`
}

function confidenceLabel(
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

function priceEvidenceBasis(
  estimate: AgenticEstimate,
  acceptedSources: number | null | undefined,
  highTrustSources: number | null | undefined,
  language: AppLanguage,
) {
  if (estimate.price_source === 'baseline_with_market') {
    if (acceptedSources && acceptedSources > 0) {
      return language === 'vi'
        ? `mức giá cơ sở cùng ${acceptedSources} nguồn giá được chấp nhận${highTrustSources && highTrustSources > 0 ? `, gồm ${highTrustSources} nguồn độ tin cậy cao` : ''}`
        : `a governed baseline with ${acceptedSources} accepted market ${acceptedSources === 1 ? 'source' : 'sources'}${highTrustSources && highTrustSources > 0 ? `, including ${highTrustSources} high-trust ${highTrustSources === 1 ? 'source' : 'sources'}` : ''}`
    }
    return language === 'vi'
      ? 'mức giá cơ sở cùng tín hiệu giá đã kiểm chứng'
      : 'a governed baseline with validated market signals'
  }
  if (estimate.price_source === 'perplexity_validated') {
    return acceptedSources && acceptedSources > 0
      ? (language === 'vi'
          ? `${acceptedSources} nguồn giá thị trường được chấp nhận${highTrustSources && highTrustSources > 0 ? `, gồm ${highTrustSources} nguồn độ tin cậy cao` : ''}`
          : `${acceptedSources} accepted market ${acceptedSources === 1 ? 'source' : 'sources'}${highTrustSources && highTrustSources > 0 ? `, including ${highTrustSources} high-trust ${highTrustSources === 1 ? 'source' : 'sources'}` : ''}`)
      : (language === 'vi' ? 'dữ liệu giá thị trường đã kiểm chứng' : 'validated market price data')
  }
  if (estimate.price_source === 'baseline_only') {
    return language === 'vi'
      ? 'mức giá cơ sở được kiểm soát theo phạm vi và khu vực'
      : 'a governed baseline for the current scope and area'
  }
  return language === 'vi'
    ? 'dữ liệu giá được đối chiếu theo phạm vi hiện tại'
    : 'price data checked against the current scope'
}

function complexityLabel(
  complexity: AgenticEstimate['complexity'],
  language: AppLanguage,
) {
  if (language === 'vi') {
    return complexity === 'small' ? 'Nhỏ' : complexity === 'medium' ? 'Vừa' : 'Lớn'
  }
  return complexity === 'small' ? 'Small' : complexity === 'medium' ? 'Medium' : 'Large'
}

export function formatPriceRange(min: number, max: number, language: AppLanguage = 'vi') {
  if (min === max) return formatVnd(min, language)
  return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
}
