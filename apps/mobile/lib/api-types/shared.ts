import type { ApartmentAccessProfileInput, ComplexityLevel, ServiceType } from '@nestscout/shared'

export type AddressAccessView = {
  release_stage: 'area_only' | 'building_released' | 'unit_released'
  exact_unit_released: boolean
  worker_checked_in: boolean
  check_in_required: boolean
  identity_check_required: boolean
  customer_handoff_required: boolean
  evidence_mode: 'none' | 'geofence' | 'manual_photo'
  access_profile: ApartmentAccessProfileInput
}

export type ServiceCatalogResponse = {
  services: {
    id: string
    service_type: ServiceType
    label_vi: string
    problems: {
      id: string
      slug: string
      label_vi: string
      default_complexity: ComplexityLevel
    }[]
    baselines: {
      complexity: ComplexityLevel
      district_code: string
      price_min: number
      price_max: number
    }[]
  }[]
}

export type PlacesAutocompleteResponse = {
  suggestions: {
    place_id: string
    label: string
    main_text: string
    secondary_text: string | null
  }[]
  fallback_used: boolean
}

export type PlacesResolveResponse = {
  fallback_used: boolean
  label: string | null
  location: { lat: number; lng: number } | null
  place_id: string
  provider: 'vietmap' | 'google_maps' | 'fallback'
}
