import type { LocalDeal } from '@nestscout/shared'

import { type AppLanguage } from '@/lib/app-language'

import { textByLanguage } from './format'
import { routeDestinationLabel } from './labels'

const LIVE_DISTANCE_FORMATTERS = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }),
} as const

export type WorkerV5MapLocation = {
  lat: number
  lng: number
  provider: 'vietmap' | 'google_maps'
}

export type WorkerV5AcceptEtaSignal = {
  hasSignal: boolean
  label: string
  meta: string
}

export type WorkerV5RouteDistanceSignal = {
  hasSignal: boolean
  label: string
  meta: string
}

export type WorkerV5CheckInState = 'active' | 'done' | 'pending'

export type WorkerV5BroadcastRouteMetadata = {
  metadata?: Record<string, unknown> | null
  safe_metadata?: Record<string, unknown> | null
}

export function workerV5LiveEtaSignal(
  route: { durationSeconds: number },
  language: AppLanguage,
) {
  const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60))
  return {
    hasSignal: true,
    label: textByLanguage(language, `Di chuyển trong ${minutes} phút`, `Travel in ${minutes} min`),
    value: textByLanguage(language, `${minutes} phút`, `${minutes} min`),
  }
}

export function workerV5LiveDistanceSignal(
  route: { distanceMeters: number },
  language: AppLanguage,
) {
  const kilometers = route.distanceMeters / 1000
  const label = kilometers >= 1
    ? `${LIVE_DISTANCE_FORMATTERS[language].format(kilometers)} km`
    : `${Math.max(1, Math.round(route.distanceMeters))} m`
  return {
    hasSignal: true,
    label,
    meta: textByLanguage(language, `Quãng đường thật · ${label}`, `Real route distance · ${label}`),
  }
}

function workerV5BroadcastRouteMetadata(deal: LocalDeal | null): Record<string, unknown> | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  return broadcast?.safe_metadata ?? broadcast?.metadata ?? null
}

export function workerV5KaelOpportunityMatchScore(deal: LocalDeal | null): number | null {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  if (!metadata) return null
  const scoreKeys = ['match_score', 'matchScore', 'worker_match_score', 'kael_match_score', 'fit_score']
  for (const key of scoreKeys) {
    const value = workerV5FiniteNumberFromUnknown(metadata[key])
    if (value == null) continue
    const normalized = value <= 1 ? value * 100 : value
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }
  return null
}

export function workerV5ArrivalDestinationLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có điểm đến', 'No destination')
  if (deal.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel) return deal.broadcast.fullAddressLabel
  return routeDestinationLabel(deal, language)
}

export function buildWorkerV5AcceptEtaSignal(deal: LocalDeal | null, language: AppLanguage): WorkerV5AcceptEtaSignal {
  const syncedEtaLabel = workerV5AcceptEtaFromBroadcastMetadata(deal, language)
    ?? workerV5AcceptEtaFromPrebrief(deal?.broadcast?.prebrief, language)

  if (syncedEtaLabel) {
    return {
      hasSignal: true,
      label: syncedEtaLabel,
      meta: textByLanguage(
        language,
        'Kael đã ước tính từ dữ liệu quãng đường đã đồng bộ.',
        'Kael estimated this from synced route distance.',
      ),
    }
  }

  return {
    hasSignal: false,
    label: textByLanguage(language, 'Đang đo thời gian đến', 'Measuring ETA'),
    meta: textByLanguage(
      language,
      'Kael sẽ hiện thời gian khi backend đồng bộ quãng đường thật.',
      'Kael shows travel time when the backend syncs real route distance.',
    ),
  }
}

export function buildWorkerV5RouteDistanceSignal(deal: LocalDeal | null, language: AppLanguage): WorkerV5RouteDistanceSignal {
  const syncedDistanceLabel = workerV5RouteDistanceFromBroadcastMetadata(deal, language)
    ?? workerV5RouteDistanceFromPrebrief(deal?.broadcast?.prebrief, language)

  if (syncedDistanceLabel) {
    return {
      hasSignal: true,
      label: syncedDistanceLabel,
      meta: textByLanguage(language, `Quãng đường thật · ${syncedDistanceLabel}`, `Real route distance · ${syncedDistanceLabel}`),
    }
  }

  return {
    hasSignal: false,
    label: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data'),
    meta: textByLanguage(language, 'Kael sẽ hiện quãng đường khi backend đồng bộ tuyến đường.', 'Kael shows distance when the backend syncs the route.'),
  }
}

