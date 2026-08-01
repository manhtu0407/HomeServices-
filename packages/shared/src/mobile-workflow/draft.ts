import {
  PROBLEM_CHIPS,
  SERVICE_TYPES,
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

const HANDYMAN_CURTAIN_INSTALL_KEYWORDS = ['lap thanh rem', 'curtain rod', 'install curtain rod'] as const
const INDEPENDENT_UPHOLSTERY_KEYWORDS = [
  'sofa',
  'nem',
  'tham',
  'boc ghe',
  'upholstery',
  'mattress',
  'carpet',
  'fabric care',
  've sinh rem',
  'curtain cleaning',
  'clean curtain',
] as const

const SERVICE_INFERENCE_RULES: ReadonlyArray<{
  serviceType: ServiceType
  keywords: readonly string[]
}> = [
  {
    serviceType: 'electrical',
    keywords: [
      'dien',
      'o cam',
      'o dien',
      'cong tac',
      'cau dao',
      'aptomat',
      'mat dien',
      'den phong',
      'den chap chon',
      'den khong sang',
      'may nuoc nong',
      'electrical',
      'electricity',
      'power outlet',
      'outlet',
      'socket',
      'light switch',
      'circuit breaker',
      'breaker',
      'power outage',
      'sparking',
      'water heater',
      'light not working',
    ],
  },
  {
    serviceType: 'plumbing',
    keywords: [
      'sua nuoc',
      'ong nuoc',
      'ong',
      'voi nuoc',
      'voi',
      'bon rua',
      'bon cau',
      'lavabo',
      'toilet',
      'ap nuoc',
      'nuoc yeu',
      'duong cap',
      'tac nuoc',
      'tac bon',
      'tac cong',
      'nghet',
      'plumbing',
      'water pipe',
      'pipe',
      'faucet',
      'tap',
      'drain',
      'sink',
      'clogged',
      'water pressure',
    ],
  },
  {
    serviceType: 'cleaning',
    keywords: [
      'don dep',
      'don nha',
      'lau don',
      'lau nha',
      'nhieu bui',
      'tong ve sinh',
      've sinh can ho',
      've sinh nha',
      've sinh bep',
      've sinh phong tam',
      'cua kinh',
      'sau sua chua',
      'house cleaning',
      'home cleaning',
      'apartment cleaning',
      'housekeeping',
      'deep cleaning',
    ],
  },
  {
    serviceType: 'hvac',
    keywords: [
      'dieu hoa',
      'may lanh',
      'hvac',
      'air conditioner',
      'air conditioning',
      'indoor air',
    ],
  },
  {
    serviceType: 'upholstery',
    keywords: [
      'sofa',
      'nem',
      'rem',
      'tham',
      'boc ghe',
      'upholstery',
      'mattress',
      'curtain',
      'carpet',
      'fabric care',
    ],
  },
  {
    serviceType: 'handyman',
    keywords: [
      'tho sua vat',
      'sua vat',
      'khoan',
      'lap ke',
      ...HANDYMAN_CURTAIN_INSTALL_KEYWORDS,
      'lap den',
      'lap thiet bi nho',
      'install light',
      'small fixture',
      'ban le',
      'tay nam',
      'treo tranh',
      'lap thiet bi phong tam',
      'bathroom fixture',
      'lap tv',
      'wall mount tv',
      'noi that',
      'lap rap noi that',
      'assemble furniture',
      'furniture assembly',
      'gian phoi',
      'drying rack',
      'handyman',
      'minor repair',
      'shelf',
      'hinge',
      'door handle',
      'mount tv',
    ],
  },
]

const UNSUPPORTED_SERVICE_MESSAGE = 'Yêu cầu này hiện chưa thuộc phạm vi NestScout. NestScout đang hỗ trợ sửa điện, sửa nước, vệ sinh nhà cửa, điều hòa và không khí, sofa/nệm/rèm/thảm, cùng sửa vặt và lắp đặt nhỏ.'

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
  const serviceType = inferServiceType(normalized)
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
  if (!draft.serviceType || !SERVICE_TYPES.includes(draft.serviceType)) return 'Chọn một trong sáu dịch vụ NestScout hỗ trợ'
  if (
    !Array.isArray(draft.problemChips) ||
    draft.problemChips.length === 0 ||
    draft.problemChips.length > 10 ||
    draft.problemChips.some((chip) => typeof chip !== 'string' || !chip.trim() || chip.length > 100)
  ) return 'Chọn ít nhất một vấn đề cần xử lý'
  if (!Number.isInteger(draft.mediaCount) || draft.mediaCount < 0 || draft.mediaCount > 5) {
    return 'Số lượng ảnh/video không hợp lệ'
  }
  if (draft.description.trim().length < 12) return 'Mô tả cần đủ rõ để Kael tóm tắt'
  if (draft.addressLabel.trim().length < 4) return 'Nhập khu vực hoặc địa chỉ tổng quát'
  if (!extractKnownDistrictLabel(draft.addressLabel)) return 'Địa chỉ cần có quận TP.HCM rõ ràng'
  return null
}

