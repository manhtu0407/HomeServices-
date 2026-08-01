import type { ComponentType } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient } from 'react-native-svg'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HistoryStyles as styles } from './history-styles'
type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21ZipAura = ComponentType<{ scope: string; testID?: string }>

function CaseMetric({
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
