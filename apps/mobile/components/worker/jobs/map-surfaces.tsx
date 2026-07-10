import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerZipMintAura,
} from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { routeDestinationLabel } from '../ui/labels'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5EtaLensValue,
} from '../ui/route'
import type { WorkerV5RoutePreview } from './use-worker-route-preview'
import { styles } from './map-styles'

const LIVE_DISTANCE_FORMATTERS = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }),
} as const

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5EtaSummaryCard({
  deal,
  language,
  reduceTransparency,
  route,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  route?: WorkerV5RoutePreview | null
}) {
  const etaSignal = route
    ? liveEtaSignal(route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = route
    ? liveDistanceSignal(route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const lensValue = etaSignal.hasSignal ? workerV5EtaLensValue(etaSignal.label) : '0'
  return (
    <View style={[styles.etaSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-eta-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="RouteEtaSummaryWide"
            style={styles.routeEtaSummaryAura}
            testID="worker-v5-route-eta-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="RouteEtaSummaryFine"
            style={styles.routeEtaSummaryZipAura}
            testID="worker-v5-route-eta-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.etaSummaryCopy}>
        <Text style={styles.etaLabel}>{textByLanguage(language, 'Thời gian đến dự kiến', 'Estimated arrival')}</Text>
        <Text style={styles.etaValue}>{etaSignal.label}</Text>
        <Text style={styles.etaMeta} numberOfLines={2}>{distanceSignal.hasSignal ? distanceSignal.meta : (deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có điểm đến', 'No destination'))}</Text>
      </View>
      <View style={styles.etaLens}>
        <Text style={styles.etaLensValue}>{lensValue}</Text>
        <Text style={styles.etaLensLabel}>{etaSignal.hasSignal ? textByLanguage(language, 'phút', 'min') : textByLanguage(language, 'chờ', 'wait')}</Text>
      </View>
    </View>
  )
}

function liveEtaSignal(route: WorkerV5RoutePreview, language: AppLanguage) {
  const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60))
  return {
    hasSignal: true,
    label: textByLanguage(language, `Di chuyển trong ${minutes} phút`, `Travel in ${minutes} min`),
  }
}

function liveDistanceSignal(route: WorkerV5RoutePreview, language: AppLanguage) {
  const kilometers = route.distanceMeters / 1000
  const label = kilometers >= 1
    ? `${LIVE_DISTANCE_FORMATTERS[language].format(kilometers)} km`
    : `${Math.max(1, Math.round(route.distanceMeters))} m`
  return {
    hasSignal: true,
    meta: textByLanguage(language, `Quãng đường thật · ${label}`, `Real route distance · ${label}`),
  }
}
