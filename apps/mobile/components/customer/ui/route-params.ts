import type { ServiceType } from '@nestscout/shared'

import type { CustomerKaelMode, CustomerV21ScreenId } from './types'

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

export function serviceParam(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}
