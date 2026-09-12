import { apartmentAccessAuthorizationReceiptSchema, apartmentAccessAuthorizationSchema, type ApartmentAccessAuthorizationInput } from '@nestscout/shared'

export function readApartmentReceipt(value: unknown, jobId: string, intent: ApartmentAccessAuthorizationInput) {
  const parsed = apartmentAccessAuthorizationReceiptSchema.safeParse(value)
  return parsed.success && parsed.data.job_id === jobId && parsed.data.worker_id === intent.expected_worker_id
    && parsed.data.checked_in_at === intent.expected_check_in_at ? parsed.data : null
}

export function readApartmentContext(value: unknown) {
  const parsed = apartmentAccessAuthorizationSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
