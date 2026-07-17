import {
  HCMC_DISTRICTS,
  type DistrictSlug,
} from '../constants.ts'

export const GENERIC_AREA = 'Khu vực TP.HCM'

export function extractKnownDistrictLabel(input: string): string {
  const normalized = normalizeSearchText(input)
  if (!normalized) return ''

  const numberedDistrict = normalized.match(/\b(?:quan|q|district|dist)\s*\.?\s*(1[0-2]|[1-9])\b/)
  if (numberedDistrict) return `Quận ${numberedDistrict[1]}`

  for (const [slug, label] of Object.entries(HCMC_DISTRICTS) as Array<[DistrictSlug, string]>) {
    if (slug === 'hcmc_all') continue
    const normalizedLabel = escapeRegExp(normalizeSearchText(label))
    if (new RegExp(`(^|[^a-z0-9])${normalizedLabel}([^a-z0-9]|$)`).test(normalized)) return label
  }

  return ''
}

export function extractDistrictLabel(input: string): string {
  return extractKnownDistrictLabel(input) || GENERIC_AREA
}

export function hasSpecificWorkerRouteAddress(addressLabel: string | null | undefined, districtLabel = ''): boolean {
  const normalizedAddress = stripGenericAddressTerms(addressLabel ?? '')
  if (!normalizedAddress) return false

  const detectedDistrict = extractKnownDistrictLabel(addressLabel ?? '') || extractKnownDistrictLabel(districtLabel) || districtLabel
  let specificPart = normalizedAddress
  const districtCandidates = [
    detectedDistrict,
    districtLabel,
    ...Object.values(HCMC_DISTRICTS),
  ]

  for (const candidate of districtCandidates) {
    const normalizedCandidate = stripGenericAddressTerms(candidate)
    if (!normalizedCandidate) continue
    specificPart = specificPart.replace(new RegExp(`\\b${escapeRegExp(normalizedCandidate)}\\b`, 'g'), ' ')
  }

  specificPart = specificPart
    .replace(/\b(?:quan|q|district|dist)\s*\.?\s*\d+\b/g, ' ')
    .replace(/\b(?:phuong|p|ward)\s*\.?\s*\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return specificPart.replace(/\s+/g, '').length >= 3
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

export function hasAny(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => matchesKeyword(input, keyword))
}

export function matchesKeyword(input: string, keyword: string): boolean {
  if (keyword.includes(' ')) return input.includes(keyword)
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(input)
}

function stripGenericAddressTerms(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\btp\s*hcm\b/g, ' ')
    .replace(/\btphcm\b/g, ' ')
    .replace(/\bthanh\s*pho\s*ho\s*chi\s*minh\b/g, ' ')
    .replace(/\bho\s*chi\s*minh\b/g, ' ')
    .replace(/\bhcmc\b/g, ' ')
    .replace(/\bviet\s*nam\b/g, ' ')
    .replace(/\bvn\b/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