function inferProblemChips(normalized: string, serviceType: ServiceType): string[] {
  if (serviceType === 'cleaning') {
    if (hasAny(normalized, ['bep', 'kitchen'])) return [PROBLEM_CHIPS.cleaning[1]]
    if (hasAny(normalized, ['phong tam', 'toilet', 'nha tam', 'bathroom'])) return [PROBLEM_CHIPS.cleaning[2]]
    if (hasAny(normalized, ['sau sua chua', 've sinh sau', 'post renovation'])) return [PROBLEM_CHIPS.cleaning[4]]
    if (hasAny(normalized, ['tong ve sinh', 'full apartment cleaning', 'deep cleaning'])) return [PROBLEM_CHIPS.cleaning[3]]
    if (hasAny(normalized, ['cua kinh', 'kinh', 'window cleaning'])) return [PROBLEM_CHIPS.cleaning[5]]
    if (hasAny(normalized, ['don dep', 'don nha', 'lau don', 'lau nha', 'nhieu bui', 've sinh', 'house cleaning', 'home cleaning', 'apartment cleaning', 'housekeeping'])) return [PROBLEM_CHIPS.cleaning[0]]
    return []
  }

  if (serviceType === 'plumbing') {
    if (hasAny(normalized, ['ro', 'ri', 'leak', 'leaking'])) return [PROBLEM_CHIPS.plumbing[0]]
    if (hasStandalonePlumbingClog(normalized) || hasAny(normalized, ['nghet', 'drain', 'clog', 'clogged'])) return [PROBLEM_CHIPS.plumbing[1]]
    if (hasAny(normalized, ['voi', 'faucet', 'tap'])) return [PROBLEM_CHIPS.plumbing[2]]
    if (hasAny(normalized, ['toilet', 'xa', 'flush'])) return [PROBLEM_CHIPS.plumbing[3]]
    if (hasAny(normalized, ['ap nuoc', 'nuoc yeu', 'yeu', 'low pressure'])) return [PROBLEM_CHIPS.plumbing[4]]
    if (hasAny(normalized, ['lap', 'thay', 'install', 'replace'])) return [PROBLEM_CHIPS.plumbing[5]]
    return []
  }

  if (serviceType === 'hvac') {
    if (hasAny(normalized, ['ve sinh', 'bao tri', 'cleaning', 'maintenance'])) return [PROBLEM_CHIPS.hvac[0]]
    if (hasAny(normalized, ['yeu', 'weak cooling'])) return [PROBLEM_CHIPS.hvac[1]]
    if (hasAny(normalized, ['khong mat', 'not cooling', 'no cooling'])) return [PROBLEM_CHIPS.hvac[2]]
    if (hasAny(normalized, ['chay nuoc', 'ro nuoc', 'leak', 'leaking'])) return [PROBLEM_CHIPS.hvac[3]]
    if (hasAny(normalized, ['keu', 'tieng on', 'noise', 'noisy'])) return [PROBLEM_CHIPS.hvac[4]]
    if (hasAny(normalized, ['ma loi', 'error code'])) return [PROBLEM_CHIPS.hvac[5]]
    return []
  }

  if (serviceType === 'upholstery') {
    if (hasAny(normalized, ['sofa'])) return [PROBLEM_CHIPS.upholstery[0]]
    if (hasAny(normalized, ['nem', 'mattress'])) return [PROBLEM_CHIPS.upholstery[1]]
    if (hasAny(normalized, ['rem', 'curtain'])) return [PROBLEM_CHIPS.upholstery[2]]
    if (hasAny(normalized, ['tham', 'carpet'])) return [PROBLEM_CHIPS.upholstery[3]]
    if (hasAny(normalized, ['vet ban', 'stain'])) return [PROBLEM_CHIPS.upholstery[4]]
    if (hasAny(normalized, ['mui hoi', 'am moc', 'odor', 'mold'])) return [PROBLEM_CHIPS.upholstery[5]]
    return []
  }

  if (serviceType === 'handyman') {
    if (hasAny(normalized, ['khoan', 'lap ke', 'shelf'])) return [PROBLEM_CHIPS.handyman[0]]
    if (hasAny(normalized, ['thanh rem', 'curtain rod'])) return [PROBLEM_CHIPS.handyman[1]]
    if (hasAny(normalized, ['lap den', 'thiet bi nho', 'small fixture'])) return [PROBLEM_CHIPS.handyman[2]]
    if (hasAny(normalized, ['ban le', 'tay nam', 'hinge', 'door handle'])) return [PROBLEM_CHIPS.handyman[3]]
    if (hasAny(normalized, ['thiet bi phong tam', 'bathroom fixture'])) return [PROBLEM_CHIPS.handyman[4]]
    if (hasAny(normalized, ['lap tv', 'noi that', 'mount tv', 'furniture'])) return [PROBLEM_CHIPS.handyman[5]]
    return []
  }

  if (hasAny(normalized, ['mat dien mot phong'])) return [PROBLEM_CHIPS.electrical[0]]
  if (hasAny(normalized, ['mat dien toan can', 'mat dien ca can', 'power outage'])) return [PROBLEM_CHIPS.electrical[1]]
  if (hasAny(normalized, ['o cam', 'o dien', 'cong tac', 'outlet', 'socket', 'switch'])) return [PROBLEM_CHIPS.electrical[2]]
  if (hasAny(normalized, ['cau dao', 'aptomat', 'trip', 'breaker'])) return [PROBLEM_CHIPS.electrical[3]]
  if (hasAny(normalized, ['den', 'chap chon', 'den khong sang', 'sparking', 'flicker'])) return [PROBLEM_CHIPS.electrical[4]]
  if (hasAny(normalized, ['lap', 'install'])) return [PROBLEM_CHIPS.electrical[5]]
  return []
}

