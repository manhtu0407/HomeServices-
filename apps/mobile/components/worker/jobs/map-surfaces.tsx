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
  workerV5LiveDistanceSignal,
  workerV5LiveEtaSignal,
} from '../ui/route'
import type { WorkerV5RoutePreview } from './use-worker-route-preview'
import { styles as stylesLight } from './map-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

function Text({ style, ...props }: TextProps) {
  const styles = useWorkerThemedStyles(stylesLight)
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
  const styles = useWorkerThemedStyles(stylesLight)
  const etaSignal = route
    ? workerV5LiveEtaSignal(route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = route
    ? workerV5LiveDistanceSignal(route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const etaMinuteValue = etaSignal.hasSignal ? workerV5EtaLensValue(etaSignal.label) : null
  const lensValue = etaMinuteValue ?? textByLanguage(language, 'Chờ', 'Wait')
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
        <Text style={styles.etaLensValue} testID="worker-v5-eta-lens-value">{lensValue}</Text>
        <Text style={styles.etaLensLabel} testID="worker-v5-eta-lens-label">
          {etaMinuteValue ? textByLanguage(language, 'phút', 'min') : textByLanguage(language, 'dữ liệu', 'data')}
        </Text>
      </View>
    </View>
  )
}
