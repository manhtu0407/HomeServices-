import type { ServiceType } from '@nestscout/shared'

import type { CustomerKaelMode, CustomerV21ScreenId } from './types'

export const caseScreenIds: CustomerV21ScreenId[] = [
  '2.5-chat-case',
  '2.6-case-overview',
  '2.7-matching',
  '2.8-options',
  '2.9-quotes',
  '3.1-payment-review',
  '3.2-payment-method',
  '3.3-payment-protected',
  '2.10-location-eta',
  '2.11-live-alert',
  '2.12-job-accepted',
  '2.13-job-progress',
]

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function servicesScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return value === '2.2-search' ? value : null
}

export function chatScreenModeParam(value: string | undefined): CustomerKaelMode | null {
  if (value === '2.4-chat-normal') return 'normal'
  if (value === '2.5-chat-case') return 'case'
  return null
}

export function activityScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return caseScreenIds.includes(value as CustomerV21ScreenId) ? value as CustomerV21ScreenId : null
}

export function serviceParam(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}
