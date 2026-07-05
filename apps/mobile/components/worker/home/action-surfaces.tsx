import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect } from 'react-native-svg'

import { MintAura } from '@/components/ui/kael-primitives'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'

import type { WorkerV5IconName, WorkerV5ScreenId } from '../dock/types'
import { styles } from './action-styles'

type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5HomeQuickActionItem = {
  icon: WorkerV5IconName
  meta: string
  targetId: WorkerV5ScreenId
  title: string
}

type WorkerV5QuickActionItem = {
  icon: WorkerV5IconName
  meta: string
  title: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function WorkerV5HomeQuickCardAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeQuickCardAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 170 76" width="100%">
        <Defs>
          <RadialGradient id={`${testID}-corner`} cx="88%" cy="8%" r="62%">
            <Stop offset="0" stopColor="rgba(88,232,211,0.34)" />
            <Stop offset="0.48" stopColor="rgba(153,246,232,0.12)" />
            <Stop offset="0.82" stopColor="rgba(153,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`${testID}-base`} cx="18%" cy="88%" r="72%">
            <Stop offset="0" stopColor="rgba(116,230,216,0.18)" />
            <Stop offset="0.72" stopColor="rgba(116,230,216,0)" />
          </RadialGradient>
          <LinearGradient id={`${testID}-edge`} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.58)" />
            <Stop offset="0.46" stopColor="rgba(122,238,224,0.16)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${testID}-corner)`} height="76" width="170" />
        <Rect fill={`url(#${testID}-base)`} height="76" width="170" />
        <Rect fill={`url(#${testID}-edge)`} height="76" width="170" />
      </Svg>
    </View>
  )
}

export function WorkerV5KaelBriefCard({
  auraScope,
  body,
  caseWideAura: CaseWideAura,
  icon,
  icons,
  reduceTransparency,
  source,
  title,
  zipAura: ZipAura,
}: {
  auraScope?: string
  body?: string
  caseWideAura?: WorkerV5CaseAuraComponent
  icon: WorkerV5IconName
  icons: WorkerV5IconMap
  reduceTransparency: boolean
  source?: ImageSourcePropType
  title: string
  zipAura?: WorkerV5CaseAuraComponent
}) {
  return (
    <View style={[styles.kaelBriefCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-brief-card">
      {auraScope && CaseWideAura && ZipAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope={`${auraScope}Wide`} style={styles.kaelBriefAura} />
          <ZipAura scope={`${auraScope}Fine`} style={styles.kaelBriefZipAura} />
        </>
      ) : null}
      <View style={styles.kaelBriefIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={source ?? icons[icon]} style={styles.kaelBriefIcon} />
      </View>
      <View style={styles.kaelBriefText}>
        <Text style={styles.kaelBriefTitle}>{title}</Text>
        {body ? <Text style={styles.kaelBriefBody}>{body}</Text> : null}
      </View>
      <Text style={styles.kaelBriefChevron}>{'\u203a'}</Text>
    </View>
  )
}

export function WorkerV5HomeQuickActionGrid({
  icons,
  items,
  onOpen,
  reduceMotion,
  reduceTransparency,
}: {
  icons: WorkerV5IconMap
  items: ReadonlyArray<WorkerV5HomeQuickActionItem>
  onOpen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.meta}`}
          key={`${item.icon}-${item.title}`}
          onPress={() => onOpen(item.targetId)}
          style={({ pressed }) => [
            styles.quickActionCard,
            styles.homeQuickActionCard,
            reduceTransparency && styles.opaqueCard,
            pressed && !reduceMotion ? styles.pressed : null,
          ]}
          testID={`worker-v5-quick-action-${index}`}
        >
          {!reduceTransparency ? <WorkerV5HomeQuickCardAura testID={`worker-v5-quick-action-mint-aura-${index}`} /> : null}
          <View style={styles.quickActionIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={icons[item.icon]} style={styles.quickActionIcon} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

export function WorkerV5QuickActionGrid({
  icons,
  items,
  reduceTransparency,
}: {
  icons: WorkerV5IconMap
  items: ReadonlyArray<WorkerV5QuickActionItem>
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <View key={`${item.icon}-${item.title}`} style={[styles.quickActionCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-quick-action-${index}`}>
          <View style={styles.quickActionIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={icons[item.icon]} style={styles.quickActionIcon} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
