import { isCustomerServiceId, productionServiceTypeForCustomerService, type CustomerServiceId, type KaelPerformanceMode, type ServiceType } from '@nestscout/shared'

export function bookingServiceIdFromRoute(value: string | string[] | undefined): CustomerServiceId | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === 'cleaning') return 'home_cleaning'
  return isCustomerServiceId(candidate) ? candidate : null
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