function workerV5RouteDistanceFromBroadcastMetadata(deal: LocalDeal | null, language: AppLanguage): string | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  const metadata = broadcast?.safe_metadata ?? broadcast?.metadata ?? null
  if (!metadata) return null

  const labelKeys = ['route_distance_label', 'travel_distance_label', 'distance_label']
  for (const key of labelKeys) {
    const label = workerV5StringFromUnknown(metadata[key])
    if (label) return normalizeWorkerV5RouteDistanceLabel(label, language)
  }

  const kilometerKeys = ['route_distance_km', 'travel_distance_km', 'distance_km']
  for (const key of kilometerKeys) {
    const kilometers = workerV5PositiveNumberFromUnknown(metadata[key])
    if (kilometers != null) return formatWorkerV5RouteKilometers(kilometers, language)
  }

  const meterKeys = ['route_distance_m', 'travel_distance_m', 'distance_m', 'route_distance_meters', 'travel_distance_meters', 'distance_meters']
  for (const key of meterKeys) {
    const meters = workerV5PositiveNumberFromUnknown(metadata[key])
    if (meters != null) return formatWorkerV5RouteMeters(meters, language)
  }

  return null
}

function workerV5RouteDistanceFromPrebrief(prebrief: readonly string[] | null | undefined, language: AppLanguage): string | null {
  for (const line of prebrief ?? []) {
    const text = line.trim()
    if (!/(quãng đường|khoảng cách|distance|route|travel)/i.test(text)) continue

    const kilometerMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer|kilometers|kilometre|kilometres)\b/i)
    if (kilometerMatch) return formatWorkerV5RouteKilometers(Number(kilometerMatch[1].replace(',', '.')), language)

    const meterMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/i)
    if (meterMatch) return formatWorkerV5RouteMeters(Number(meterMatch[1].replace(',', '.')), language)
  }

  return null
}

function workerV5AcceptEtaFromBroadcastMetadata(deal: LocalDeal | null, language: AppLanguage): string | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  const metadata = broadcast?.safe_metadata ?? broadcast?.metadata ?? null
  if (!metadata) return null

  const labelKeys = ['travel_eta_label', 'estimated_travel_time_label', 'route_eta_label', 'eta_label']
  for (const key of labelKeys) {
    const label = workerV5StringFromUnknown(metadata[key])
    if (label) return normalizeWorkerV5AcceptEtaLabel(label, language)
  }

  const minuteKeys = ['travel_minutes', 'estimated_travel_minutes', 'route_eta_minutes', 'eta_minutes']
  for (const key of minuteKeys) {
    const minutes = workerV5PositiveNumberFromUnknown(metadata[key])
    if (minutes != null) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaMinutes(minutes, language), language)
  }

  const secondKeys = ['travel_seconds', 'estimated_travel_seconds', 'route_eta_seconds', 'eta_seconds']
  for (const key of secondKeys) {
    const seconds = workerV5PositiveNumberFromUnknown(metadata[key])
    if (seconds != null) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaSeconds(seconds, language), language)
  }

  return null
}

function workerV5AcceptEtaFromPrebrief(prebrief: readonly string[] | null | undefined, language: AppLanguage): string | null {
  for (const line of prebrief ?? []) {
    const text = line.trim()
    if (!/(eta|di chuyển|thời gian|quãng đường|travel|route|distance)/i.test(text)) continue

    const minuteMatch = text.match(/(\d{1,3})\s*(phút|p|minute|minutes|min)\b/i)
    if (minuteMatch) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaMinutes(Number(minuteMatch[1]), language), language)

    const secondMatch = text.match(/(\d{1,4})\s*(giây|s|second|seconds|sec)\b/i)
    if (secondMatch) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaSeconds(Number(secondMatch[1]), language), language)
  }

  return null
}

