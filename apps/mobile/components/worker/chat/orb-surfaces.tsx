import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import Svg, { Circle, Rect } from 'react-native-svg'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'

import type { WorkerV5ScreenId } from '../dock/types'
import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5SourceCardSkin,
} from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { buildWorkerV5RouteDistanceSignal, workerV5KaelOpportunityMatchScore } from '../ui/route'
import { styles } from './orb-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelOrbBubble({
  align,
  body,
  role,
  strongFirstLine = false,
}: {
  align?: 'right'
  body?: string
  role: string
  strongFirstLine?: boolean
}) {
  return (
    <View
      accessibilityLabel={role}
      style={[styles.kaelOrbBubble, align === 'right' ? styles.kaelOrbBubbleRight : styles.kaelOrbBubbleLeft]}
      testID={`worker-v5-kael-bubble-${align === 'right' ? 'worker' : 'kael'}`}
    >
      <Text
        style={[
          styles.kaelOrbBubbleText,
          align === 'right' ? styles.kaelOrbBubbleTextRight : null,
          strongFirstLine ? styles.kaelOrbBubbleTextStrong : null,
        ]}
      >
        {body}
      </Text>
    </View>
  )
}

export function WorkerV5KaelOrbCameraIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={20}
      style={styles.kaelOrbComposerCameraIcon}
      testID="worker-v5-kael-orb-camera-icon"
      viewBox="0 0 24 24"
      width={20}
    >
      <Rect height={15.5} rx={5.2} stroke={strokeColor} strokeWidth={2} width={17.5} x={3.25} y={5.25} />
      <Circle cx={12} cy={13} r={3.8} stroke={strokeColor} strokeWidth={2} />
      <Circle cx={17.35} cy={9.4} fill={strokeColor} r={1.35} />
    </Svg>
  )
}

export function WorkerV5KaelOrbMediaStrip({
  count,
  reduceTransparency,
}: {
  count: number
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.kaelOrbMediaStrip} testID="worker-v5-kael-media-strip">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.kaelOrbMediaThumb, index % 2 === 0 ? styles.kaelOrbMediaThumbSoft : styles.kaelOrbMediaThumbDark]} testID={`worker-v5-kael-media-thumb-${index}`}>
          {!reduceTransparency && index % 2 === 0 ? <WorkerV5CustomerZipMintAura scope={`KaelMediaThumb${index}`} style={styles.kaelOrbMediaAura} /> : null}
          <View style={styles.kaelOrbMediaLine} />
        </View>
      ))}
    </View>
  )
}

export function WorkerV5KaelOrbQuickChips({
  chips,
  onNavigate,
}: {
  chips: readonly { label: string; target: WorkerV5ScreenId | null }[]
  onNavigate: (id: WorkerV5ScreenId) => void
}) {
  return (
    <View style={styles.kaelOrbQuickChips} testID="worker-v5-kael-quick-chips">
      {chips.map((chip, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !chip.target }}
          disabled={!chip.target}
          key={`${chip.label}-${index}`}
          onPress={() => {
            if (chip.target) onNavigate(chip.target)
          }}
          style={({ pressed }) => [
            styles.kaelOrbQuickChip,
            index === 0 ? styles.kaelOrbQuickChipSelected : null,
            !chip.target ? styles.kaelOrbQuickChipDisabled : null,
            pressed && chip.target ? styles.pressed : null,
          ]}
          testID={`worker-v5-kael-quick-chip-${index}`}
        >
          <Text style={[styles.kaelOrbQuickChipText, index === 0 ? styles.kaelOrbQuickChipTextSelected : null]} numberOfLines={1}>{chip.label}</Text>
        </Pressable>
      ))}
    </View>
  )
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
    workerV5TimeChoiceLabel(deal.draft.timeChoice, language),
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
      <View style={[styles.kaelOrbOpportunityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-orb-opportunity-card">
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
