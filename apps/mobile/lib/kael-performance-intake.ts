import {
  buildServiceScopeCard,
  getServicePerformancePlaybook,
  isCustomerServiceId,
  productionServiceTypeForCustomerService,
  type CustomerServiceId,
  type IntakeAnswers,
  type LaunchServiceLineId,
  type ServiceScopeCard,
  type ServiceType,
} from '@nestscout/shared'
import type { AppLanguage } from './app-language'

export function bookingServiceIdFromRoute(value: string | string[] | undefined): CustomerServiceId | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === 'cleaning') return 'home_cleaning'
  return isCustomerServiceId(candidate) ? candidate : null
}

export function scopeServiceLineIdForCustomerService(serviceId: CustomerServiceId | null): LaunchServiceLineId | null {
  if (!serviceId || serviceId === 'electrical' || serviceId === 'plumbing') return null
  return serviceId
}

export function buildPerformanceScopeCard(input: {
  serviceLineId: LaunchServiceLineId
  answers: IntakeAnswers
  mediaCount: number
}): ServiceScopeCard {
  return buildServiceScopeCard({
    serviceLineId: input.serviceLineId,
    answers: input.answers,
    mediaCount: input.mediaCount,
  })
}

export function buildExistingBookingDraftFromScope(
  scopeCard: ServiceScopeCard,
  language: AppLanguage,
): { serviceType: ServiceType; problemChips: readonly string[]; description: string } | null {
  const serviceType = scopeCard.productionServiceType
  if (!serviceType) return null
  const checklist = language === 'vi' ? scopeCard.completionChecklistVi : scopeCard.completionChecklistEn
  const excluded = language === 'vi' ? scopeCard.unsupportedBoundariesVi : scopeCard.unsupportedBoundariesEn
  const summary = language === 'vi' ? scopeCard.scopeSummaryVi : scopeCard.scopeSummaryEn
  return {
    serviceType,
    problemChips: scopeCard.problemChips,
    description: [
      `[${scopeCard.kaelScopeName}]`,
      summary,
      `${language === 'vi' ? 'Checklist hoàn tất' : 'Completion checklist'}: ${checklist.join('; ')}`,
      `${language === 'vi' ? 'Không bao gồm' : 'Not included'}: ${excluded.join('; ')}`,
    ].join('\n'),
  }
}

export function productionServiceForBooking(serviceId: CustomerServiceId | null): ServiceType | null {
  return serviceId ? productionServiceTypeForCustomerService(serviceId) : null
}

export function performancePlaybookForBooking(serviceId: CustomerServiceId | null) {
  const serviceLineId = scopeServiceLineIdForCustomerService(serviceId)
  return serviceLineId ? getServicePerformancePlaybook(serviceLineId) : null
}
