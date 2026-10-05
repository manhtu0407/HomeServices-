import { Text as RNText, View, type TextProps } from 'react-native'
import { type LocalDeal } from '@nestscout/shared'
import { mobileApiUrl , getMobileApiAuthHeaders } from '@/lib/api'
import { type AppLanguage } from '@/lib/app-language'
import { WorkerV5CustomerMapMintAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { formatWorkerDistrict } from '../ui/labels'
import { type WorkerV5MapLocation } from '../ui/route'
import { styles } from '../worker-v5-flow-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { Image } from 'expo-image'

import { useEffect, useState } from 'react'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5MapStage({
  activeLocation,
  deal,
  language,
  profile,
  reduceTransparency,
  selectedLabel,
  testID,
}: {
  activeLocation: WorkerV5MapLocation | null
  deal: LocalDeal | null
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
  selectedLabel: string | null
  testID: string
}) {
  const opaqueCard = useWorkerThemedStyles(styles).opaqueCard
  const districts = profile?.districts?.slice(0, 2) ?? []
  const mapLabel = selectedLabel ??
    deal?.broadcast?.generalArea ??
    deal?.draft.districtLabel ??
    (districts[0] ? formatWorkerDistrict(districts[0], language) : null)

  return (
    <View style={[styles.mapPanel, reduceTransparency && opaqueCard]} testID={testID}>
      {!reduceTransparency ? <WorkerV5CustomerMapMintAura scope="DemandMapPanel" style={styles.demandMapPanelAura} testID="worker-v5-demand-map-mint-aura" /> : null}
      {activeLocation ? (
        <WorkerV5VietMapStaticPreview
          label={mapLabel ?? textByLanguage(language, 'Vị trí đã đồng bộ', 'Synced location')}
          language={language}
          location={activeLocation}
        />
      ) : (
        <View style={styles.mapUnavailable} testID="worker-v5-vietmap-empty-state">
          <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Chưa có tọa độ VietMap thật', 'No real VietMap coordinates yet')}</Text>
          <Text style={styles.mapUnavailableMeta}>
            {textByLanguage(
              language,
              'Bản đồ chỉ hiện khi hồ sơ thợ, cơ hội thật hoặc kết quả tìm kiếm có tọa độ đã xác thực.',
              'The map renders only when the worker profile, real opportunity, or search result has verified coordinates.',
            )}
          </Text>
        </View>
      )}
    </View>
  )
}

function WorkerV5VietMapStaticPreview({
  label,
  language,
  location,
}: {
  label: string
  language: AppLanguage
  location: WorkerV5MapLocation
}) {
  const uri = mobileApiUrl(`/maps/vietmap/static?lat=${encodeURIComponent(location.lat.toFixed(6))}&lng=${encodeURIComponent(location.lng.toFixed(6))}&zoom=13`)
  return <WorkerV5VietMapStaticImage key={uri} label={label} language={language} uri={uri} />
}

function WorkerV5VietMapStaticImage({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
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

  if (failed) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-vietmap-image-error">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'VietMap chưa trả ảnh bản đồ', 'VietMap map image unavailable')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  if (!headers) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-vietmap-image-loading">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Đang chuẩn bị VietMap', 'Preparing VietMap')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={textByLanguage(language, `Bản đồ VietMap cho ${label}`, `VietMap for ${label}`)}
      onError={() => setFailed(true)}
      contentFit="cover"
      source={{ headers, uri }}
      style={styles.mapStaticImage}
      testID="worker-v5-vietmap-static-image"
    />
  )
}