function normalizeWorkerV5AcceptEtaLabel(raw: string, language: AppLanguage) {
  const label = raw.trim()
  if (!label) return null
  if (language === 'vi') {
    const minuteMatch = label.match(/(\d{1,3})\s*(phút|p|minute|minutes|min)\b/i)
    if (minuteMatch) return `Di chuyển trong ${formatWorkerV5EtaMinutes(Number(minuteMatch[1]), language)}`

    const secondMatch = label.match(/(\d{1,4})\s*(giây|s|second|seconds|sec)\b/i)
    if (secondMatch) return `Di chuyển trong ${formatWorkerV5EtaSeconds(Number(secondMatch[1]), language)}`

    const localizedLabel = label
      .replace(/\bETA\b/gi, 'thời gian đến')
      .replace(/\bestimated\b/gi, 'ước tính')
      .replace(/\btravel\b/gi, 'di chuyển')
      .replace(/\broute\b/gi, 'lộ trình')
      .replace(/\btime\b/gi, 'thời gian')
      .replace(/\bminutes?\b|\bmin\b/gi, 'phút')
      .replace(/\bseconds?\b|\bsec\b/gi, 'giây')
      .trim()

    if (/(di chuyển|thời gian|lộ trình|quãng đường)/i.test(localizedLabel)) return localizedLabel
    return `Di chuyển trong ${localizedLabel}`
  }
  if (/(eta|di chuyển|travel|route)/i.test(label)) return label
  return textByLanguage(language, `Di chuyển trong ${label}`, `Travel in ${label}`)
}

function formatWorkerV5EtaMinutes(minutes: number, language: AppLanguage) {
  const rounded = Math.max(1, Math.round(minutes))
  return textByLanguage(language, `${rounded} phút`, `${rounded} min`)
}

function formatWorkerV5EtaSeconds(seconds: number, language: AppLanguage) {
  return formatWorkerV5EtaMinutes(Math.ceil(seconds / 60), language)
}

export function workerV5EtaLensValue(label: string) {
  const minuteMatch = label.match(/(\d{1,3})/)
  return minuteMatch ? minuteMatch[1] : null
}

function normalizeWorkerV5RouteDistanceLabel(raw: string, language: AppLanguage) {
  const label = raw.trim()
  if (!label) return null
  const kilometerMatch = label.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer|kilometers|kilometre|kilometres)\b/i)
  if (kilometerMatch) return formatWorkerV5RouteKilometers(Number(kilometerMatch[1].replace(',', '.')), language)

  const meterMatch = label.match(/(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/i)
  if (meterMatch) return formatWorkerV5RouteMeters(Number(meterMatch[1].replace(',', '.')), language)

  return label
    .replace(/\bdistance\b/gi, language === 'vi' ? 'quãng đường' : 'distance')
    .replace(/\bmeters?\b|\bmetres?\b/gi, language === 'vi' ? 'm' : 'm')
    .replace(/\bkilometers?\b|\bkilometres?\b/gi, language === 'vi' ? 'km' : 'km')
    .trim()
}

const ROUTE_KILOMETER_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Record<1 | 2, Intl.NumberFormat>> = {
  en: {
    1: new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
    2: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
  },
  vi: {
    1: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
    2: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
  },
}
const ROUTE_METER_FORMATTER_BY_LANGUAGE: Record<AppLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-US'),
  vi: new Intl.NumberFormat('vi-VN'),
}

function formatWorkerV5RouteKilometers(kilometers: number, language: AppLanguage) {
  const safeKm = Math.max(0.1, kilometers)
  const maximumFractionDigits = safeKm >= 10 ? 1 : 2
  const label = ROUTE_KILOMETER_FORMATTER_BY_LANGUAGE[language][maximumFractionDigits].format(safeKm)
  return `${label} km`
}

function formatWorkerV5RouteMeters(meters: number, language: AppLanguage) {
  if (meters >= 1000) return formatWorkerV5RouteKilometers(meters / 1000, language)
  const safeMeters = Math.max(1, Math.round(meters))
  return `${ROUTE_METER_FORMATTER_BY_LANGUAGE[language].format(safeMeters)} m`
}

export function workerV5StringFromUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function workerV5FiniteNumberFromUnknown(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim().replace(',', '.'))
      : Number.NaN
  return Number.isFinite(numeric) ? numeric : null
}

function workerV5PositiveNumberFromUnknown(value: unknown) {
  const numeric = workerV5FiniteNumberFromUnknown(value)
  return numeric != null && numeric > 0 ? numeric : null
}
