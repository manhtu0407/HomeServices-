import { useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { PROBLEM_CHIPS, type LocalDealStatus, type ServiceType } from '@home-services/shared'

export type AppLanguage = 'vi' | 'en'

export const APP_LANGUAGE_STORAGE_KEY = 'home-services.app.language.production'

const LEGACY_LANGUAGE_STORAGE_KEYS = [
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
      none: 'Chưa chọn',
      plumbing: 'Sửa nước',
    },
    status: {
      analyzing: 'Kael đang phân tích',
      awaiting_customer_confirm: 'Chờ khách xác nhận',
      broadcasting: 'Đang gửi thợ',
      cancelled: 'Đã hủy',
      completed_by_worker: 'Thợ báo hoàn tất',
      confirmed_by_customer: 'Khách xác nhận xong',
      draft: 'Nháp',
      inspecting: 'Đang kiểm tra',
      none: 'Chưa có phiếu',
      repairing: 'Đang sửa',
      reviewed: 'Đã đánh giá',
      scope_change_pending: 'Chờ khách duyệt thay đổi',
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
      none: 'Not selected',
      plumbing: 'Plumbing repair',
    },
    status: {
      analyzing: 'Kael is analyzing',
      awaiting_customer_confirm: 'Waiting for customer confirmation',
      broadcasting: 'Sending to workers',
      cancelled: 'Cancelled',
      completed_by_worker: 'Worker marked complete',
      confirmed_by_customer: 'Customer confirmed completion',
      draft: 'Draft',
      inspecting: 'Inspecting',
      none: 'No ticket yet',
      repairing: 'Repairing',
      reviewed: 'Reviewed',
      scope_change_pending: 'Waiting for customer scope decision',
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
    void hydrateLanguage()
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

async function hydrateLanguage() {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY).catch(() => null)
  if (stored === 'vi' || stored === 'en') {
    applyAppLanguage(stored)
    return
  }

  for (const key of LEGACY_LANGUAGE_STORAGE_KEYS) {
    const legacy = await AsyncStorage.getItem(key).catch(() => null)
    if (legacy === 'vi' || legacy === 'en') {
      applyAppLanguage(legacy)
      return
    }
  }
}
