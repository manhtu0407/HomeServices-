import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { HCMC_DISTRICTS } from '@home-services/shared'

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.success) {
    return apiError('AUTH_MISSING', auth.error, auth.status)
  }

  // Parallelize the 3 catalog reads — they are independent. Single round-trip
  // latency now equals the slowest query (~100ms) instead of the sum (~300ms).
  const [catResult, probResult, baseResult] = await Promise.all([
    withDbTimeout(
      auth.supabase
        .from('service_categories')
        .select('id, service_type, slug, label_vi, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order'),
    ),
    withDbTimeout(
      auth.supabase
        .from('service_problems')
        .select('id, slug, label_vi, default_complexity, service_category_id, service_type, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order'),
    ),
    withDbTimeout(
      auth.supabase
        .from('price_baselines')
        .select('service_type, complexity, district_code, price_min, price_max, service_problem_id'),
    ),
  ])

  const { data: categories, error: catError } = catResult
  const { data: problems, error: probError } = probResult
  const { data: baselines, error: baseError } = baseResult

  if (catError) {
    return apiError('DB_ERROR', 'Không thể tải danh mục dịch vụ', 500)
  }

  if (probError) {
    return apiError('DB_ERROR', 'Không thể tải danh sách vấn đề', 500)
  }

  if (baseError) {
    return apiError('DB_ERROR', 'Không thể tải bảng giá nền', 500)
  }

  if ((baselines ?? []).some((baseline) => hasInvalidBaselineRange(baseline.price_min, baseline.price_max))) {
    return apiError('DB_ERROR', 'Bảng giá nền có dữ liệu không hợp lệ', 500)
  }
  if ((baselines ?? []).some((baseline) => hasInvalidBaselineDistrict(baseline.district_code))) {
    return apiError('DB_ERROR', 'Bảng giá nền có khu vực không hợp lệ', 500)
  }

  const services = (categories ?? []).map((cat) => ({
    id: cat.id,
    service_type: cat.service_type,
    label_vi: cat.label_vi,
    problems: (problems ?? [])
      .filter((p) => p.service_category_id === cat.id)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        label_vi: p.label_vi,
        default_complexity: p.default_complexity,
      })),
    baselines: (baselines ?? [])
      .filter((b) => b.service_type === cat.service_type)
      .map((b) => ({
        complexity: b.complexity,
        district_code: b.district_code,
        price_min: b.price_min,
        price_max: b.price_max,
      }))
      .filter(uniqueCatalogBaseline),
  }))

  return apiSuccess({ services })
}

function hasInvalidBaselineRange(priceMin: unknown, priceMax: unknown) {
  const min = positiveNumberFrom(priceMin)
  const max = positiveNumberFrom(priceMax)
  return min === null || max === null || max < min
}

function hasInvalidBaselineDistrict(districtCode: unknown) {
  return typeof districtCode !== 'string' ||
    !Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, districtCode)
}

function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function uniqueCatalogBaseline<T extends {
  complexity: unknown
  district_code: unknown
  price_min: unknown
  price_max: unknown
}>(baseline: T, index: number, baselines: T[]) {
  const key = catalogBaselineKey(baseline)
  return baselines.findIndex((candidate) => catalogBaselineKey(candidate) === key) === index
}

function catalogBaselineKey(baseline: {
  complexity: unknown
  district_code: unknown
  price_min: unknown
  price_max: unknown
}) {
  return `${baseline.complexity}:${baseline.district_code}:${baseline.price_min}:${baseline.price_max}`
}
