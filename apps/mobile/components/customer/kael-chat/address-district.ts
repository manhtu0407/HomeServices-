import { normalizeDistrict, type DistrictSlug } from '@home-services/shared'

export function inferKaelChatDistrict(value: string): DistrictSlug | null {
  const normalized = normalizeDistrict(value)
  return normalized === 'hcmc_all' ? null : normalized
}
