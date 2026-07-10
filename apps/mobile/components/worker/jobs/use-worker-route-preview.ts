import { useEffect, useMemo, useRef, useState } from 'react'
import * as Location from 'expo-location'
import type { LocalDeal } from '@nestscout/shared'

import { mobileApiUrl } from '@/lib/api'
import { workerRouteService } from '@/lib/services'

export type WorkerV5RoutePreview = {
  distanceMeters: number
  durationSeconds: number
}

export type WorkerV5RoutePreviewState = {
  hasRouteDestination: boolean
  mapUri: string | null
  origin: { latitude: number; longitude: number } | null
  route: WorkerV5RoutePreview | null
  locationStatus: 'loading' | 'ready' | 'denied' | 'unavailable'
}

const ROUTE_REFRESH_DISTANCE_METERS = 80

export function useWorkerV5RoutePreview(deal: LocalDeal | null, enabled: boolean): WorkerV5RoutePreviewState {
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  const hasRouteDestination = Boolean(
    jobId && deal?.broadcast?.addressAccess?.release_stage !== 'area_only',
  )
  const [origin, setOrigin] = useState<WorkerV5RoutePreviewState['origin']>(null)
  const [route, setRoute] = useState<WorkerV5RoutePreview | null>(null)
  const [locationStatus, setLocationStatus] = useState<WorkerV5RoutePreviewState['locationStatus']>('loading')
  const previousOriginRef = useRef<WorkerV5RoutePreviewState['origin']>(null)

  useEffect(() => {
    if (!enabled || !hasRouteDestination || !jobId) {
      previousOriginRef.current = null
      setOrigin(null)
      setRoute(null)
      setLocationStatus('unavailable')
      return
    }

    let cancelled = false
    let subscription: Location.LocationSubscription | null = null
    previousOriginRef.current = null
    const updateOrigin = (next: WorkerV5RoutePreviewState['origin']) => {
      if (!next || cancelled) return
      if (previousOriginRef.current && distanceMeters(previousOriginRef.current, next) < ROUTE_REFRESH_DISTANCE_METERS) return
      previousOriginRef.current = next
      setOrigin(next)
      setLocationStatus('ready')
    }

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      if (!permission.granted) {
        setLocationStatus('denied')
        return
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      updateOrigin({ latitude: current.coords.latitude, longitude: current.coords.longitude })
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: ROUTE_REFRESH_DISTANCE_METERS,
          timeInterval: 30_000,
        },
        (next) => updateOrigin({ latitude: next.coords.latitude, longitude: next.coords.longitude }),
      )
    })().catch(() => {
      if (!cancelled) setLocationStatus('unavailable')
    })

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [enabled, hasRouteDestination, jobId])

  useEffect(() => {
    if (!enabled || !jobId || !origin) {
      setRoute(null)
      return
    }
    let cancelled = false
    setRoute(null)
    void workerRouteService.getPreview(jobId, origin).then((result) => {
      if (cancelled || !result.success) return
      setRoute({
        distanceMeters: result.data.distance_meters,
        durationSeconds: result.data.duration_seconds,
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, jobId, origin?.latitude, origin?.longitude])

  const mapUri = useMemo(() => {
    if (!enabled || !hasRouteDestination || !jobId || !origin) return null
    const query = `?origin_lat=${encodeURIComponent(origin.latitude.toFixed(6))}&origin_lng=${encodeURIComponent(origin.longitude.toFixed(6))}`
    return mobileApiUrl(`/workers/me/jobs/${encodeURIComponent(jobId)}/route-map${query}`)
  }, [enabled, hasRouteDestination, jobId, origin?.latitude, origin?.longitude])

  return { hasRouteDestination, locationStatus, mapUri, origin, route }
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
