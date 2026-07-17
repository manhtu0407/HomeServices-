import {
  KAEL_PRICE_DISCLAIMER_V3,
  type EstimateCardV3,
  type ScopeChangeCustomerCard,
  type WorkerBrief,
} from '../schemas/index.ts'
import { sanitizeKaelText } from '../sanitizers/index.ts'
import type { ServiceType } from '../../src/constants.ts'

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
  const priceMin = requireFinitePositivePrice(input.priceMin, 'priceMin')
  const priceMax = Math.max(priceMin, requireFinitePositivePrice(input.priceMax, 'priceMax'))

  return {
    service_type: input.serviceType,
    problem_summary: requiredKaelText(
      input.problemSummary,
      200,
      'Cần kiểm tra thêm để xác định phạm vi dịch vụ.',
      10,
    ),
    complexity: input.complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence: needsInspection ? 'low' : 'medium',
    needs_inspection: needsInspection,
    price_source: needsInspection ? 'inspection_required' : 'baseline_only',
    kael_reasoning: {
      baseline_used: requiredKaelText(input.baselineUsed, 100, 'Chưa xác định mốc ước tính phù hợp.'),
      complexity_reasoning: needsInspection
        ? 'Thông tin hiện tại chưa đủ chắc chắn nên cần kiểm tra trực tiếp.'
        : 'Ước tính dựa trên mức tham chiếu phù hợp nhất với mô tả hiện tại.',
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
  const area = requiredKaelText(
    input.district || input.fullAddress?.district || '',
    100,
    'TP.HCM',
  )
  const problemSummary = requiredKaelText(
    input.problemSummary,
    200,
    'Cần kiểm tra thêm để xác định phạm vi công việc.',
    10,
  )
  const earnings = normalizeEarningRange(input.estimatedEarningMin, input.estimatedEarningMax)

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
    estimated_earning_min: earnings.min,
    estimated_earning_max: earnings.max,
    sections: {
      context: [
        sanitizeKaelText(`Khu vực: ${area}`, 180),
        sanitizeKaelText(`Vấn đề Kael ghi nhận: ${problemSummary}`, 180),
      ],
      guidance: isGuidance
        ? [
          'Kiểm tra đúng phạm vi Kael đã chốt và khách có thể xem/khiếu nại.',
          'Nếu phát sinh thêm, gửi yêu cầu đổi phạm vi kèm lý do và ảnh trước khi làm.',
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
  const newPriceMin = requireFinitePositivePrice(input.newPriceMin, 'newPriceMin')
  const newPriceMax = Math.max(newPriceMin, requireFinitePositivePrice(input.newPriceMax, 'newPriceMax'))
  const originalPriceMax = typeof input.originalPriceMax === 'number' &&
    Number.isFinite(input.originalPriceMax) &&
    input.originalPriceMax > 0 &&
    input.originalPriceMax <= Number.MAX_SAFE_INTEGER
    ? Math.round(input.originalPriceMax)
    : null

  return {
    schema_version: 'scope_change_customer_card.v1',
    service_type: input.serviceType,
    problem_summary: requiredKaelText(
      input.problemSummary,
      220,
      'Cần kiểm tra thêm trước khi quyết định thay đổi phạm vi.',
      10,
    ),
    price_change: {
      original_price_max: originalPriceMax,
      new_price_min: newPriceMin,
      new_price_max: newPriceMax,
    },
    kael_assessment: input.assessment ?? 'reasonable',
    decision_required: true,
    advisory: 'Kael đã tính lại theo phạm vi thợ báo cáo. Bạn có thể đồng ý hoặc khiếu nại nếu bằng chứng chưa đúng.',
    disclaimer: KAEL_PRICE_DISCLAIMER_V3,
  }
}

function requireFinitePositivePrice(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${field} must be a finite positive price`)
  }
  return Math.max(1, Math.round(value))
}

function requiredKaelText(
  value: string,
  maxLength: number,
  fallback: string,
  minLength = 1,
): string {
  const sanitized = sanitizeKaelText(value, maxLength)
  return sanitized.length >= minLength ? sanitized : sanitizeKaelText(fallback, maxLength)
}

function normalizeEarningRange(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
): { min: number | null; max: number | null } {
  if (
    typeof minimum !== 'number' ||
    typeof maximum !== 'number' ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum <= 0 ||
    maximum <= 0 ||
    minimum > Number.MAX_SAFE_INTEGER ||
    maximum > Number.MAX_SAFE_INTEGER
  ) {
    return { min: null, max: null }
  }

  const roundedMinimum = Math.max(1, Math.round(minimum))
  const roundedMaximum = Math.max(1, Math.round(maximum))
  if (roundedMaximum < roundedMinimum) return { min: null, max: null }
  return { min: roundedMinimum, max: roundedMaximum }
}
