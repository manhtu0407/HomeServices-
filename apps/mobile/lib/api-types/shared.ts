import type { ApartmentAccessProfileInput, ComplexityLevel, ServiceType } from '@nestscout/shared'

export type AccountDeletionInput = {
  acknowledge_data_loss: true
  client_request_id: string
  confirmation: 'XÓA TÀI KHOẢN'
}

export type AccountDeletionResponse = {
  account_deleted: true
  request_id: string
  retained_transaction_records: true
}

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

export type OriginalScopePriceQuote = {
  schema_version: 'original_scope_price_quote.v1'
  quote_id: string
  reference_price_min: number
  reference_price_max: number
  customer_total: number
  platform_fee: number
  worker_net: number
  commission_level: number
  commission_rate_bps: number
  price_source: string
  selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation'
  worker_confirmation_required: true
  customer_confirmation_required: true
  worker_confirmed_at: string | null
  expires_at: string
  evidence_summary: {
    confidence: 'low' | 'medium' | 'high'
    baseline_source_count: number
    market_source_count: number
    high_trust_source_count: number
    quorum_met: true
    cap_statement: string
  }
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
