import {
  PROBLEM_CHIPS,
  type ServiceType,
} from '../constants'
import {
  extractDistrictLabel,
  extractKnownDistrictLabel,
  hasAny,
  matchesKeyword,
  normalizeSearchText,
} from './address'
import type {
  LocalDealDraft,
  LocalDealSource,
} from './types'

export const emptyDraft = (source: LocalDealSource, serviceType: ServiceType | null = null): LocalDealDraft => ({
  serviceType,
  problemChips: [],
  description: '',
  mediaCount: 0,
  addressLabel: '',
  districtLabel: '',
  timeChoice: 'now',
  source,
  needsServiceChoice: serviceType === null,
  inferredProblemLabel: null,
  unsupportedServiceLabel: null,
})

export function inferLocalDealDraftFromKael(text: string): LocalDealDraft {
  const trimmed = text.trim()
  const normalized = normalizeSearchText(trimmed)
  const unsupportedServiceLabel = detectUnsupportedServiceLabel(normalized)
  if (unsupportedServiceLabel) {
    return {
      ...emptyDraft('kael'),
      description: trimmed,
      districtLabel: extractDistrictLabel(trimmed),
      needsServiceChoice: true,
      unsupportedServiceLabel,
    }
  }
  const electricalScore = scoreKeywords(normalized, [
    'dien',
    'o cam',
    'o dien',
    'cong tac',
    'cau dao',
    'aptomat',
    'den',
    'chap',
    'mat dien',
    'may nuoc nong',
  ])
  const plumbingScore = scoreKeywords(normalized, [
    'nuoc',
    'ro',
    'ri',
    'bon',
    'toilet',
    'voi',
    'ong',
    'ap nuoc',
    'lavabo',
  ]) + (hasStandalonePlumbingClog(normalized) ? 1 : 0)
  const cleaningScore = scoreKeywords(normalized, [
    've sinh',
    'don dep',
    'don nha',
    'lau don',
    'tong ve sinh',
    've sinh bep',
    've sinh phong tam',
    'cua kinh',
    'sau sua chua',
    'rac',
    'ban',
    'bui',
  ])
  const electricalStrictScore = scoreKeywords(normalized, ['dien', 'o cam', 'o dien', 'cong tac', 'cau dao', 'aptomat', 'den', 'chap', 'mat dien'])
  const plumbingStrictScore = scoreKeywords(normalized, ['nuoc', 'ro', 'ri', 'bon', 'toilet', 'voi', 'ong', 'ap nuoc', 'lavabo'])
  const cleaningStrictScore = scoreKeywords(normalized, ['ve sinh', 'don dep', 'don nha', 'lau don', 'tong ve sinh', 'cua kinh'])
  const supportedServiceMentions = [electricalStrictScore, plumbingStrictScore, cleaningStrictScore].filter((score) => score > 0).length
  const serviceType: ServiceType | null =
    supportedServiceMentions > 1
      ? null
      : electricalScore > plumbingScore && electricalScore > cleaningScore && electricalScore > 0
        ? 'electrical'
        : plumbingScore > electricalScore && plumbingScore > cleaningScore && plumbingScore > 0
          ? 'plumbing'
          : cleaningScore > electricalScore && cleaningScore > plumbingScore && cleaningScore > 0
            ? 'cleaning'
            : null
  const problemChips = serviceType ? inferProblemChips(normalized, serviceType) : []

  return {
    ...emptyDraft('kael', serviceType),
    description: trimmed,
    problemChips,
    districtLabel: extractDistrictLabel(trimmed),
    needsServiceChoice: serviceType === null,
    inferredProblemLabel: problemChips[0] ?? null,
    unsupportedServiceLabel: null,
  }
}

