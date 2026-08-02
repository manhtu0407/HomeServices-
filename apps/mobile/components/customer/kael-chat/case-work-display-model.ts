import { appCopy, localizedProblemLabel, type AppLanguage } from '@/lib/app-language'
import { formatHcmcScheduledAt } from '@/lib/hcmc-schedule'
import { buildLocalJobDisplayCode, type LocalDeal } from '@nestscout/shared'

import { customerV21CommonCopy } from '../ui/copy'

export {
  approvalConfidenceLabel,
  canCustomerDecideScopeChange,
  formatNumber,
  formatShortClockTime,
  formatVnd,
  isDealPaymentProtected,
  isPaymentProtectedStatus,
  isPendingCustomerScopeChange,
  paymentLedgerConfirmationStep,
  scopeChangeAmountLabel,
  scopeChangeApproveLabel,
} from './case-work-money-display-model'

export function caseDisplayCode(deal: LocalDeal, language: AppLanguage) {
  if (deal.displayCode) return deal.displayCode
  if (!deal.id.startsWith('local-')) {
    return buildLocalJobDisplayCode({
      jobId: deal.id,
      createdAt: deal.createdAt,
    })
  }
  return language === 'vi' ? 'Nháp dịch vụ' : 'Service draft'
}

export function formatDurationShort(seconds: number, language: AppLanguage) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return language === 'vi' ? `${minutes} phút` : `${minutes} min`
}

export function normalizeKaelRoutingText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function agenticProblemTaxonomyLabel(value: string, language: AppLanguage) {
  const normalized = normalizeKaelRoutingText(value).replace(/[^a-z0-9]+/g, '_')
  const viLabels: Record<string, string> = {
    electrical_flickering_light: 'Đèn chập chờn',
    electrical_outlet_switch: 'Ổ điện',
    outlet_switch: 'Ổ điện',
    electrical_outlet_or_switch_broken: 'Ổ cắm/công tắc hỏng',
    outlet_or_switch_broken: 'Ổ cắm/công tắc hỏng',
    pipe_leak: 'Rò nước',
    plumbing_pipe_leak: 'Rò nước',
    weak_pressure: 'Áp yếu',
    plumbing_weak_pressure: 'Áp yếu',
    clogged_drain: 'Tắc cống',
    plumbing_clogged_drain: 'Tắc cống',
    faucet_issue: 'Vòi hỏng',
    plumbing_faucet_issue: 'Vòi hỏng',
    flickering_light: 'Đèn chập chờn',
  }
  const enLabels: Record<string, string> = {
    electrical_flickering_light: 'Flickering light',
    electrical_outlet_switch: 'Outlet or switch',
    outlet_switch: 'Outlet or switch',
    electrical_outlet_or_switch_broken: 'Outlet or switch issue',
    outlet_or_switch_broken: 'Outlet or switch issue',
    pipe_leak: 'Pipe leak',
    plumbing_pipe_leak: 'Pipe leak',
    weak_pressure: 'Weak water pressure',
    plumbing_weak_pressure: 'Weak water pressure',
    clogged_drain: 'Clogged drain',
    plumbing_clogged_drain: 'Clogged drain',
    faucet_issue: 'Faucet issue',
    plumbing_faucet_issue: 'Faucet issue',
    flickering_light: 'Flickering light',
  }
  const labels = language === 'vi' ? viLabels : enLabels
  return labels[normalized] ?? null
}

export function looksLikeRawProblemTaxonomy(value: string) {
  const trimmed = value.trim()
  return /^[a-z]+:[\s_a-z0-9-]+$/i.test(trimmed) || /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed)
}

export function agenticDealProblemLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const candidates = [
    deal.estimate?.problemLabel,
    deal.broadcast?.problemSummary,
    ...deal.draft.problemChips,
    deal.draft.inferredProblemLabel,
    deal.draft.description,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const candidate of candidates) {
    const mapped = agenticProblemTaxonomyLabel(candidate, language)
    if (mapped) return mapped
    if (looksLikeRawProblemTaxonomy(candidate)) continue
    const localized = localizedProblemLabel(candidate, deal.draft.serviceType, language)
    if (localized !== appCopy[language].common.unknown) return localized.trim()
  }
  return copy.dataPending
}

export function timeChoiceLabel(value: LocalDeal['draft']['timeChoice'], language: AppLanguage, scheduledAt?: string | null) {
  const scheduledLabel = formatHcmcScheduledAt(scheduledAt)
  if (scheduledLabel) return scheduledLabel
  if (value === 'now') return language === 'vi' ? 'Sớm nhất có thể' : 'As soon as possible'
  return customerV21CommonCopy[language].dataPending
}
