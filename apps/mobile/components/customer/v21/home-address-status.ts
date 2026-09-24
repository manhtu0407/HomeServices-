import type { CustomerProfileInsightsResponse } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'

// A missing payload means the insights have not loaded or the request failed. That is unknown, not a
// confirmed absence of a default address, so it must not read as "no address yet".
export function homeAddressStatusLabel(
  insights: Pick<CustomerProfileInsightsResponse, 'saved_address_count'> | null | undefined,
  language: AppLanguage,
): string {
  const vietnamese = language === 'vi'
  if (!insights) return vietnamese ? 'Đang tải địa chỉ mặc định' : 'Loading default address'
  return insights.saved_address_count > 0
    ? (vietnamese ? 'Đã có địa chỉ mặc định' : 'Default address saved')
    : (vietnamese ? 'Chưa có địa chỉ mặc định' : 'No default address yet')
}
