import type { ComponentType, ReactNode } from 'react'
import { Image } from 'expo-image'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect } from 'react-native-svg'

import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { isKaelCoreV9Visual, type CustomerV21Visual } from './assets'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import {
  customerV21CaseScopeStateDotSurface,
  customerV21CaseScopeStepRowSurface,
  customerV21HistoryStyles as styles,
  customerV21TimelineDotSurface,
} from './history-styles'

type CustomerV21TimelineState = 'done' | 'active' | 'pending'
type FulfillmentStepState = 'active' | 'done' | 'pending'
type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21ZipAura = ComponentType<{ scope: string; testID?: string }>
type CustomerV21AssetTile = ComponentType<{
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type CustomerV21Card = ComponentType<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type CustomerV21CaseAura = ComponentType<{ scope: string; testID?: string }>
type CustomerV21HandoffChip = ComponentType<{
  label: string
  tone: 'selected' | 'success'
}>

export function CaseMetric({
  auraScope,
  label,
  sourceCardSkin: SourceCardSkin,
  testID,
  tokens,
  value,
  zipMintAura: ZipMintAura,
}: {
  auraScope?: string
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  testID?: string
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={[styles.metric, { backgroundColor: tokens.ghost, borderColor: tokens.border }, auraScope ? styles.metricAura : null]} testID={testID}>
      {auraScope ? (
        <>
          <SourceCardSkin testID={`${testID ?? auraScope}-skin`} />
          <ZipMintAura scope={auraScope} testID={`${testID ?? auraScope}-mint-aura`} />
        </>
      ) : null}
      <View style={styles.metricContent}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.metricValue, { color: tokens.text }]}>{value}</Text>
        <Text numberOfLines={2} style={[styles.metricLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

export function CaseFactGrid({
  metrics,
  sourceCardSkin,
  tokens,
  zipMintAura,
}: {
  metrics: {
    auraScope: string
    label: string
    testID: string
    value: string
  }[]
  sourceCardSkin: CustomerV21SourceSkin
  tokens: CustomerThemeTokens
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={styles.factGrid}>
      {metrics.map((metric) => (
        <CaseMetric
          auraScope={metric.auraScope}
          key={metric.testID}
          label={metric.label}
          sourceCardSkin={sourceCardSkin}
          testID={metric.testID}
          tokens={tokens}
          value={metric.value}
          zipMintAura={zipMintAura}
        />
      ))}
    </View>
  )
}

export function CustomerStatusPill({
  label,
  tokens,
}: {
  label: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.statusPill, { backgroundColor: tokens.service }]}>
      <Text numberOfLines={1} style={[styles.statusText, { color: tokens.primary }]}>{label}</Text>
    </View>
  )
}

export function CaseMiniStat({
  label,
  sourceCardSkin: SourceCardSkin,
  tokens,
  value,
  zipMintAura: ZipMintAura,
}: {
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={[styles.caseMiniStat, { backgroundColor: 'rgba(255,255,255,0.91)', borderColor: 'rgba(216,235,232,0.92)' }]}>
      <SourceCardSkin />
      <ZipMintAura scope={label.replace(/[^a-zA-Z0-9]/g, '')} />
      <View style={styles.caseSourceLayer}>
        <Text numberOfLines={1} style={[styles.caseMiniStatLabel, { color: tokens.muted }]}>{label}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.caseMiniStatValue, { color: tokens.text }]}>{value}</Text>
      </View>
    </View>
  )
}

export function CaseWorkerAvatar({
  initials,
  tokens,
  uri,
}: {
  initials: string
  tokens: CustomerThemeTokens
  uri: string | null
}) {
  return (
    <View style={[styles.caseWorkerAvatar, { backgroundColor: '#E6FBF3', borderColor: 'rgba(216,235,232,0.92)' }]}>
      {uri ? (
        <Image contentFit="cover" source={{ uri }} style={styles.caseWorkerAvatarImage} />
      ) : (
        <Text style={[styles.caseWorkerAvatarText, { color: tokens.primary }]}>{initials}</Text>
      )}
    </View>
  )
}

