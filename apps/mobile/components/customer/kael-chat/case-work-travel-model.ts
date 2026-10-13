import type { LocalWorkerTravel } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

// A position older than this no longer says where the worker is, so the arrival time is withheld.
export const TRAVEL_STALE_SECONDS = 180

const EARTH_RADIUS_METERS = 6_371_000
const SHORT_CLOCK = {
  en: new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, minute: '2-digit' }),
  vi: new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', hour12: false, minute: '2-digit' }),
} satisfies Record<AppLanguage, Intl.DateTimeFormat>

type LatLng = readonly [number, number]
export type TravelPoint = { x: number; y: number }
export type TravelInsets = { bottom: number; left: number; right: number; top: number }

export type TravelProjection = {
  destination: TravelPoint
  origin: TravelPoint
  remainingPath: TravelPoint[]
  traveledPath: TravelPoint[]
  worker: TravelPoint
}

export type TravelReadout = {
  ageSeconds: number
  arrivalClock: string | null
  birdMeters: number
  minutesLeft: number
  progress: number
  remainingMeters: number
  stale: boolean
  totalMeters: number
  traveledMeters: number
}

export function haversineMeters(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function formatTravelDistance(meters: number, language: AppLanguage) {
  if (meters < 1000) return `${Math.max(0, Math.round(meters / 10) * 10)} m`
  const km = (meters / 1000).toFixed(1)
  return `${language === 'vi' ? km.replace('.', ',') : km} km`
}

export function formatTravelAge(ageSeconds: number, language: AppLanguage) {
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 1) return language === 'vi' ? 'vừa xong' : 'just now'
  return language === 'vi' ? `${minutes} phút trước` : `${minutes} min ago`
}

// g + h from the path search, read for a customer: what the worker has covered, what is left on the
// road, and the straight line to the building. Everything comes from the reported position, so a
// stale report says so instead of quoting an arrival time.
export function buildTravelReadout(travel: LocalWorkerTravel, now: number, language: AppLanguage): TravelReadout {
  const reportedAt = Date.parse(travel.updatedAt)
  const ageSeconds = Number.isFinite(reportedAt) ? Math.max(0, Math.round((now - reportedAt) / 1000)) : Number.POSITIVE_INFINITY
  const stale = ageSeconds > TRAVEL_STALE_SECONDS
  const destination = travel.route[travel.route.length - 1]
  const traveledMeters = Math.max(0, travel.totalMeters - travel.remainingMeters)
  return {
    ageSeconds,
    arrivalClock: stale ? null : SHORT_CLOCK[language].format(new Date(reportedAt + travel.remainingSeconds * 1000)),
    birdMeters: haversineMeters(travel.position, destination),
    minutesLeft: Math.max(1, Math.ceil(travel.remainingSeconds / 60)),
    progress: travel.totalMeters > 0 ? Math.min(1, traveledMeters / travel.totalMeters) : 0,
    remainingMeters: travel.remainingMeters,
    stale,
    totalMeters: travel.totalMeters,
    traveledMeters,
  }
}

// Fits the route and the worker into a width x height box, keeping the real proportions, and cuts
// the route at the vertex nearest the worker into the part already driven and the part still ahead.
export function projectTravel(travel: LocalWorkerTravel, width: number, height: number, padding: number | TravelInsets): TravelProjection {
  const inset = typeof padding === 'number' ? { bottom: padding, left: padding, right: padding, top: padding } : padding
  const all: LatLng[] = [...travel.route, travel.position]
  const lat0 = all.reduce((sum, point) => sum + point[0], 0) / all.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const flat = all.map((point) => ({ x: point[1] * kx, y: -point[0] }))
  const minX = Math.min(...flat.map((p) => p.x))
  const maxX = Math.max(...flat.map((p) => p.x))
  const minY = Math.min(...flat.map((p) => p.y))
  const maxY = Math.max(...flat.map((p) => p.y))
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const innerWidth = Math.max(1, width - inset.left - inset.right)
  const innerHeight = Math.max(1, height - inset.top - inset.bottom)
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY)
  const offsetX = inset.left + (innerWidth - spanX * scale) / 2
  const offsetY = inset.top + (innerHeight - spanY * scale) / 2
  const place = (point: { x: number; y: number }): TravelPoint => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  })
  const route = flat.slice(0, travel.route.length).map(place)
  const worker = place(flat[flat.length - 1])

  let nearest = 0
  let nearestGap = Number.POSITIVE_INFINITY
  route.forEach((point, index) => {
    const gap = (point.x - worker.x) ** 2 + (point.y - worker.y) ** 2
    if (gap < nearestGap) {
      nearest = index
      nearestGap = gap
    }
  })
  return {
    destination: route[route.length - 1],
    origin: route[0],
    remainingPath: [worker, ...route.slice(nearest + 1)],
    traveledPath: [...route.slice(0, nearest + 1), worker],
    worker,
  }
}

export function pathData(points: TravelPoint[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

// The points as a smooth curve (Catmull-Rom through every point), so a route made of straight legs reads as a
// road. One point is nothing to draw, two are a straight line.
export function smoothPathData(points: TravelPoint[]) {
  if (points.length === 0) return ''
  const fmt = (value: number) => value.toFixed(1)
  const head = `M${fmt(points[0].x)} ${fmt(points[0].y)}`
  if (points.length < 3) return points.slice(1).reduce((path, point) => `${path} L${fmt(point.x)} ${fmt(point.y)}`, head)
  let path = head
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)]
    const from = points[index]
    const to = points[index + 1]
    const after = points[Math.min(points.length - 1, index + 2)]
    path += ` C${fmt(from.x + (to.x - before.x) / 6)} ${fmt(from.y + (to.y - before.y) / 6)} ${fmt(to.x - (after.x - from.x) / 6)} ${fmt(to.y - (after.y - from.y) / 6)} ${fmt(to.x)} ${fmt(to.y)}`
  }
  return path
}
