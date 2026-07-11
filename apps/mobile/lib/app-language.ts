import { useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { PROBLEM_CHIPS, type LocalDealStatus, type ServiceType } from '@nestscout/shared'

export type AppLanguage = 'vi' | 'en'

export const APP_LANGUAGE_STORAGE_KEY = 'nestscout.app.language.production'

const LEGACY_LANGUAGE_STORAGE_KEYS = [
  'home-services.app.language.production',
  'customer.language.mode.v4',
  'home-services.worker.language.production',
] as const

let appLanguage: AppLanguage = 'vi'
let hydrated = false
const listeners = new Set<() => void>()

export const appCopy = {
  vi: {
    common: {
      appLanguage: 'Ngôn ngữ',
      chooseArea: 'Chưa có khu vực',
      noData: 'Chưa có',
      noRequest: 'Chưa có yêu cầu',
      pendingSystem: 'Chờ duyệt',
      realRequest: 'Đang có yêu cầu',
      serviceRequest: 'Yêu cầu dịch vụ',
      unknown: 'Chưa rõ',
    },
    services: {
      cleaning: 'Vệ sinh',
      electrical: 'Sửa điện',
      handyman: 'Sửa vặt & lắp đặt nhỏ',
      hvac: 'Điều hòa & không khí',
      none: 'Chưa chọn',
      plumbing: 'Sửa nước',
      upholstery: 'Sofa, nệm, rèm, thảm',
    },
    status: {
      analyzing: 'Kael đang phân tích',
      estimate_ready: 'Kael đang giải thích ước tính',
      awaiting_customer_confirm: 'Kael đang điều phối',
      broadcasting: 'Đang gửi thợ',
      worker_candidate_pending: 'Chờ xác nhận thợ phù hợp',
      cancelled: 'Đã hủy',
      completed_by_worker: 'Thợ báo hoàn tất',
      confirmed_by_customer: 'Kael xác nhận hoàn tất',
      payment_pending: 'Đang chờ thanh toán',
      paid: 'Đã nhận thanh toán',
      draft: 'Nháp',
      inspecting: 'Đang kiểm tra',
      none: 'Chưa có phiếu',
      repairing: 'Đang sửa',
      reviewed: 'Đã đánh giá',
      scope_change_pending: 'Kael đang xét đổi phạm vi',
      worker_matched: 'Thợ đã nhận',
      worker_on_way: 'Thợ đang đến',
      arrived: 'Thợ đã đến',
    },
  },
  en: {
    common: {
      appLanguage: 'Language',
      chooseArea: 'No area selected',
      noData: 'No data',
      noRequest: 'No request yet',
      pendingSystem: 'Pending approval',
      realRequest: 'Active request',
      serviceRequest: 'Service request',
      unknown: 'Unknown',
    },
    services: {
      cleaning: 'Cleaning',
      electrical: 'Electrical repair',
      handyman: 'Minor repairs & installation',
      hvac: 'Air conditioning & air care',
      none: 'Not selected',
      plumbing: 'Plumbing repair',
      upholstery: 'Upholstery care',
    },
    status: {
      analyzing: 'Kael is analyzing',
      estimate_ready: 'Kael is explaining the estimate',
      awaiting_customer_confirm: 'Kael is orchestrating',
      broadcasting: 'Sending to workers',
      worker_candidate_pending: 'Worker option awaiting review',
      cancelled: 'Cancelled',
      completed_by_worker: 'Worker marked complete',
      confirmed_by_customer: 'Kael confirmed completion',
      payment_pending: 'Payment pending',
      paid: 'Payment received',
      draft: 'Draft',
      inspecting: 'Inspecting',
      none: 'No ticket yet',
      repairing: 'Repairing',
      reviewed: 'Reviewed',
      scope_change_pending: 'Kael reviewing scope change',
      worker_matched: 'Worker accepted',
      worker_on_way: 'Worker on the way',
      arrived: 'Worker arrived',
    },
  },
} as const

const problemLabels: Record<AppLanguage, Record<ServiceType, Record<string, string>>> = {
  vi: {
    electrical: Object.fromEntries(PROBLEM_CHIPS.electrical.map((label) => [label, label])),
    plumbing: Object.fromEntries(PROBLEM_CHIPS.plumbing.map((label) => [label, label])),
    cleaning: Object.fromEntries(PROBLEM_CHIPS.cleaning.map((label) => [label, label])),
    hvac: Object.fromEntries(PROBLEM_CHIPS.hvac.map((label) => [label, label])),
    upholstery: Object.fromEntries(PROBLEM_CHIPS.upholstery.map((label) => [label, label])),
    handyman: Object.fromEntries(PROBLEM_CHIPS.handyman.map((label) => [label, label])),
  },
  en: {
    electrical: {
      'Mất điện một phòng': 'One room has no power',
      'Mất điện toàn căn': 'Whole apartment outage',
      'Ổ cắm/công tắc hỏng': 'Outlet or switch issue',
      'Cầu dao trip': 'Breaker trips',
      'Đèn chập chờn': 'Flickering light',
      'Lắp thêm thiết bị': 'Install a fixture',
      'Vấn đề khác': 'Other electrical issue',
    },
    plumbing: {
      'Ống rò rỉ': 'Pipe leak',
      'Tắc cống/bồn': 'Drain or sink clog',
      'Vòi hỏng': 'Broken faucet',
      'Toilet không xả': 'Toilet flush issue',
      'Áp nước yếu': 'Weak water pressure',
      'Lắp/thay thiết bị': 'Install or replace fixture',
      'Vấn đề khác': 'Other plumbing issue',
    },
    cleaning: {
      'Dọn dẹp nhà': 'Home cleaning',
      'Vệ sinh bếp': 'Kitchen cleaning',
      'Vệ sinh phòng tắm': 'Bathroom cleaning',
      'Tổng vệ sinh': 'Deep cleaning',
      'Dọn sau sửa chữa': 'Post-repair cleaning',
      'Vệ sinh cửa kính': 'Window cleaning',
      'Vấn đề khác': 'Other cleaning request',
    },
    hvac: {
      [PROBLEM_CHIPS.hvac[0]]: 'Air-conditioner cleaning',
      [PROBLEM_CHIPS.hvac[1]]: 'Weak cooling',
      [PROBLEM_CHIPS.hvac[2]]: 'Not cooling',
      [PROBLEM_CHIPS.hvac[3]]: 'Water leak',
      [PROBLEM_CHIPS.hvac[4]]: 'Unusual noise',
      [PROBLEM_CHIPS.hvac[5]]: 'Error code',
      [PROBLEM_CHIPS.hvac[6]]: 'Other air-conditioning issue',
    },
    upholstery: {
      [PROBLEM_CHIPS.upholstery[0]]: 'Sofa cleaning',
      [PROBLEM_CHIPS.upholstery[1]]: 'Mattress cleaning',
      [PROBLEM_CHIPS.upholstery[2]]: 'Curtain cleaning',
      [PROBLEM_CHIPS.upholstery[3]]: 'Carpet cleaning',
      [PROBLEM_CHIPS.upholstery[4]]: 'Stain treatment',
      [PROBLEM_CHIPS.upholstery[5]]: 'Odor or mold',
      [PROBLEM_CHIPS.upholstery[6]]: 'Other upholstery request',
    },
    handyman: {
      [PROBLEM_CHIPS.handyman[0]]: 'Drill or mount shelf',
      [PROBLEM_CHIPS.handyman[1]]: 'Install curtain rod',
      [PROBLEM_CHIPS.handyman[2]]: 'Install light or small fixture',
      [PROBLEM_CHIPS.handyman[3]]: 'Fix hinge or handle',
      [PROBLEM_CHIPS.handyman[4]]: 'Install bathroom fixture',
      [PROBLEM_CHIPS.handyman[5]]: 'Mount TV or furniture',
      [PROBLEM_CHIPS.handyman[6]]: 'Other small task',
    },
  },
}

const genericProblemLabels: Record<AppLanguage, Record<string, string>> = {
  vi: {
    'Kael sẽ phân tích chi tiết': 'Kael sẽ phân tích chi tiết',
    'Yêu cầu mới': 'Yêu cầu mới',
    'Yêu cầu sửa chữa': 'Yêu cầu sửa chữa',
  },
  en: {
    'Kael sẽ phân tích chi tiết': 'Kael will analyze the details',
    'Yêu cầu mới': 'New request',
    'Yêu cầu sửa chữa': 'Repair request',
  },
}

const nonAsciiPattern = /[^\x00-\x7F]/

export function getAppLanguageSnapshot() {
  return appLanguage
}

export function subscribeAppLanguage(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAppLanguage(nextLanguage: AppLanguage) {
  applyAppLanguage(nextLanguage)
}

function applyAppLanguage(nextLanguage: AppLanguage) {
  const changed = appLanguage !== nextLanguage
  appLanguage = nextLanguage
  void AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage).catch(() => undefined)
  if (!changed) return
  listeners.forEach((listener) => listener())
}

export function toggleAppLanguage() {
  setAppLanguage(appLanguage === 'vi' ? 'en' : 'vi')
}

export function useAppLanguage() {
  useEffect(() => {
    if (hydrated) return
    hydrated = true
    void hydrateAppLanguage()
  }, [])

  return useSyncExternalStore(subscribeAppLanguage, getAppLanguageSnapshot, getAppLanguageSnapshot)
}

export function localizedServiceLabel(serviceType: ServiceType | null, language: AppLanguage = appLanguage) {
  if (!serviceType) return appCopy[language].services.none
  return appCopy[language].services[serviceType]
}

export function localizedStatusLabel(status: LocalDealStatus | null, language: AppLanguage = appLanguage) {
  if (!status) return appCopy[language].status.none
  return appCopy[language].status[status]
}

export function localizedProblemLabel(problem: string | null | undefined, serviceType: ServiceType | null, language: AppLanguage = appLanguage) {
  if (!problem) return appCopy[language].common.unknown
  const knownLabel = serviceType
    ? problemLabels[language][serviceType][problem] ?? genericProblemLabels[language][problem]
    : genericProblemLabels[language][problem]
  if (knownLabel) return knownLabel
  if (language === 'vi' && !nonAsciiPattern.test(problem)) return appCopy.vi.common.unknown
  if (language === 'en' && nonAsciiPattern.test(problem)) return appCopy.en.common.unknown
  return problem
}

export function localizedProblemOptions(serviceType: ServiceType, language: AppLanguage = appLanguage) {
  return PROBLEM_CHIPS[serviceType].map((value) => ({
    label: localizedProblemLabel(value, serviceType, language),
    value,
  }))
}

export function languageDisplayName(language: AppLanguage) {
  return language === 'vi' ? 'Tiếng Việt' : 'English'
}

export function nextLanguageLabel(language: AppLanguage) {
  return language === 'vi' ? 'English' : 'Tiếng Việt'
}

export async function hydrateAppLanguage() {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY).catch(() => null)
  if (stored === 'vi' || stored === 'en') {
    applyAppLanguage(stored)
    return
  }

  const legacyValues = await Promise.all(
    LEGACY_LANGUAGE_STORAGE_KEYS.map((key) => AsyncStorage.getItem(key).catch(() => null)),
  )
  const legacy = legacyValues.find((value): value is AppLanguage => value === 'vi' || value === 'en')
  if (legacy) {
    applyAppLanguage(legacy)
  }
}
