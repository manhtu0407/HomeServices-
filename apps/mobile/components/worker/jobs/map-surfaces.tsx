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
import { styles } from './map-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5EtaSummaryCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = buildWorkerV5RouteDistanceSignal(deal, language)
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
