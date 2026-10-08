import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'

import { customerV21CommonCopy, customerV21ServiceCopy } from '../ui/copy'
import {
  agenticProblemTaxonomyLabel,
  formatVnd,
  looksLikeRawProblemTaxonomy,
} from './case-work-display-model'
import {
  confidenceLabel,
  evidenceAnalysisRows,
  estimateScopeSections,
  problemReceiptDetail,
} from './agentic-estimate-evidence-display-model'

type AgenticEstimate = NonNullable<KaelChatResponse['session']['estimate']>

export type AgenticEstimateSupportingPhaseModel = {
  receiptId: string | null
  title: string
  rows: {
    detail: string
    key:
      | 'conclusion'
      | 'costs'
      | 'evidence'
      | `evidence-photo-${number}`
      | `evidence-video_frame-${number}`
      | 'fairness'
      | 'facts'
      | 'hypotheses'
      | 'price'
      | 'problem'
      | 'resolution'
      | 'scenario_high'
      | 'scenario_low'
      | 'scope'
      | 'uncertainty'
    label: string
    layout?: 'columns' | 'stacked'
    mediaUrl?: string
    sections?: {
      label: string
      links?: {
        accessibilityLabel: string
        label: string
        url: string
      }[]
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
    ? 'Xem căn cứ, phạm vi và điều kiện trước khi đến khoảng giá ở cuối.'
    : 'Review the basis, scope, and conditions before the final range at the end.'
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
  const priceReasoningReceipt = estimate.price_reasoning_receipt
  if (priceReasoningReceipt?.schema_version === 'price_reasoning_receipt.v1') {
    return priceReasoningSupportingPhase(estimate, priceReasoningReceipt, language)
  }
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
      detail: problemReceiptDetail(
        problemReceipt,
        agenticEstimateProblemLabel(estimate, language),
        language,
      ),
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

  const scopeSections = estimateScopeSections(
    estimate,
    diagnosisScope,
    agenticEstimateProblemLabel(estimate, language),
    language,
  )
  rows.push({
    detail: scopeSections.map((section) => section.value).join('\n'),
    key: 'scope',
    label: language === 'vi' ? 'Thông tin Kael đã nhận' : 'Information Kael received',
    layout: scopeSections.length > 1 ? 'columns' : 'stacked',
    sections: scopeSections,
  })
  const priceDetail = priceReceiptDetail(estimate, language)
  rows.push({
    detail: priceDetail,
    key: 'price',
    label: enriched
      ? (language === 'vi' ? 'Vì sao có khoảng giá này' : 'Why this price range')
      : (language === 'vi' ? 'Cơ sở giá' : 'Price basis'),
    layout: 'stacked',
    sections: priceReceiptSections(estimate, priceDetail, language),
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
    receiptId: null,
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
      ? 'Không có giá hay hạng mục phát sinh nào được tự cộng sau khi bạn xác nhận.'
      : 'No price or extra work is added automatically after you approve.',
  }
}

function priceReasoningSupportingPhase(
  estimate: AgenticEstimate,
  receipt: NonNullable<AgenticEstimate['price_reasoning_receipt']>,
  language: AppLanguage,
): AgenticEstimateSupportingPhaseModel {
  const rows: AgenticEstimateSupportingPhaseModel['rows'] = [
    {
      detail: receipt.problem.confirmed_facts.join('\n'),
      key: 'facts',
      label: language === 'vi' ? 'Điều Kael đã xác nhận' : 'What Kael confirmed',
    },
  ]
  if (receipt.problem.possible_causes.length > 0) {
    rows.push({
      detail: receipt.problem.possible_causes.map((cause) => cause.statement).join('\n'),
      key: 'hypotheses',
      label: language === 'vi' ? 'Khả năng đang xem xét' : 'Possibilities being considered',
      layout: 'stacked',
      sections: receipt.problem.possible_causes.map((cause, index) => ({
        label: language === 'vi' ? `Khả năng ${index + 1}` : `Possibility ${index + 1}`,
        value: [
          cause.statement,
          language === 'vi'
            ? `Căn cứ: ${cause.basis.map((basis) => priceReasoningBasisLabel(basis, language)).join(', ')}.`
            : `Basis: ${cause.basis.map((basis) => priceReasoningBasisLabel(basis, language)).join(', ')}.`,
          language === 'vi'
            ? `Mức tin cậy: ${confidenceLabel(cause.confidence, language)}.`
            : `Confidence: ${confidenceLabel(cause.confidence, language)}.`,
        ].join('\n'),
      })),
    })
  }
  if (receipt.problem.unknowns.length > 0) {
    rows.push({
      detail: receipt.problem.unknowns.join('\n'),
      key: 'uncertainty',
      label: language === 'vi' ? 'Điều chưa thể kết luận' : 'What remains unknown',
    })
  }

  const scopeSections = [
    ...(receipt.scope.included.length > 0 ? [{
      label: language === 'vi' ? 'Bao gồm' : 'Included',
      value: receipt.scope.included.join('\n'),
    }] : []),
    ...(receipt.scope.conditional.length > 0 ? [{
      label: language === 'vi' ? 'Có điều kiện' : 'Conditional',
      value: receipt.scope.conditional.join('\n'),
    }] : []),
    ...(receipt.scope.excluded.length > 0 ? [{
      label: language === 'vi' ? 'Không bao gồm' : 'Excluded',
      value: receipt.scope.excluded.join('\n'),
    }] : []),
  ]
  rows.push({
    detail: scopeSections.map((section) => section.value).join('\n'),
    key: 'scope',
    label: language === 'vi' ? 'Phạm vi của đề nghị này' : 'Scope of this offer',
    layout: 'stacked',
    sections: scopeSections,
  })

  const costSections = receipt.costs.components.map((component) => ({
    label: priceReasoningComponentLabel(component.kind, language),
    value: [
      component.explanation,
      priceReasoningComponentAmount(component, language),
    ].join('\n'),
  }))
  rows.push({
    detail: costSections.map((section) => section.value).join('\n'),
    key: 'costs',
    label: language === 'vi' ? 'Cách cấu thành mức giá' : 'How the price is formed',
    layout: 'stacked',
    sections: costSections,
  })
  rows.push({
    detail: scenarioDetail(receipt.scenarios.low),
    key: 'scenario_low',
    label: language === 'vi' ? 'Kịch bản ở mức thấp' : 'Lower-range scenario',
    layout: 'stacked',
    sections: scenarioSections(receipt.scenarios.low, language),
  })
  rows.push({
    detail: scenarioDetail(receipt.scenarios.high),
    key: 'scenario_high',
    label: language === 'vi' ? 'Kịch bản ở mức cao' : 'Upper-range scenario',
    layout: 'stacked',
    sections: scenarioSections(receipt.scenarios.high, language),
  })

  const fairnessSections = [
    {
      label: language === 'vi' ? 'Căn cứ giá' : 'Price basis',
      value: priceReasoningSourceLabel(receipt.fairness.price_source, language),
    },
    {
      label: language === 'vi' ? 'Mức tin cậy' : 'Confidence',
      value: confidenceLabel(receipt.fairness.confidence, language),
    },
    {
      label: priceReasoningEvidenceLabel(receipt, language),
      value: priceReasoningMarketDetail(receipt, language),
      links: priceReasoningSourceLinks(receipt, language),
    },
    {
      label: language === 'vi' ? 'Giới hạn khi xác nhận' : 'Limit when you approve',
      value: receipt.fairness.cap_statement,
    },
  ]
  rows.push({
    detail: fairnessSections.map((section) => section.value).join('\n'),
    key: 'fairness',
    label: language === 'vi' ? 'Vì sao đề nghị này công bằng' : 'Why this offer is fair',
    layout: 'stacked',
    sections: fairnessSections,
  })
  rows.push({
    detail: priceReasoningConclusion(receipt, language),
    key: 'conclusion',
    label: language === 'vi' ? 'Kết luận trước khi bạn quyết định' : 'Conclusion before you decide',
  })
  rows.push({
    detail: formatPriceRange(receipt.costs.total_min, receipt.costs.total_max, language),
    key: 'price',
    label: language === 'vi' ? 'Khoảng giá cho phạm vi hiện tại' : 'Price range for the current scope',
    layout: 'stacked',
    sections: [{
      label: language === 'vi' ? 'Khoảng bạn có thể xác nhận' : 'Range you can approve',
      value: formatPriceRange(receipt.costs.total_min, receipt.costs.total_max, language),
    }],
  })

  return {
    receiptId: receipt.receipt_id,
    title: language === 'vi'
      ? 'Kael phân tích phạm vi trước khi đề nghị giá'
      : 'Kael analyzed the scope before proposing a price',
    rows,
    valueStatement: language === 'vi'
      ? 'Giá chỉ áp dụng cho phạm vi trên. Hạng mục ngoài phạm vi cần một đề nghị mới để bạn quyết định riêng.'
      : 'This price applies only to the scope above. Work outside it needs a new proposal for your separate decision.',
  }
}

function priceReasoningSourceLinks(
  receipt: NonNullable<AgenticEstimate['price_reasoning_receipt']>,
  language: AppLanguage,
) {
  const sources = receipt.fairness.market_sources?.length
    ? receipt.fairness.market_sources
    : receipt.fairness.baseline_evidence?.sources ?? []
  const seen = new Set<string>()
  return sources.flatMap((source) => {
    const domain = source.domain.trim().toLowerCase()
    try {
      const url = new URL(source.url)
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        url.hostname.toLowerCase() !== domain ||
        seen.has(domain)
      ) return []
      seen.add(domain)
      return [{
        accessibilityLabel: language === 'vi'
          ? `Mở nguồn giá ${domain}`
          : `Open price source ${domain}`,
        label: domain,
        url: url.toString(),
      }]
    } catch {
      return []
    }
  }).slice(0, 10)
}

function priceReasoningBasisLabel(
  basis: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['problem']['possible_causes']>[number]['basis'][number],
  language: AppLanguage,
) {
  if (language === 'vi') {
    if (basis === 'customer_report') return 'mô tả của bạn'
    if (basis === 'visual_evidence') return 'hình ảnh/video đã đối chiếu'
    if (basis === 'service_profile') return 'hồ sơ dịch vụ'
    return 'kiến thức chuyên môn áp dụng cho dịch vụ'
  }
  if (basis === 'customer_report') return 'your description'
  if (basis === 'visual_evidence') return 'checked visual evidence'
  if (basis === 'service_profile') return 'the service profile'
  return 'service knowledge'
}

function priceReasoningComponentLabel(
  kind: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['costs']['components']>[number]['kind'],
  language: AppLanguage,
) {
  if (language === 'vi') {
    if (kind === 'service_package') return 'Gói dịch vụ'
    if (kind === 'labor') return 'Tiền công'
    if (kind === 'travel') return 'Di chuyển'
    if (kind === 'materials') return 'Vật tư'
    if (kind === 'replacement_parts') return 'Linh kiện thay thế'
    if (kind === 'equipment') return 'Thiết bị'
    return 'Hạng mục khác'
  }
  if (kind === 'service_package') return 'Service package'
  if (kind === 'labor') return 'Labor'
  if (kind === 'travel') return 'Travel'
  if (kind === 'materials') return 'Materials'
  if (kind === 'replacement_parts') return 'Replacement parts'
  if (kind === 'equipment') return 'Equipment'
  return 'Other item'
}

function priceReasoningComponentAmount(
  component: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['costs']['components']>[number],
  language: AppLanguage,
) {
  if (component.status === 'priced' && component.amount_min !== null && component.amount_max !== null) {
    return language === 'vi'
      ? 'Gói này đã được xác thực; khoảng bạn có thể xác nhận được hiển thị ở phần cuối.'
      : 'This package is verified; the range you can approve appears at the end.'
  }
  if (language === 'vi') {
    if (component.status === 'included_unitemized') return 'Đã tính trong gói nhưng chưa có đơn giá thành phần độc lập.'
    if (component.status === 'conditional_unpriced') return 'Chưa có số tiền; chỉ đánh giá khi điều kiện thực tế được xác nhận.'
    if (component.status === 'excluded') return 'Không nằm trong khoảng giá hiện tại.'
    return 'Chưa đủ dữ liệu để định lượng; không hiển thị số tiền.'
  }
  if (component.status === 'included_unitemized') return 'Included in the package without a separate verified component price.'
  if (component.status === 'conditional_unpriced') return 'No amount is shown until the on-site condition is confirmed.'
  if (component.status === 'excluded') return 'Not included in the current price range.'
  return 'There is not enough information to quantify this item, so no amount is shown.'
}

function scenarioSections(
  scenario: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['scenarios']>[keyof NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['scenarios']>],
  language: AppLanguage,
) {
  return [
    {
      label: language === 'vi' ? 'Điều kiện' : 'Conditions',
      value: scenario.conditions.join('\n'),
    },
    {
      label: language === 'vi' ? 'Phạm vi áp dụng' : 'Scope',
      value: scenario.scope.join('\n'),
    },
  ]
}

function scenarioDetail(
  scenario: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['scenarios']>[keyof NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['scenarios']>],
) {
  return [
    scenario.conditions.join('\n'),
    scenario.scope.join('\n'),
  ].join('\n')
}

function priceReasoningSourceLabel(
  source: NonNullable<NonNullable<AgenticEstimate['price_reasoning_receipt']>['fairness']['price_source']>,
  language: AppLanguage,
) {
  if (language === 'vi') {
    if (source === 'perplexity_validated') return 'Dữ liệu thị trường đã được đối chiếu theo phạm vi hiện tại.'
    if (source === 'baseline_with_market') return 'Mức giá cơ sở được đối chiếu thêm với tín hiệu thị trường.'
    if (source === 'baseline_only') return 'Mức giá cơ sở được quản trị theo phạm vi hiện tại.'
    return 'Dữ liệu hiện tại cần được kiểm tra tại hiện trường trước khi có thể chốt.'
  }
  if (source === 'perplexity_validated') return 'Market data was checked against the current scope.'
  if (source === 'baseline_with_market') return 'A governed baseline was checked with market signals.'
  if (source === 'baseline_only') return 'A governed baseline is used for the current scope.'
  return 'The current information needs an on-site check before it can be finalized.'
}

function priceReasoningMarketDetail(
  receipt: NonNullable<AgenticEstimate['price_reasoning_receipt']>,
  language: AppLanguage,
) {
  const baseline = receipt.fairness.baseline_evidence
  if (baseline?.quorum_met && baseline.sources.length > 0) {
    const sourceLines = baseline.sources.map((source) => {
      const range = formatPriceRange(source.price_min, source.price_max, language)
      return `${source.domain}: ${range} · T${source.effective_tier}`
    }).join('\n')
    const aggregate = formatPriceRange(
      baseline.aggregate_price_min,
      baseline.aggregate_price_max,
      language,
    )
    return language === 'vi'
      ? `${baseline.accepted_source_count} nguồn giá cơ sở đã kiểm chứng, đạt đồng thuận ${baseline.high_trust_source_count}/${baseline.required_quorum}.\n${sourceLines}\nKhoảng tổng hợp: ${aggregate}.`
      : `${baseline.accepted_source_count} verified baseline sources meet quorum ${baseline.high_trust_source_count}/${baseline.required_quorum}.\n${sourceLines}\nAggregate range: ${aggregate}.`
  }
  const count = receipt.fairness.market_source_count
  const highTrust = receipt.fairness.high_trust_source_count
  if (count === null) {
    return language === 'vi'
      ? 'Không có số lượng nguồn thị trường để công bố cho đề nghị này.'
      : 'No market-source count is published for this offer.'
  }
  const countCopy = language === 'vi'
    ? `${count} nguồn đã được đối chiếu${highTrust === null ? '' : `, gồm ${highTrust} nguồn độ tin cậy cao`}.`
    : `${count} checked market ${count === 1 ? 'source' : 'sources'}${highTrust === null ? '' : `, including ${highTrust} high-trust ${highTrust === 1 ? 'source' : 'sources'}`}.`
  if (receipt.fairness.quorum_met === false) {
    return language === 'vi'
      ? `${countCopy} Chưa đủ đồng thuận nguồn; Kael giữ phạm vi giá theo mức cơ sở.`
      : `${countCopy} The source quorum is not yet met, so Kael keeps the governed baseline range.`
  }
  return countCopy
}

function priceReasoningEvidenceLabel(
  receipt: NonNullable<AgenticEstimate['price_reasoning_receipt']>,
  language: AppLanguage,
) {
  if (receipt.fairness.baseline_evidence?.quorum_met || receipt.fairness.quorum_met) {
    return language === 'vi' ? 'Nguồn giá đã kiểm chứng' : 'Verified price sources'
  }
  return language === 'vi' ? 'Đối chiếu thị trường' : 'Market check'
}

function priceReasoningConclusion(
  receipt: NonNullable<AgenticEstimate['price_reasoning_receipt']>,
  language: AppLanguage,
) {
  const unknowns = receipt.fairness.remaining_uncertainty
  if (unknowns.length === 0) {
    return language === 'vi'
      ? 'Kael có thể đề nghị khoảng giá dưới đây cho đúng phạm vi đã nêu.'
      : 'Kael can propose the range below for the scope stated above.'
  }
  return language === 'vi'
    ? `Khoảng giá dưới đây áp dụng cho phạm vi đã nêu; ${unknowns.join(' ')}`
    : `The range below applies to the stated scope; ${unknowns.join(' ')}`
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

function priceReceiptSections(
  estimate: AgenticEstimate,
  priceDetail: string,
  language: AppLanguage,
) {
  return language === 'vi'
    ? [
        {
          label: 'Mức độ công việc',
          value: `Phạm vi đã xác nhận hiện được xếp ở mức độ ${complexityLabel(estimate.complexity, language).toLocaleLowerCase('vi-VN')}.`,
        },
        { label: 'Căn cứ của khoảng giá', value: priceDetail },
        {
          label: 'Giới hạn khi bạn xác nhận',
          value: priceConfirmationBoundaryStatement(estimate, language),
        },
      ]
    : [
        {
          label: 'Work complexity',
          value: `The confirmed scope is currently assessed as ${complexityLabel(estimate.complexity, language).toLocaleLowerCase('en-US')} complexity.`,
        },
        { label: 'Price-range basis', value: priceDetail },
        {
          label: 'Limit when you approve',
          value: priceConfirmationBoundaryStatement(estimate, language),
        },
      ]
}

function priceConfirmationBoundaryStatement(
  estimate: AgenticEstimate,
  language: AppLanguage,
) {
  const range = formatPriceRange(estimate.price_min, estimate.price_max, language)
  const maximum = formatVnd(estimate.price_max, language)
  return language === 'vi'
    ? `Bạn đang xem khoảng ${range}. Nếu xác nhận, ${maximum} là mức tối đa cho phạm vi hiện tại. Hạng mục ngoài phạm vi phải là đề xuất mới để bạn quyết định riêng.`
    : `You are viewing ${range}. If you approve, ${maximum} is the maximum for the current scope. Work outside the scope must be a new proposal for your separate decision.`
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
