import { useEffect, useMemo, useRef, useState } from 'react'
import * as Location from 'expo-location'
import type { LocalDeal } from '@nestscout/shared'

import { mobileApiUrl } from '@/lib/api'
import { decodeGooglePolyline5, type WorkerRouteGeometry } from '@/lib/route-geometry'
import { workerRouteService } from '@/lib/services'

export type WorkerV5RoutePreview = {
  distanceMeters: number
  durationSeconds: number
  destination: { latitude: number; longitude: number } | null
  geometry: WorkerRouteGeometry | null
  fetchedAt: string
}

export type WorkerV5RoutePreviewState = {
  hasRouteDestination: boolean
  mapUri: string | null
  origin: { latitude: number; longitude: number } | null
  route: WorkerV5RoutePreview | null
  locationStatus: 'loading' | 'ready' | 'denied' | 'unavailable'
}

const ROUTE_REFRESH_DISTANCE_METERS = 80

type LocationSnapshot = {
  key: string
  origin: WorkerV5RoutePreviewState['origin']
  status: Exclude<WorkerV5RoutePreviewState['locationStatus'], 'loading'>
}

type RouteSnapshot = {
  key: string
  route: WorkerV5RoutePreview
}

export function useWorkerV5RoutePreview(deal: LocalDeal | null, enabled: boolean): WorkerV5RoutePreviewState {
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  const hasRouteDestination = Boolean(
    jobId && deal?.broadcast?.addressAccess?.release_stage !== 'area_only',
  )
  const lifecycleKey = useRouteLifecycleKey(enabled && hasRouteDestination ? jobId : null)
  const [locationSnapshot, setLocationSnapshot] = useState<LocationSnapshot | null>(null)
  const [routeSnapshot, setRouteSnapshot] = useState<RouteSnapshot | null>(null)
  const previousOriginRef = useRef<WorkerV5RoutePreviewState['origin']>(null)
  const origin = lifecycleKey && locationSnapshot?.key === lifecycleKey
    ? locationSnapshot.origin
    : null
  const locationStatus: WorkerV5RoutePreviewState['locationStatus'] = !lifecycleKey
    ? 'unavailable'
    : locationSnapshot?.key === lifecycleKey
      ? locationSnapshot.status
      : 'loading'
  const routeKey = lifecycleKey && jobId && origin
    ? `${lifecycleKey}:${origin.latitude.toFixed(6)}:${origin.longitude.toFixed(6)}`
    : null
  const route = routeKey && routeSnapshot?.key === routeKey ? routeSnapshot.route : null

  useEffect(() => {
    if (!lifecycleKey || !jobId) {
      previousOriginRef.current = null
      return
    }

    let cancelled = false
    let subscription: Location.LocationSubscription | null = null
    previousOriginRef.current = null
    const updateOrigin = (next: WorkerV5RoutePreviewState['origin']) => {
      if (!next || cancelled) return
      if (previousOriginRef.current && distanceMeters(previousOriginRef.current, next) < ROUTE_REFRESH_DISTANCE_METERS) return
      previousOriginRef.current = next
      setLocationSnapshot({ key: lifecycleKey, origin: next, status: 'ready' })
    }

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      if (!permission.granted) {
        setLocationSnapshot({ key: lifecycleKey, origin: null, status: 'denied' })
        return
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      updateOrigin({ latitude: current.coords.latitude, longitude: current.coords.longitude })
      const nextSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: ROUTE_REFRESH_DISTANCE_METERS,
          timeInterval: 30_000,
        },
        (next) => updateOrigin({ latitude: next.coords.latitude, longitude: next.coords.longitude }),
      )
      if (cancelled) nextSubscription.remove()
      else subscription = nextSubscription
    })().catch(() => {
      if (!cancelled) {
        setLocationSnapshot({ key: lifecycleKey, origin: null, status: 'unavailable' })
      }
    })

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [jobId, lifecycleKey])

  useEffect(() => {
    if (!jobId || !origin || !routeKey) return
    let cancelled = false
    void workerRouteService.getPreview(jobId, origin)
      .then((result) => {
        if (cancelled || !result.success) return
        setRouteSnapshot({
          key: routeKey,
          route: {
            distanceMeters: result.data.distance_meters,
            durationSeconds: result.data.duration_seconds,
            destination: result.data.destination,
            geometry: decodeGooglePolyline5(result.data.encoded_polyline),
            fetchedAt: result.data.fetched_at,
          },
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [jobId, origin, routeKey])

  const mapUri = useMemo(() => {
    if (!enabled || !hasRouteDestination || !jobId || !origin) return null
    const query = `?origin_lat=${encodeURIComponent(origin.latitude.toFixed(6))}&origin_lng=${encodeURIComponent(origin.longitude.toFixed(6))}`
    return mobileApiUrl(`/workers/me/jobs/${encodeURIComponent(jobId)}/route-map${query}`)
  }, [enabled, hasRouteDestination, jobId, origin])

  return { hasRouteDestination, locationStatus, mapUri, origin, route }
}

function useRouteLifecycleKey(descriptor: string | null) {
  const [lifecycle, setLifecycle] = useState(() => ({ descriptor, version: 0 }))
  if (lifecycle.descriptor === descriptor) {
    return descriptor ? `${descriptor}:${lifecycle.version}` : null
  }
  const next = { descriptor, version: lifecycle.version + 1 }
  setLifecycle(next)
  return descriptor ? `${descriptor}:${next.version}` : null
}

function distanceMeters(
  origin: NonNullable<WorkerV5RoutePreviewState['origin']>,
  destination: NonNullable<WorkerV5RoutePreviewState['origin']>,
) {
  const latitudeRadians = Math.PI / 180
  const deltaLatitude = (destination.latitude - origin.latitude) * latitudeRadians
  const deltaLongitude = (destination.longitude - origin.longitude) * latitudeRadians
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(origin.latitude * latitudeRadians) * Math.cos(destination.latitude * latitudeRadians) * Math.sin(deltaLongitude / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
