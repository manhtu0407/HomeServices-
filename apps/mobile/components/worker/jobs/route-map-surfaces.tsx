import { useEffect, useState } from 'react'
import { Platform, Text as RNText, View, type TextProps } from 'react-native'
import { type LocalDeal } from '@nestscout/shared'
import { Image } from 'expo-image'
import { getMobileApiAuthHeaders } from '@/lib/api'
import { type AppLanguage } from '@/lib/app-language'
import { workerRouteService } from '@/lib/services'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerMapMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5ArrivalDestinationLabel } from '../ui/route'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5StatusTimeline as WorkerV5StatusTimelineSurface, type WorkerV5StatusTimelineBaseProps } from './timeline-surfaces'
import { type WorkerV5RoutePreviewState } from './use-worker-route-preview'
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5RouteMapStage({
  deal,
  language,
  reduceTransparency,
  routePreview,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}) {
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const originLabel = routePreview.locationStatus === 'ready'
    ? textByLanguage(language, 'Vị trí của bạn đang được cập nhật', 'Your position is updating')
    : routePreview.locationStatus === 'denied'
      ? textByLanguage(language, 'Không có vị trí hiện tại để tính quãng đường và thời gian đến', 'Current location is unavailable for distance and ETA')
      : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your position')

  return (
    <View style={[styles.mapPanel, reduceTransparency && styles.opaqueCard]} testID="worker-v5-route-map-panel">
      {!reduceTransparency ? (
        <WorkerV5CustomerMapMintAura
          scope="RouteEtaMapPanel"
          style={styles.routeMapPanelAura}
          testID="worker-v5-route-map-mint-aura"
        />
      ) : null}
      {routePreview.mapUri ? (
        <WorkerV5AuthenticatedRouteMapPreview
          label={destinationLabel}
          language={language}
          uri={routePreview.mapUri}
        />
      ) : (
        <View style={styles.mapUnavailable} testID="worker-v5-route-vietmap-empty-state">
          <Text style={styles.mapUnavailableTitle}>
            {!routePreview.hasRouteDestination
              ? textByLanguage(language, 'Địa chỉ chưa được mở cho lộ trình', 'The route address is not available yet')
              : routePreview.locationStatus === 'denied'
                ? textByLanguage(language, 'Không có vị trí hiện tại để mở bản đồ', 'Current location is unavailable for the map')
                : routePreview.locationStatus === 'unavailable'
                  ? textByLanguage(language, 'Chưa thể lấy vị trí hiện tại', 'Current location is unavailable')
                  : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your current location')}
          </Text>
          <Text style={styles.mapUnavailableMeta}>
            {routePreview.hasRouteDestination
              ? textByLanguage(language, 'Tuyến đường chỉ dùng tọa độ tòa nhà; số căn và tầng vẫn được bảo vệ.', 'The route uses the building location only; unit and floor remain protected.')
              : textByLanguage(language, 'Bản đồ chỉ hiện khi backend đã mở điểm đến tòa nhà cho thợ.', 'The map appears only after the backend releases the building destination to the worker.')}
          </Text>
        </View>
      )}
      {routePreview.mapUri ? (
        <View style={styles.routeMapCaption} testID="worker-v5-route-map-caption">
          <Text numberOfLines={1} style={styles.routeMapCaptionTitle}>{originLabel}</Text>
          <Text numberOfLines={2} style={styles.routeMapCaptionMeta}>{destinationLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function WorkerV5AuthenticatedRouteMapPreview({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  return <WorkerV5AuthenticatedRouteMapImage key={uri} label={label} language={language} uri={uri} />
}

function WorkerV5AuthenticatedRouteMapImage({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
  const [webUri, setWebUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMobileApiAuthHeaders()
      .then((nextHeaders) => {
        if (cancelled) return
        const imageHeaders = { ...nextHeaders }
        delete imageHeaders['Content-Type']
        setHeaders(imageHeaders)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  useEffect(() => {
    if (Platform.OS !== 'web' || !headers) return
    let cancelled = false
    let objectUri: string | null = null
    void workerRouteService.getMapImage(uri, headers).then((blob) => {
      objectUri = URL.createObjectURL(blob)
      if (!cancelled) setWebUri(objectUri)
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      if (objectUri) URL.revokeObjectURL(objectUri)
    }
  }, [headers, uri])

  if (failed) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-route-map-image-error">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Chưa thể tải bản đồ tuyến đường', 'Route map is unavailable')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  if (!headers || (Platform.OS === 'web' && !webUri)) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-route-map-image-loading">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Đang tải bản đồ tuyến đường', 'Loading route map')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={textByLanguage(language, `Bản đồ tuyến đường đến ${label}`, `Route map to ${label}`)}
      onError={() => setFailed(true)}
      contentFit="cover"
      source={Platform.OS === 'web' ? { uri: webUri! } : { headers, uri }}
      style={styles.mapStaticImage}
      testID="worker-v5-route-map-live-image"
    />
  )
}

export function WorkerV5StatusTimeline(props: WorkerV5StatusTimelineBaseProps) {
  return (
    <WorkerV5StatusTimelineSurface
      {...props}
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
}

