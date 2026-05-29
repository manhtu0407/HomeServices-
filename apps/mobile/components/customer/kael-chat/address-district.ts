import { extractDistrictFromAddressLabel, type DistrictSlug } from '@home-services/shared'

// X3 (Plan.md §27.6 — 2026-05-29): F-14 fix. Address labels like
// "Vinhomes Central Park, Bình Thạnh" need substring scanning to extract
// the district; `normalizeDistrict` alone returned hcmc_all because the
// whole string was neither a slug nor a label.
export function inferKaelChatDistrict(value: string): DistrictSlug | null {
  const normalized = extractDistrictFromAddressLabel(value)
  return normalized === 'hcmc_all' ? null : normalized
}
