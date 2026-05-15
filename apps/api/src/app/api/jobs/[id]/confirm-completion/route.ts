import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import type { JobStatus } from '@home-services/shared'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ['customer'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const { id } = await params

  const { data: job, error: fetchError } = await auth.supabase
    .from('jobs')
    .select('id, status, customer_id, final_price')
    .eq('id', id)
    .single()

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  // A12 gate: must be completed_by_worker
  const transition = validateTransition(job.status as JobStatus, 'confirmed_by_customer')
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }

  const now = new Date().toISOString()

  // Transition to confirmed_by_customer
  const { error: confirmErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'confirmed_by_customer', confirmed_at: now })
    .eq('id', id)

  if (confirmErr) {
    return apiError('DB_ERROR', 'Không thể xác nhận hoàn thành', 500)
  }

  await logJobEvent(auth.supabase, id, 'customer_confirmed_completion', auth.user.id, 'customer', job.status as JobStatus, 'confirmed_by_customer')

  // Prototype: auto-transition confirmed_by_customer → payment_pending → paid
  const toPaymentPending = validateTransition('confirmed_by_customer', 'payment_pending')
  if (!toPaymentPending.valid) {
    return apiError('INVALID_STATUS', toPaymentPending.error, 409)
  }

  const { error: ppErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'payment_pending' })
    .eq('id', id)

  if (ppErr) {
    return apiError('DB_ERROR', 'Không thể chuyển trạng thái thanh toán', 500)
  }

  await logJobEvent(auth.supabase, id, 'payment_pending', auth.user.id, 'customer', 'confirmed_by_customer', 'payment_pending')

  const toPaid = validateTransition('payment_pending', 'paid')
  if (!toPaid.valid) {
    return apiError('INVALID_STATUS', toPaid.error, 409)
  }

  const { error: paidErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'paid', paid_at: now })
    .eq('id', id)

  if (paidErr) {
    return apiError('DB_ERROR', 'Không thể hoàn tất thanh toán', 500)
  }

  await logJobEvent(auth.supabase, id, 'payment_auto_completed', auth.user.id, 'customer', 'payment_pending', 'paid', { prototype_auto_payment: true })

  return apiSuccess({
    job_id: id,
    status: 'paid',
    final_price: job.final_price,
  })
}
