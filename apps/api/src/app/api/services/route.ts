import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { HCMC_DISTRICTS } from '@nestscout/shared'

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

  type ProblemRow = NonNullable<typeof problems>[number]
  type CatalogProblem = Pick<ProblemRow, 'id' | 'slug' | 'label_vi' | 'default_complexity'>
  type BaselineRow = NonNullable<typeof baselines>[number]
  type CatalogBaseline = Pick<BaselineRow, 'complexity' | 'district_code' | 'price_min' | 'price_max'>

  const problemsByCategory = new Map<string, CatalogProblem[]>()
  for (const problem of problems ?? []) {
    const categoryProblems = problemsByCategory.get(problem.service_category_id) ?? []
    categoryProblems.push({
      id: problem.id,
      slug: problem.slug,
      label_vi: problem.label_vi,
      default_complexity: problem.default_complexity,
    })
    problemsByCategory.set(problem.service_category_id, categoryProblems)
  }

  const baselinesByService = new Map<string, CatalogBaseline[]>()
  const baselineKeysByService = new Map<string, Set<string>>()
  for (const baseline of baselines ?? []) {
    const catalogBaseline = {
      complexity: baseline.complexity,
      district_code: baseline.district_code,
      price_min: baseline.price_min,
      price_max: baseline.price_max,
    }
    const baselineKey = catalogBaselineKey(catalogBaseline)
    const serviceKeys = baselineKeysByService.get(baseline.service_type) ?? new Set<string>()
    if (serviceKeys.has(baselineKey)) continue
    serviceKeys.add(baselineKey)
    baselineKeysByService.set(baseline.service_type, serviceKeys)

    const serviceBaselines = baselinesByService.get(baseline.service_type) ?? []
    serviceBaselines.push(catalogBaseline)
    baselinesByService.set(baseline.service_type, serviceBaselines)
  }

  const services = (categories ?? []).map((cat) => ({
    id: cat.id,
    service_type: cat.service_type,
    label_vi: cat.label_vi,
    problems: problemsByCategory.get(cat.id) ?? [],
    baselines: baselinesByService.get(cat.service_type) ?? [],
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

function catalogBaselineKey(baseline: {
  complexity: unknown
  district_code: unknown
  price_min: unknown
  price_max: unknown
}) {
  return `${baseline.complexity}:${baseline.district_code}:${baseline.price_min}:${baseline.price_max}`
}
