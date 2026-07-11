import {
  buildServiceScopeCard,
  getServicePerformancePlaybook,
  isCustomerServiceId,
  productionServiceTypeForCustomerService,
  type CustomerServiceId,
  type IntakeAnswers,
  type KaelPerformanceMode,
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

const performanceProfileByService: Readonly<Record<ServiceType, KaelPerformanceMode>> = {
  electrical: 'electric_diagnose',
  plumbing: 'water_diagnose',
  cleaning: 'clean_scope',
  hvac: 'air_scope',
  upholstery: 'fabric_scope',
  handyman: 'task_scope',
}

export function performanceProfileForServiceType(serviceType: ServiceType): KaelPerformanceMode {
  return performanceProfileByService[serviceType]
}

export function performanceProfileForBooking(serviceId: CustomerServiceId | null): KaelPerformanceMode | null {
  const serviceType = productionServiceForBooking(serviceId)
  return serviceType ? performanceProfileForServiceType(serviceType) : null
}

export function performancePlaybookForBooking(serviceId: CustomerServiceId | null) {
  const serviceLineId = scopeServiceLineIdForCustomerService(serviceId)
  return serviceLineId ? getServicePerformancePlaybook(serviceLineId) : null
}
