import type { AppLanguage } from '@/lib/app-language'
import {
  CUSTOMER_SERVICE_IDS,
  PROBLEM_CHIPS,
  productionServiceTypeForCustomerService,
  type CustomerServiceId,
  type ServiceType,
} from '@nestscout/shared'

import { customerV21BookingServiceCopy } from './copy'

const bookingSearchProblemLimit = 5
const bookingServiceSearchKeywords: Record<CustomerServiceId, readonly string[]> = {
  home_cleaning: ['ve sinh', 'don nha', 'don dep', 'lau don', 'bep', 'phong tam', 'tong ve sinh', 'cua kinh', 'sau sua chua'],
  electrical: ['dien', 'sua dien', 'o cam', 'o dien', 'cong tac', 'cau dao', 'aptomat', 'cb', 'den', 'mat dien', 'chap'],
  plumbing: ['nuoc', 'sua nuoc', 'ong nuoc', 'duong ong', 'ong', 'voi', 'ro ri', 'cong', 'bon', 'toilet', 'ap nuoc', 'lavabo'],
  hvac_basic_maintenance: ['dieu hoa', 'may lanh', 'khong khi', 've sinh dieu hoa', 'lanh yeu', 'chay nuoc', 'mui'],
  upholstery_care: ['sofa', 'nem', 'rem', 'tham', 've sinh sofa', 'vet ban', 'mui hoi', 'long thu cung'],
  handyman_minor_installation: ['sua vat', 'lap dat', 'khoan', 'ke', 'thanh rem', 'tay nam', 'ban le', 'lap rap'],
}
const bookingProblemSearchKeywords: Record<ServiceType, Partial<Record<string, readonly string[]>>> = {
  cleaning: {
    [PROBLEM_CHIPS.cleaning[0]]: ['don nha', 'don dep', 've sinh nha', 'lau don'],
    [PROBLEM_CHIPS.cleaning[1]]: ['bep', 'dau mo', 'khu bep'],
    [PROBLEM_CHIPS.cleaning[2]]: ['phong tam', 'nha tam', 'toilet', 'wc'],
    [PROBLEM_CHIPS.cleaning[3]]: ['tong ve sinh', 've sinh sau lau ngay'],
    [PROBLEM_CHIPS.cleaning[4]]: ['sau sua chua', 'bui', 'cong trinh'],
    [PROBLEM_CHIPS.cleaning[5]]: ['cua kinh', 'kinh', 'ban cong'],
  },
  electrical: {
    [PROBLEM_CHIPS.electrical[0]]: ['mat dien', 'mot phong', 'phong ngu', 'phong khach'],
    [PROBLEM_CHIPS.electrical[1]]: ['mat dien', 'toan can', 'ca can'],
    [PROBLEM_CHIPS.electrical[2]]: ['o cam', 'o dien', 'cong tac', 'nong', 'loi'],
    [PROBLEM_CHIPS.electrical[3]]: ['cau dao', 'aptomat', 'cb', 'trip', 'nhay'],
    [PROBLEM_CHIPS.electrical[4]]: ['den', 'chap chon', 'bong den'],
    [PROBLEM_CHIPS.electrical[5]]: ['lap them', 'thiet bi', 'quat', 'may bom'],
  },
  plumbing: {
    [PROBLEM_CHIPS.plumbing[0]]: ['nuoc', 'ong', 'ong nuoc', 'duong ong', 'ro ri', 'ro nuoc', 'tham'],
    [PROBLEM_CHIPS.plumbing[1]]: ['nuoc', 'tac', 'cong', 'bon', 'bon rua', 'lavabo'],
    [PROBLEM_CHIPS.plumbing[2]]: ['nuoc', 'voi', 'voi nuoc', 'voi hong', 'ro voi'],
    [PROBLEM_CHIPS.plumbing[3]]: ['toilet', 'bon cau', 'xa nuoc', 'wc'],
    [PROBLEM_CHIPS.plumbing[4]]: ['nuoc', 'ap nuoc', 'yeu', 'may bom'],
    [PROBLEM_CHIPS.plumbing[5]]: ['lap', 'thay', 'thiet bi', 'voi', 'bon'],
  },
}
export type BookingSearchSuggestion = {
  key: string
  label: string
  problem?: string
  selected: boolean
  serviceType: CustomerServiceId
}
export function normalizeBookingSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
}

