import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import { customerV21CommonCopy } from './copy'
import {
  agenticProblemTaxonomyLabel,
  formatVnd,
  looksLikeRawProblemTaxonomy,
} from './case-work-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export type AgenticEstimateSupportingPhaseModel = {
  title: string
  rows: {
    detail: string
    key: 'evidence' | 'scope' | 'price'
    label: string
  }[]
  valueStatement: string
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
): AgenticEstimateSupportingPhaseModel | null {
  const receipt = estimate.analysis_receipt
  if (!receipt || receipt.schema_version !== 'analysis_receipt.v1') return null
  const scopeReason = estimate.complexity_reasoning?.trim()
  const scopeDetail = [
    `${agenticEstimateProblemLabel(estimate, language)}.`,
    scopeReason || `${language === 'vi' ? 'Mức độ' : 'Complexity'}: ${complexityLabel(estimate.complexity, language)}.`,
  ].join('\n')
  return {
    title: language === 'vi' ? 'Kael đã kiểm tra' : 'Kael completed these checks',
    rows: [
      {
        detail: evidenceReceiptDetail(receipt.evidence, language),
        key: 'evidence',
        label: language === 'vi' ? 'Bằng chứng' : 'Evidence',
      },
      {
        detail: scopeDetail,
        key: 'scope',
        label: language === 'vi' ? 'Phạm vi' : 'Scope',
      },
      {
        detail: priceReceiptDetail(estimate, language),
        key: 'price',
        label: language === 'vi' ? 'Cơ sở giá' : 'Price basis',
      },
    ],
    valueStatement: language === 'vi'
      ? 'Khoảng giá gắn với phạm vi hiện tại; phần phát sinh chỉ được tính sau khi bạn xác nhận.'
      : 'This range is tied to the current scope; extra work is priced only after you approve it.',
  }
}

function evidenceReceiptDetail(
  evidence: NonNullable<AgenticEstimate['analysis_receipt']>['evidence'],
  language: AppLanguage,
) {
  const parts = language === 'vi'
    ? [
        evidence.photo_count > 0 ? `${evidence.photo_count} ảnh` : null,
        evidence.video_frame_count > 0 ? `${evidence.video_frame_count} khung hình video` : null,
        evidence.voice_transcript_count > 0
          ? `${evidence.voice_transcript_count} bản chép lời đã duyệt`
          : null,
      ]
    : [
        evidence.photo_count > 0
          ? `${evidence.photo_count} ${evidence.photo_count === 1 ? 'photo' : 'photos'}`
          : null,
        evidence.video_frame_count > 0
          ? `${evidence.video_frame_count} video ${evidence.video_frame_count === 1 ? 'frame' : 'frames'}`
          : null,
        evidence.voice_transcript_count > 0
          ? `${evidence.voice_transcript_count} reviewed ${evidence.voice_transcript_count === 1 ? 'transcript' : 'transcripts'}`
          : null,
      ]
  const visible = parts.filter((part): part is string => Boolean(part))
  if (visible.length > 0) return `${visible.join(' · ')}.`
  if (evidence.skipped) {
    return language === 'vi'
      ? 'Không có bằng chứng kèm theo; Kael chỉ dùng mô tả đã xác nhận.'
      : 'No evidence was attached; Kael used only the confirmed description.'
  }
  return language === 'vi'
    ? 'Mô tả và phạm vi đã xác nhận.'
    : 'Confirmed description and scope.'
}

function priceReceiptDetail(estimate: AgenticEstimate, language: AppLanguage) {
  const acceptedSources = estimate.analysis_receipt?.market.accepted_source_count
  const quorumMet = estimate.analysis_receipt?.market.quorum_met
  if (estimate.price_source === 'inspection_required' || quorumMet === false) {
    return language === 'vi'
      ? 'Dữ liệu giá chưa đủ chắc chắn; cần khảo sát trước khi chốt.'
      : 'Pricing evidence is not yet strong enough; an inspection is required.'
  }
  if (estimate.price_source === 'baseline_with_market') {
    if (acceptedSources && acceptedSources > 0) {
      return language === 'vi'
        ? `Mức giá cơ sở và ${acceptedSources} nguồn giá đã kiểm chứng.`
        : `Governed baseline and ${acceptedSources} validated market ${acceptedSources === 1 ? 'source' : 'sources'}.`
    }
    return language === 'vi'
      ? 'Mức giá cơ sở và tín hiệu giá đã kiểm chứng.'
      : 'Governed baseline and validated market signals.'
  }
  if (estimate.price_source === 'perplexity_validated') {
    return acceptedSources && acceptedSources > 0
      ? (language === 'vi'
          ? `${acceptedSources} nguồn giá thị trường đã kiểm chứng.`
          : `${acceptedSources} validated market ${acceptedSources === 1 ? 'source' : 'sources'}.`)
      : (language === 'vi' ? 'Dữ liệu giá thị trường đã kiểm chứng.' : 'Validated market price data.')
  }
  if (estimate.price_source === 'baseline_only') {
    return language === 'vi'
      ? 'Mức giá cơ sở đã được kiểm soát theo phạm vi và khu vực.'
      : 'Governed baseline for the current scope and area.'
  }
  return language === 'vi'
    ? 'Dữ liệu giá đã được đối chiếu theo phạm vi hiện tại.'
    : 'Price data checked against the current scope.'
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