function detectUnsupportedServiceLabel(normalized: string): string | null {
  if (hasAny(normalized, [
    'xe may',
    'xe hoi',
    'o to',
    'motorcycle',
    'motorbike',
    'car repair',
    'auto repair',
    'tu lanh',
    'may giat',
    'may say',
    'may rua chen',
    'refrigerator',
    'fridge',
    'washing machine',
    'dishwasher',
    'internet',
    'router',
    'sua khoa',
    'tho khoa',
    'khoa cua',
    'o khoa',
    'locksmith',
    'door lock',
    'son nha',
    'painting',
    'diet con trung',
    'diet moi',
    'pest control',
  ])) {
    return UNSUPPORTED_SERVICE_MESSAGE
  }

  if (!hasSupportedServiceSignal(normalized) && hasAny(normalized, ['thiet bi gia dung', 'appliance', 'son', 'khoa'])) {
    return UNSUPPORTED_SERVICE_MESSAGE
  }
  return null
}

function inferServiceType(normalized: string): ServiceType | null {
  const matches = SERVICE_INFERENCE_RULES.filter(({ keywords }) => scoreKeywords(normalized, keywords) > 0)
  const curtainInstallationOnly = hasAny(normalized, [...HANDYMAN_CURTAIN_INSTALL_KEYWORDS])
    && !hasAny(normalized, [...INDEPENDENT_UPHOLSTERY_KEYWORDS])
  const disambiguatedMatches = curtainInstallationOnly
    ? matches.filter(({ serviceType }) => serviceType !== 'upholstery')
    : matches
  return disambiguatedMatches.length === 1 ? disambiguatedMatches[0].serviceType : null
}

function hasSupportedServiceSignal(normalized: string): boolean {
  return SERVICE_INFERENCE_RULES.some(({ keywords }) => scoreKeywords(normalized, keywords) > 0)
}

function hasStandalonePlumbingClog(normalized: string): boolean {
  if (!matchesKeyword(normalized, 'tac')) return false
  return !normalized.includes('cong tac')
}

function scoreKeywords(input: string, keywords: readonly string[]): number {
  return keywords.reduce((score, keyword) => score + (matchesKeyword(input, keyword) ? 1 : 0), 0)
}