export function validateLocalDealDraft(draft: LocalDealDraft): string | null {
  if (!draft.serviceType) return 'Chọn dịch vụ điện, nước hoặc vệ sinh'
  if (draft.problemChips.length === 0) return 'Chọn ít nhất một vấn đề cần xử lý'
  if (draft.description.trim().length < 12) return 'Mô tả cần đủ rõ để Kael tóm tắt'
  if (draft.addressLabel.trim().length < 4) return 'Nhập khu vực hoặc địa chỉ tổng quát'
  if (!extractKnownDistrictLabel(draft.addressLabel)) return 'Địa chỉ cần có quận TP.HCM rõ ràng'
  return null
}

function inferProblemChips(normalized: string, serviceType: ServiceType): string[] {
  if (serviceType === 'cleaning') {
    if (hasAny(normalized, ['bep'])) return [PROBLEM_CHIPS.cleaning[1]]
    if (hasAny(normalized, ['phong tam', 'toilet', 'nha tam'])) return [PROBLEM_CHIPS.cleaning[2]]
    if (hasAny(normalized, ['sau sua chua', 've sinh sau'])) return [PROBLEM_CHIPS.cleaning[4]]
    if (hasAny(normalized, ['tong ve sinh'])) return [PROBLEM_CHIPS.cleaning[3]]
    if (hasAny(normalized, ['cua kinh', 'kinh'])) return [PROBLEM_CHIPS.cleaning[5]]
    if (hasAny(normalized, ['don dep', 'don nha', 'lau don', 've sinh'])) return [PROBLEM_CHIPS.cleaning[0]]
    return []
  }

  if (serviceType === 'plumbing') {
    if (hasAny(normalized, ['ro', 'ri', 'leak'])) return [PROBLEM_CHIPS.plumbing[0]]
    if (hasAny(normalized, ['tac', 'nghet', 'cong', 'bon'])) return [PROBLEM_CHIPS.plumbing[1]]
    if (hasAny(normalized, ['voi'])) return [PROBLEM_CHIPS.plumbing[2]]
    if (hasAny(normalized, ['toilet', 'xa'])) return [PROBLEM_CHIPS.plumbing[3]]
    if (hasAny(normalized, ['ap nuoc', 'yeu'])) return [PROBLEM_CHIPS.plumbing[4]]
    return []
  }

  if (hasAny(normalized, ['mat dien mot phong'])) return [PROBLEM_CHIPS.electrical[0]]
  if (hasAny(normalized, ['mat dien toan can', 'mat dien ca can'])) return [PROBLEM_CHIPS.electrical[1]]
  if (hasAny(normalized, ['o cam', 'o dien', 'cong tac'])) return [PROBLEM_CHIPS.electrical[2]]
  if (hasAny(normalized, ['cau dao', 'aptomat', 'trip'])) return [PROBLEM_CHIPS.electrical[3]]
  if (hasAny(normalized, ['den', 'chap chon'])) return [PROBLEM_CHIPS.electrical[4]]
  return []
}

function detectUnsupportedServiceLabel(normalized: string): string | null {
  if (hasAny(normalized, ['dieu hoa', 'may lanh', 'tu lanh', 'may giat', 'internet', 'sua khoa', 'khoa cua', 'o khoa', 'son nha'])) {
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh.'
  }

  const hasSupportedRepairIntent = hasAny(normalized, [
    'dien',
    'o cam',
    'cong tac',
    'cau dao',
    'aptomat',
    'den',
    'chap',
    'nuoc',
    'ro',
    'ri',
    'tac',
    'bon',
    'toilet',
    'voi',
    'ong',
    'ap nuoc',
    'lavabo',
    'van',
    've sinh',
    'don dep',
    'don nha',
    'lau don',
    'tong ve sinh',
    'cua kinh',
  ])

  if (!hasSupportedRepairIntent && hasAny(normalized, ['thiet bi', 'son', 'khoa'])) {
    return 'Dịch vụ này đang khóa. Kael hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh.'
  }
  return null
}

function hasStandalonePlumbingClog(normalized: string): boolean {
  if (!matchesKeyword(normalized, 'tac')) return false
  return !normalized.includes('cong tac')
}

function scoreKeywords(input: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => score + (matchesKeyword(input, keyword) ? 1 : 0), 0)
}
