// Worker map geometry helpers + reducer, extracted from worker-surfaces.tsx (C4 stage 5b).
import { Alert, Linking } from 'react-native'
import type { WorkerHomeMapAction, WorkerHomeMapState, WorkerLanguageMode, WorkerMapMode, WorkerMapProviderModel } from './types'

export function finiteMapNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function createWorkerMapProviderModel({
  areaLabel,
  fullAddressLabel,
  mapMode,
  serviceRadius,
  trafficEnabled,
  workerLat,
  workerLng,
}: {
  areaLabel: string
  fullAddressLabel: string | null
  mapMode: WorkerMapMode
  serviceRadius: number | null
  trafficEnabled: boolean
  workerLat: number | null | undefined
  workerLng: number | null | undefined
}): WorkerMapProviderModel {
  const lat = finiteMapNumber(workerLat)
  const lng = finiteMapNumber(workerLng)
  const releasedFullAddressLabel = fullAddressLabel?.trim() || null
  return {
    areaLabel,
    fullAddressLabel: releasedFullAddressLabel,
    mapMode,
    serviceRadius,
    routeRequestReady: mapMode === 'route' && Boolean(releasedFullAddressLabel),
    trafficEnabled,
    workerOrigin: lat !== null && lng !== null ? { lat, lng } : null,
  }
}

export function buildWorkerMapDirectionsUrl(destinationLabel: string) {
  const destination = normalizeWorkerMapDirectionsDestination(destinationLabel)
  const params = new URLSearchParams({
    api: '1',
    destination,
    dir_action: 'navigate',
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function normalizeWorkerMapDirectionsDestination(destinationLabel: string) {
  const fallback = destinationLabel.trim()
  const routeParts: string[] = []
  for (const part of fallback.split(',')) {
    const trimmed = part.trim()
    if (trimmed && !isFineGrainedAddressPart(trimmed)) routeParts.push(trimmed)
  }
  return routeParts.length >= 2 ? routeParts.join(', ') : fallback
}

export function isFineGrainedAddressPart(part: string) {
  const normalized = part
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(tang|lau|floor)\s+[a-z0-9-]+$/.test(normalized)) return true
  if (/^(phong|unit|apt)\s+[a-z0-9-]+$/.test(normalized)) return true
  if (/^(can ho|can|apartment)\s+[a-z0-9-]+$/.test(normalized)) return true
  return /^(can ho|can|apartment)\s+[a-z0-9-]+\s+[a-z0-9-]+$/.test(normalized) && /\d/.test(normalized)
}

export async function openWorkerMapDirections(destinationLabel: string, language: WorkerLanguageMode) {
  const destination = destinationLabel.trim()
  if (!destination) {
    Alert.alert(
      language === 'en' ? 'Address unavailable' : 'Chưa có địa chỉ',
      language === 'en'
        ? 'Kael has not released a specific address for directions yet.'
        : 'Kael chưa mở địa chỉ cụ thể để chỉ đường.',
    )
    return
  }

  try {
    await Linking.openURL(buildWorkerMapDirectionsUrl(destination))
  } catch {
    Alert.alert(
      language === 'en' ? 'Maps could not open' : 'Chưa mở được Maps',
      language === 'en'
        ? 'Try again after checking your Maps app or connection.'
        : 'Hãy thử lại sau khi kiểm tra ứng dụng Maps hoặc kết nối.',
    )
  }
}

export function workerHomeMapReducer(state: WorkerHomeMapState, action: WorkerHomeMapAction): WorkerHomeMapState {
  switch (action.type) {
    case 'close':
      return { ...state, expanded: false }
    case 'open':
      return { ...state, centered: false, expanded: true }
    case 'recenter':
      return { ...state, centered: true, compassNorth: true, zoom: 1 }
    case 'toggle_compass':
      return { ...state, compassNorth: !state.compassNorth }
    case 'toggle_layer':
      return { ...state, layerDetailed: !state.layerDetailed }
    case 'toggle_traffic':
      return { ...state, trafficEnabled: !state.trafficEnabled }
    case 'zoom_in':
      return { ...state, zoom: Math.min(1.28, Number((state.zoom + 0.14).toFixed(2))) }
    case 'zoom_out':
      return { ...state, zoom: Math.max(0.86, Number((state.zoom - 0.14).toFixed(2))) }
    default:
      return state
  }
}