function bookingSearchMatches(query: string, values: readonly string[]) {
  if (!query) return true
  return values.some((value) => {
    const normalizedValue = normalizeBookingSearchText(value)
    return normalizedValue.includes(query) || query.includes(normalizedValue)
  })
}

function bookingServiceMatchesQuery(serviceType: CustomerServiceId, query: string, language: AppLanguage) {
  const serviceCopy = customerV21BookingServiceCopy[language][serviceType]
  return bookingSearchMatches(query, [
    serviceCopy.label,
    serviceCopy.note,
    ...bookingServiceSearchKeywords[serviceType],
  ])
}

function bookingProblemMatchesQuery(serviceType: ServiceType, problem: string, query: string, language: AppLanguage) {
  const customerServiceId = serviceType === 'cleaning' ? 'home_cleaning' : serviceType
  return bookingSearchMatches(query, [
    problem,
    customerV21BookingServiceCopy[language][customerServiceId].label,
    ...(bookingProblemSearchKeywords[serviceType][problem] ?? []),
  ])
}

export function buildBookingSearchSuggestions({
  language,
  problemOptions,
  query,
  selectedProblems,
  selectedService,
}: {
  language: AppLanguage
  problemOptions: string[]
  query: string
  selectedProblems: string[]
  selectedService: CustomerServiceId | null
}): BookingSearchSuggestion[] {
  if (selectedService) {
    const serviceMatches = bookingServiceMatchesQuery(selectedService, query, language)
    const productionServiceType = productionServiceTypeForCustomerService(selectedService)
    if (problemOptions.length === 0 || !productionServiceType) {
      return [{
        key: `service-${selectedService}`,
        label: customerV21BookingServiceCopy[language][selectedService].label,
        selected: true,
        serviceType: selectedService,
      }]
    }
    const matchedProblems = problemOptions.filter((problem) =>
      serviceMatches || bookingProblemMatchesQuery(productionServiceType, problem, query, language),
    )
    const visibleProblems = (matchedProblems.length > 0 ? matchedProblems : problemOptions).slice(0, bookingSearchProblemLimit)
    return visibleProblems.map((problem) => ({
      key: `problem-${selectedService}-${problem}`,
      label: problem,
      problem,
      selected: selectedProblems.includes(problem),
      serviceType: selectedService,
    }))
  }

  const matchingServices = CUSTOMER_SERVICE_IDS.filter((serviceType) => {
    if (!query) return true
    const productionServiceType = productionServiceTypeForCustomerService(serviceType)
    return bookingServiceMatchesQuery(serviceType, query, language) || Boolean(
      productionServiceType && PROBLEM_CHIPS[productionServiceType].some((problem) => bookingProblemMatchesQuery(productionServiceType, problem, query, language)),
    )
  })
  const services = (matchingServices.length > 0 ? matchingServices : CUSTOMER_SERVICE_IDS).map((serviceType) => ({
    key: `service-${serviceType}`,
    label: customerV21BookingServiceCopy[language][serviceType].label,
    selected: false,
    serviceType,
  }))
  if (!query) return services

  const problems = matchingServices.flatMap((serviceType) => {
    const productionServiceType = productionServiceTypeForCustomerService(serviceType)
    if (!productionServiceType || serviceType === 'home_cleaning') return []
    const serviceMatches = bookingServiceMatchesQuery(serviceType, query, language)
    return PROBLEM_CHIPS[productionServiceType]
      .filter((problem) => serviceMatches || bookingProblemMatchesQuery(productionServiceType, problem, query, language))
      .slice(0, bookingSearchProblemLimit)
      .map((problem) => ({
        key: `problem-${serviceType}-${problem}`,
        label: problem,
        problem,
        selected: false,
        serviceType,
      }))
  })

  return [...services, ...problems].slice(0, 1 + bookingSearchProblemLimit)
}
