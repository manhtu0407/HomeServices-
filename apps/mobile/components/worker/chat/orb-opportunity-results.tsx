import { Image } from 'expo-image'
import { Pressable, Text as RNText, View, type ImageSourcePropType, type TextProps } from 'react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5SourceCardSkin,
} from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { buildWorkerV5RouteDistanceSignal, workerV5KaelOpportunityMatchScore } from '../ui/route'
import { styles } from './orb-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelOrbOpportunityResults({
  deal,
  fallbackJobIcon,
  language,
  onOpenOpportunity,
  reduceTransparency,
  serviceIcons,
}: {
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  const opaqueCard = useWorkerThemedStyles(styles).opaqueCard
  if (!deal?.broadcast) {
    return null
  }

  const serviceLabel = localizedServiceLabel(deal.broadcast.serviceType ?? deal.draft.serviceType, language)
  const area = deal.broadcast.generalArea || deal.draft.districtLabel || null
  const distance = buildWorkerV5RouteDistanceSignal(deal, language)
  const matchScore = workerV5KaelOpportunityMatchScore(deal)
  const title = matchScore == null ? serviceLabel : `${serviceLabel} · ${matchScore}%`
  const metaParts = [
    area,
    workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt),
    distance.hasSignal ? distance.label : null,
  ].filter(Boolean)
  const meta = metaParts.length > 0
    ? metaParts.join(' · ')
    : textByLanguage(language, 'Dữ liệu thật đang đồng bộ', 'Real data is syncing')
  const earning = deal.broadcast.estimatedEarningLabel?.trim() || textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const openLabel = deal.status === 'broadcasting' && deal.broadcast.status === 'sent'
    ? textByLanguage(language, 'Xem & nhận', 'Review')
    : textByLanguage(language, 'Tiếp tục', 'Continue')

  return (
    <View style={styles.kaelOrbOpportunityList} testID="worker-v5-kael-orb-opportunities">
      <View style={[styles.kaelOrbOpportunityCard, reduceTransparency && opaqueCard]} testID="worker-v5-kael-orb-opportunity-card">
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-kael-orb-opportunity-skin" />
            <WorkerV5CustomerCaseWideMintAura scope="KaelOrbOpportunityWide" style={styles.kaelOrbCardAura} testID="worker-v5-kael-orb-opportunity-mint-aura" />
            <WorkerV5CustomerZipMintAura scope="KaelOrbOpportunityFine" style={styles.kaelOrbCardZipAura} testID="worker-v5-kael-orb-opportunity-zip-mint-aura" />
          </>
        ) : null}
        <View style={styles.kaelOrbOpportunityIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image source={serviceIcons[deal.broadcast.serviceType] ?? fallbackJobIcon} style={styles.kaelOrbOpportunityIcon} />
        </View>
        <View style={styles.kaelOrbOpportunityCopy}>
          <Text style={styles.kaelOrbOpportunityTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.kaelOrbOpportunityMeta} numberOfLines={2}>{meta}</Text>
        </View>
        <View style={styles.kaelOrbOpportunityAside}>
          <Text style={styles.kaelOrbOpportunityPayout} numberOfLines={2}>{earning}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textByLanguage(language, 'Mở cơ hội thật', 'Open real opportunity')}
            onPress={onOpenOpportunity}
            style={({ pressed }) => [styles.kaelOrbOpenButton, pressed ? styles.pressed : null]}
            testID="worker-v5-kael-orb-open-opportunity"
          >
            <Text style={styles.kaelOrbOpenButtonText}>{openLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
