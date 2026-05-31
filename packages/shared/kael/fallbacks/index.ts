import {
  KAEL_PRICE_DISCLAIMER_V3,
  type EstimateCardV3,
  type ScopeChangeCustomerCard,
  type WorkerBrief,
} from '../schemas'
import { sanitizeKaelText } from '../sanitizers'

type ServiceType = 'electrical' | 'plumbing' | 'cleaning'
type Complexity = 'small' | 'medium' | 'large'

export type WorkerBriefFallbackInput = {
  stage: 'core' | 'guidance'
  serviceType: ServiceType
  district: string
  problemSummary: string
  fullAddress: {
    building: string | null
    floor: string | null
    unit: string | null
    district: string | null
  } | null
  estimatedEarningMin?: number | null
  estimatedEarningMax?: number | null
}

export function buildEstimateCardFallback(input: {
  serviceType: ServiceType
  problemSummary: string
  complexity: Complexity
  priceMin: number
  priceMax: number
  baselineUsed: string
  needsInspection?: boolean
}): EstimateCardV3 {
  const needsInspection = input.needsInspection ?? false
  const priceMin = Math.max(1, Math.round(input.priceMin))
  const priceMax = Math.max(priceMin, Math.round(input.priceMax))

  return {
    service_type: input.serviceType,
    problem_summary: sanitizeKaelText(input.problemSummary, 200),
    complexity: input.complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence: needsInspection ? 'low' : 'medium',
    needs_inspection: needsInspection,
    price_source: needsInspection ? 'inspection_required' : 'baseline_only',
    kael_reasoning: {
      baseline_used: sanitizeKaelText(input.baselineUsed, 100),
      complexity_reasoning: needsInspection
        ? 'Thông tin hiện tại chưa đủ chắc chắn nên cần kiểm tra trực tiếp.'
        : 'Ước tính dựa trên baseline phù hợp nhất với mô tả hiện tại.',
      needs_inspection_reason: needsInspection
        ? 'Mô tả hoặc hình ảnh chưa đủ để phân biệt mức độ hư hỏng.'
        : undefined,
    },
    advisory: needsInspection
      ? 'Cần thợ kiểm tra trực tiếp trước khi chốt phạm vi.'
      : 'Giá cuối do Kael khóa theo policy; cập nhật khi có bằng chứng phạm vi mới.',
    disclaimer: KAEL_PRICE_DISCLAIMER_V3,
  }
}

export function buildWorkerBriefFallback(input: WorkerBriefFallbackInput): WorkerBrief {
  const isGuidance = input.stage === 'guidance'
  const fullAddress = isGuidance ? input.fullAddress : null
  const area = sanitizeKaelText(input.district || input.fullAddress?.district || 'TP.HCM', 100)
  const problemSummary = sanitizeKaelText(input.problemSummary, 200)

  return {
    schema_version: 'worker_brief.v1',
    stage: input.stage,
    visibility: isGuidance ? 'post_accept' : 'pre_accept',
    service_type: input.serviceType,
    problem_summary: problemSummary,
    district: area,
    full_address: fullAddress
      ? {
        building: sanitizeKaelText(fullAddress.building ?? '', 200) || null,
        floor: sanitizeKaelText(fullAddress.floor ?? '', 50) || null,
        unit: sanitizeKaelText(fullAddress.unit ?? '', 50) || null,
        district: sanitizeKaelText(fullAddress.district ?? area, 100) || null,
      }
      : null,
    estimated_earning_min: input.estimatedEarningMin ?? null,
    estimated_earning_max: input.estimatedEarningMax ?? null,
    sections: {
      context: [
        `Khu vực: ${area}`,
        `Vấn đề Kael ghi nhận: ${problemSummary}`,
      ],
      guidance: isGuidance
        ? [
          'Kiểm tra đúng phạm vi Kael đã chốt và khách có thể xem/khiếu nại.',
          'Nếu phát sinh thêm, gửi scope-change kèm lý do và ảnh trước khi làm.',
        ]
        : [
          'Đọc nhanh vấn đề trước khi nhận việc.',
          'Địa chỉ đầy đủ chỉ hiển thị sau khi nhận yêu cầu.',
        ],
      safety: [
        'Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.',
      ],
    },
  }
}

export function buildScopeChangeCustomerCardFallback(input: {
  serviceType: ServiceType
  originalPriceMax: number | null
  newPriceMin: number
  newPriceMax: number
  problemSummary: string
  assessment?: 'reasonable' | 'high_increase' | 'requires_attention'
}): ScopeChangeCustomerCard {
  const newPriceMin = Math.max(1, Math.round(input.newPriceMin))
  const newPriceMax = Math.max(newPriceMin, Math.round(input.newPriceMax))

  return {
    schema_version: 'scope_change_customer_card.v1',
    service_type: input.serviceType,
    problem_summary: sanitizeKaelText(input.problemSummary, 220),
    price_change: {
      original_price_max: input.originalPriceMax && input.originalPriceMax > 0
        ? Math.round(input.originalPriceMax)
        : null,
      new_price_min: newPriceMin,
      new_price_max: newPriceMax,
    },
    kael_assessment: input.assessment ?? 'reasonable',
    decision_required: true,
    advisory: 'Kael đã tính lại theo phạm vi thợ báo cáo. Bạn có thể đồng ý hoặc khiếu nại nếu bằng chứng chưa đúng.',
    disclaimer: KAEL_PRICE_DISCLAIMER_V3,
  }
}
