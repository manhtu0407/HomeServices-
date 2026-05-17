import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'

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
    // Baselines are non-critical for the catalog response — log and continue
    // with empty baselines rather than failing the entire request.
    console.warn('Failed to fetch baselines', { errorCode: baseError.code })
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
      })),
  }))

  return apiSuccess({ services })
}