export function CaseScopeStepRow({
  label,
  state,
  tokens,
  value,
}: {
  label: string
  state: CustomerV21TimelineState
  tokens: CustomerThemeTokens
  value: string
}) {
  const stateLabel = state === 'done' ? '✓' : state === 'active' ? '+' : '•'
  return (
    <View style={[styles.caseScopeStepRow, customerV21CaseScopeStepRowSurface(state)]}>
      <View style={[styles.caseScopeStateDot, customerV21CaseScopeStateDotSurface(state)]}>
        <Text style={[styles.caseScopeStateText, { color: state === 'active' ? '#FFFFFF' : tokens.primary }]}>{stateLabel}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.caseScopeLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.caseScopeValue, { color: state === 'active' ? '#087D72' : tokens.muted }]}>{value}</Text>
    </View>
  )
}

export function CaseTimelineItem({
  body,
  state,
  title,
  tokens,
}: {
  body: string
  state: CustomerV21TimelineState
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.caseTimelineItem}>
      <View
        style={[
          styles.caseTimelineDot,
          customerV21TimelineDotSurface(state, tokens),
        ]}
      >
        <Text style={[styles.caseTimelineDotText, { color: state === 'pending' ? tokens.muted : '#FFFFFF' }]}>{state === 'done' ? '✓' : state === 'active' ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.caseTimelineTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.caseTimelineBody, { color: tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

export function MatchingKaelStatusIcon({
  image,
  testID,
}: {
  image: CustomerV21Visual
  testID?: string
}) {
  return (
    <View accessibilityLabel="Kael" style={styles.matchingKaelStatusIconWrap} testID={testID}>
      <View pointerEvents="none" style={styles.matchingKaelStatusIconAura}>
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 86 86" width="100%">
          <Defs>
            <RadialGradient id="matchingKaelStatusAura" cx="50%" cy="50%" r="54%">
              <Stop offset="0" stopColor="rgba(92,237,214,0.26)" />
              <Stop offset="0.60" stopColor="rgba(149,243,227,0.12)" />
              <Stop offset="1" stopColor="rgba(149,243,227,0)" />
            </RadialGradient>
          </Defs>
          <Rect fill="url(#matchingKaelStatusAura)" height="86" width="86" />
        </Svg>
      </View>
      {isKaelCoreV9Visual(image) ? <KaelCoreV9 size={54} /> : <Image contentFit="contain" source={image} style={styles.matchingKaelStatusImage} />}
    </View>
  )
}

export function CaseArtifact({
  accent = false,
  caseWorkCardAura: CaseWorkCardAura,
  label,
  scope,
  sourceCardSkin: SourceCardSkin,
  testID,
  tokens,
  value,
}: {
  accent?: boolean
  caseWorkCardAura: CustomerV21CaseAura
  label: string
  scope: string
  sourceCardSkin: CustomerV21SourceSkin
  testID?: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={[styles.caseArtifact, { backgroundColor: accent ? tokens.service : tokens.raised, borderColor: tokens.border }]} testID={testID}>
      <SourceCardSkin />
      <CaseWorkCardAura scope={`Artifact${scope}`} testID={testID ? `${testID}-mint-aura` : undefined} />
      <Text numberOfLines={1} style={[styles.caseArtifactLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.68} numberOfLines={2} style={[styles.caseArtifactValue, { color: accent ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

export function QuotePriceLine({
  label,
  tokens,
  total = false,
  value,
}: {
  label: string
  tokens: CustomerThemeTokens
  total?: boolean
  value: string
}) {
  return (
    <View style={total ? styles.casePriceTotalLine : styles.casePriceLine}>
      <Text numberOfLines={1} style={[total ? styles.casePriceTotalLabel : styles.casePriceLabel, { color: total ? tokens.text : tokens.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[total ? styles.casePriceTotalValue : styles.casePriceValue, { color: total ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

export function ArrivalCodeBox({
  code,
  label,
  tokens,
}: {
  code: string | null
  label: string
  tokens: CustomerThemeTokens
}) {
  const digits = code && /^\d{4}$/.test(code) ? code.split('') : null

  if (!digits) {
    return (
      <View style={styles.arrivalCodePendingWrap} testID="customer-v21-arrival-code-pending">
        <View style={styles.arrivalCodeBox}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={[styles.arrivalCodeDigit, styles.arrivalCodeDigitPending, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
              <Text style={[styles.arrivalCodeDigitText, { color: tokens.muted }]}>•</Text>
            </View>
          ))}
        </View>
        <View style={[styles.arrivalCodePending, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-arrival-code-pending-pill">
          <Text style={[styles.arrivalCodePendingText, { color: tokens.muted }]}>{label}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.arrivalCodeBox} testID="customer-v21-arrival-code-box">
      {digits.map((digit, index) => (
        <View key={`${digit}-${index}`} style={[styles.arrivalCodeDigit, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Text style={[styles.arrivalCodeDigitText, { color: tokens.text }]}>{digit}</Text>
        </View>
      ))}
    </View>
  )
}

export function FulfillmentInfoRow({
  assetTile: AssetTile,
  body,
  handoffChip: HandoffChip,
  image,
  rightLabel,
  rightLabelTone,
  title,
  tokens,
}: {
  assetTile: CustomerV21AssetTile
  body: string
  handoffChip?: CustomerV21HandoffChip
  image: CustomerV21Visual
  rightLabel?: string
  rightLabelTone?: 'selected' | 'success'
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.fulfillmentListRow, { borderBottomColor: tokens.border }]}>
      <AssetTile image={image} label={title} size={34} sourceAura style={styles.fulfillmentListIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.fulfillmentRowTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.fulfillmentRowBody, { color: tokens.muted }]}>{body}</Text>
      </View>
      {rightLabel && HandoffChip && rightLabelTone ? <HandoffChip label={rightLabel} tone={rightLabelTone} /> : null}
    </View>
  )
}

export function CaseSuccessEmblem({
  done,
  reduceTransparency,
  tokens,
}: {
  done: boolean
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.successEmblem, !done ? styles.successEmblemPending : null]} testID="customer-v21-job-accepted-emblem">
      <SuccessEmblemAura done={done} reduceTransparency={reduceTransparency} />
      <View style={[styles.successEmblemCore, { backgroundColor: done ? tokens.primary : tokens.raised, borderColor: 'rgba(255,255,255,0.82)' }]}>
        <Text style={[styles.successEmblemText, { color: done ? '#FFFFFF' : tokens.muted }]}>{done ? '✓' : '•'}</Text>
      </View>
    </View>
  )
}

function SuccessEmblemAura({ done, reduceTransparency }: { done: boolean; reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.successEmblemAura} testID="customer-v21-job-accepted-emblem-aura">
      <Svg height="104" preserveAspectRatio="none" viewBox="0 0 104 104" width="104">
        <Defs>
          <RadialGradient id="successEmblemAuraCore" cx="45%" cy="34%" r="70%">
            <Stop offset="0" stopColor={done ? '#F4FFFC' : '#FAFFFD'} />
            <Stop offset="0.52" stopColor={done ? '#CBF8EE' : '#DDF7F0'} />
            <Stop offset="1" stopColor={done ? '#7EDCCA' : '#AEE8DC'} />
          </RadialGradient>
          <RadialGradient id="successEmblemAuraEdge" cx="50%" cy="52%" r="58%">
            <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <Stop offset="0.58" stopColor="rgba(63,223,202,0.12)" />
            <Stop offset="1" stopColor="rgba(63,223,202,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#successEmblemAuraCore)" height="104" rx="34" width="104" />
        <Rect fill="url(#successEmblemAuraEdge)" height="104" rx="34" width="104" />
      </Svg>
    </View>
  )
}

export function CaseStageMediaStrip({
  dataPending,
  language,
  refs,
}: {
  dataPending: string
  language: AppLanguage
  refs: string[]
}) {
  return (
    <JobEvidenceGallery
      emptyLabel={dataPending}
      language={language}
      refs={refs}
      stageLabel={language === 'vi' ? 'Bằng chứng hiện trường' : 'On-site evidence'}
      testID="customer-v21-job-progress-media"
    />
  )
}

export function MediaRow({
  assetTile: AssetTile,
  image,
  label,
  tokens,
  value,
}: {
  assetTile: CustomerV21AssetTile
  image: CustomerV21Visual
  label: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={styles.mediaRow}>
      <AssetTile image={image} label={label} size={42} />
      <View style={styles.flex}>
        <Text style={[styles.labelText, { color: tokens.muted }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: tokens.text }]}>{value}</Text>
      </View>
    </View>
  )
}

export function CaseOptionChoiceCard({
  assetTile: AssetTile,
  body,
  card: Card,
  handoffChip: HandoffChip,
  image,
  rightLabel,
  rightLabelTone,
  sourceCardSkin: SourceCardSkin,
  testID,
  title,
  tokens,
  zipMintAura: ZipMintAura,
}: {
  assetTile: CustomerV21AssetTile
  body: string
  card: CustomerV21Card
  handoffChip: CustomerV21HandoffChip
  image: CustomerV21Visual
  rightLabel: string
  rightLabelTone: 'selected' | 'success'
  sourceCardSkin: CustomerV21SourceSkin
  testID: string
  title: string
  tokens: CustomerThemeTokens
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <Card style={styles.caseOptionChoiceCard} testID={testID}>
      <SourceCardSkin />
      <ZipMintAura scope={testID.replace(/[^a-zA-Z0-9]/g, '')} />
      <View style={styles.caseSourceLayer}>
        <View style={styles.caseOptionChoiceContent}>
          <AssetTile image={image} label={title} size={38} sourceAura style={styles.caseOptionChoiceIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.caseOptionChoiceTitle, { color: tokens.text }]}>{title}</Text>
            <Text numberOfLines={2} style={[styles.caseOptionChoiceBody, { color: tokens.muted }]}>{body}</Text>
          </View>
          <HandoffChip label={rightLabel} tone={rightLabelTone} />
        </View>
      </View>
    </Card>
  )
}

export function CaseMapCanvas() {
  return (
    <View style={styles.caseMapCanvas} pointerEvents="none">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 215" width="100%">
        <Defs>
          <LinearGradient id="caseMapBase" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#EDF7E8" />
            <Stop offset="0.48" stopColor="#E5F1E8" />
            <Stop offset="1" stopColor="#F5F8E9" />
          </LinearGradient>
          <RadialGradient id="caseMapMintWash" cx="14%" cy="16%" r="76%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.20)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.10)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#caseMapBase)" height="215" width="340" />
        <Rect fill="url(#caseMapMintWash)" height="215" width="340" />
        {[34, 68, 102, 136, 170].map((y) => (
          <Rect fill="rgba(88,148,127,0.08)" height="1" key={`h-${y}`} width="340" x="0" y={y} />
        ))}
        {[38, 76, 114, 152, 190, 228, 266, 304].map((x) => (
          <Rect fill="rgba(88,148,127,0.07)" height="215" key={`v-${x}`} width="1" x={x} y="0" />
        ))}
        <Path d="M-20 55 L230 15" stroke="rgba(255,255,255,0.90)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M35 220 L112 2" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M128 214 L370 96" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M-26 156 L178 182" stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth="16" />
        <Path d="M58 141 L226 68" stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth="10" />
        <Path d="M58 141 L226 68" stroke="#38BDF8" strokeLinecap="round" strokeWidth="5" />
        <Path d="M202 54 L278 74" stroke="#38BDF8" strokeLinecap="round" strokeWidth="5" />
      </Svg>
    </View>
  )
}

export function CaseMapPin({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.caseMapPin, style]}>
      <View style={styles.caseMapPinInner} />
    </View>
  )
}

export function CaseOverviewScoreAura({ scope }: { scope: string }) {
  return (
    <View pointerEvents="none" style={styles.caseOverviewScoreAura} testID={`customer-v21-case-overview-score-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" viewBox="0 0 130 130" width="100%">
        <Defs>
          <RadialGradient id={`caseOverviewScoreAuraFill${scope}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(92,237,214,0.26)" />
            <Stop offset="0.56" stopColor="rgba(149,243,227,0.10)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="65" cy="65" fill={`url(#caseOverviewScoreAuraFill${scope})`} r="63" />
        <Circle cx="65" cy="65" fill="none" r="42" stroke="rgba(255,255,255,0.38)" strokeWidth="2" />
      </Svg>
    </View>
  )
}

export function CaseOverviewLiquidScore({
  aura = true,
  label,
  percent,
  reduceTransparency,
  scope,
  tokens,
  value,
}: {
  aura?: boolean
  label: string
  percent: number
  reduceTransparency: boolean
  scope: string
  tokens: CustomerThemeTokens
  value: string
}) {
  const progressId = `caseOverviewScoreProgress${scope}`
  const ringRadius = 43
  const circumference = 2 * Math.PI * ringRadius
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const progressLength = (circumference * clampedPercent) / 100

  return (
    <View style={styles.caseOverviewLiquidScore} testID="customer-v21-case-overview-liquid-score">
      {aura && !reduceTransparency ? <CaseOverviewScoreAura scope={scope} /> : null}
      <Svg height={82} style={styles.caseOverviewScoreSvg} viewBox="0 0 100 100" width={82}>
        <Defs>
          <LinearGradient id={progressId} x1="10" x2="88" y1="86" y2="10">
            <Stop offset="0" stopColor="#087D72" />
            <Stop offset="0.48" stopColor="#08AF9C" />
            <Stop offset="1" stopColor="#86EAD9" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" fill="none" r={ringRadius} stroke="rgba(204,226,222,0.62)" strokeWidth={8} />
        <Circle
          cx="50"
          cy="50"
          fill="none"
          r={ringRadius}
          stroke={`url(#${progressId})`}
          strokeDasharray={`${progressLength} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={8}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.caseOverviewScoreLens,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.82)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.30)' : 'rgba(255,255,255,0.95)',
          },
        ]}
      >
        {!reduceTransparency ? <View style={styles.caseOverviewScoreHighlight} /> : null}
      </View>
      <View style={styles.caseOverviewScoreInside}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.caseOverviewScoreValue, { color: tokens.primary }]}>{value}</Text>
        <Text numberOfLines={2} style={[styles.caseOverviewScoreLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

export function CaseMapPreview({
  address,
  eta,
  etaLabel,
  initials,
  reduceTransparency,
  status,
  tokens,
  uri,
  workerName,
  zipMintAura: ZipMintAura,
}: {
  address: string
  eta: string
  etaLabel: string
  initials: string
  reduceTransparency: boolean
  status: string
  tokens: CustomerThemeTokens
  uri: string | null
  workerName: string
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={styles.caseMapCard} testID="customer-v21-location-map-card">
      <CaseMapCanvas />
      <CaseMapAuraLayer reduceTransparency={reduceTransparency} scope="LocationMap" testID="customer-v21-location-map-mint-aura" />
      <CaseMapPin style={styles.caseMapPinStart} />
      <CaseMapPin style={styles.caseMapPinEnd} />
      <View style={[styles.caseMapFloat, { backgroundColor: 'rgba(255,255,255,0.90)', borderColor: 'rgba(255,255,255,0.95)' }]}>
        <ZipMintAura scope="LocationMapFloat" testID="customer-v21-location-map-float-mint-aura" />
        <CaseWorkerAvatar initials={initials} tokens={tokens} uri={uri} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.caseMapWorkerName, { color: tokens.text }]}>{workerName}</Text>
          <Text numberOfLines={1} style={[styles.caseMapWorkerMeta, { color: tokens.muted }]}>{status} · {address}</Text>
        </View>
        <View style={styles.caseMapEta}>
          <Text numberOfLines={1} style={[styles.caseMapEtaValue, { color: tokens.primary }]}>{eta}</Text>
          <Text numberOfLines={1} style={[styles.caseMapEtaLabel, { color: tokens.muted }]}>{etaLabel}</Text>
        </View>
      </View>
    </View>
  )
}

function CaseMapAuraLayer({
  reduceTransparency,
  scope,
  testID,
}: {
  reduceTransparency: boolean
  scope: string
  testID?: string
}) {
  if (reduceTransparency) return null

  const topId = `caseMapAuraTop${scope}`
  const bottomId = `caseMapAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.caseMapAuraLayer} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 215" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.35)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.15)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.26)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.12)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="282" cy="10" fill={`url(#${topId})`} r="126" />
        <Circle cx="22" cy="210" fill={`url(#${bottomId})`} r="126" />
      </Svg>
    </View>
  )
}

export function CaseFulfillmentStep({
  body,
  state,
  title,
  tokens,
}: {
  body: string
  state: FulfillmentStepState
  title: string
  tokens: CustomerThemeTokens
}) {
  const active = state === 'active'
  const done = state === 'done'
  const highlighted = active || done
  return (
    <View style={[
      styles.fulfillmentStep,
      {
        backgroundColor: highlighted ? tokens.service : 'rgba(255,255,255,0.80)',
        borderColor: highlighted ? 'rgba(85,214,195,0.36)' : 'rgba(204,235,229,0.82)',
      },
    ]}>
      <View style={[
        styles.fulfillmentStepState,
        {
          backgroundColor: highlighted ? tokens.primary : 'rgba(255,255,255,0.74)',
          borderColor: highlighted ? tokens.primary : 'rgba(204,235,229,0.88)',
        },
      ]}>
        <Text style={[styles.fulfillmentStepStateText, { color: highlighted ? '#FFFFFF' : tokens.muted }]}>{done ? '✓' : active ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.fulfillmentStepTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.fulfillmentStepBody, { color: highlighted ? tokens.primary : tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}
