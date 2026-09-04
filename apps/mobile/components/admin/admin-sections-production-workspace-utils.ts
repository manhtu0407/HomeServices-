import type { CustomerThemeTokens } from '@/components/customer/customer-theme'

import type { AdminProductionCapabilityStatus } from './admin-sections-production-copy'

export function normalizeAdminProductionSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

export function adminProductionStatusColors(status: AdminProductionCapabilityStatus, tokens: CustomerThemeTokens) {
  if (status === 'connected') return { dot: tokens.primary, text: tokens.statusText }
  return { dot: tokens.subtleText, text: tokens.muted }
}

export function adminProductionDetailStatusColors(status: AdminProductionCapabilityStatus, tokens: CustomerThemeTokens) {
  if (status === 'connected') return { dot: tokens.primary, text: tokens.statusText }
  if (status === 'missing') return { dot: tokens.danger, text: tokens.danger }
  return { dot: tokens.copper, text: tokens.copper }
}
