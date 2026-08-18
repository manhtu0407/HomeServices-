import type { ComponentType, ReactNode } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Defs, Rect } from 'react-native-svg'

import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient, NativeSafeRadialGradient as RadialGradient } from '@/components/ui/svg-alpha-stop'
import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ProfileMetricStyles as styles } from './profile-metrics-styles'

type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21ScoreAura = ComponentType<{ scope: string }>
type CustomerV21ZipAura = ComponentType<{ scope: string; testID?: string }>

export function ProfileCompactMintAura({
  reduceTransparency,
  scope,
  testID,
}: {
  reduceTransparency: boolean
  scope: string
  testID?: string
}) {
  if (reduceTransparency) return null

  const topId = `profileCompactMintAuraTop${scope}`
  const edgeId = `profileCompactMintAuraEdge${scope}`
  return (
    <View pointerEvents="none" style={styles.profileCompactMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 180 92" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="92%" cy="4%" r="76%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.30)" />
            <Stop offset="0.42" stopColor="rgba(154,246,232,0.14)" />
            <Stop offset="0.78" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={edgeId} cx="7%" cy="94%" r="66%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.16)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.10)" />
            <Stop offset="0.9" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="92" width="180" />
        <Rect fill={`url(#${edgeId})`} height="92" width="180" />
      </Svg>
    </View>
  )
}

export function ProfileStatCard({
  icon,
  label,
  reduceTransparency,
  showMintAura = true,
  sourceCardSkin: SourceCardSkin,
  testID,
  tokens,
  value,
  zipMintAura: ZipMintAura,
}: {
  icon?: ReactNode
  label: string
  reduceTransparency: boolean
  showMintAura?: boolean
  sourceCardSkin: CustomerV21SourceSkin
  testID?: string
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  const compactValue = value.length > 8
  const scope = label.replace(/[^a-zA-Z0-9]/g, '')
  const hasIcon = Boolean(icon)
  return (
    <View style={[styles.profileStatCard, hasIcon ? styles.profileStatCardWithIcon : null, { backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.80)', borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.38)' }]} testID={testID}>
      <SourceCardSkin />
      {showMintAura ? (
        <>
          <ProfileCompactMintAura
            reduceTransparency={reduceTransparency}
            scope={`ProfileStatFine${scope}`}
            testID={testID ? `${testID}-compact-mint-aura` : undefined}
          />
          <ZipMintAura scope={`ProfileStat${scope}`} testID={testID ? `${testID}-mint-aura` : undefined} />
        </>
      ) : null}
      <View style={[styles.profileStatContent, hasIcon ? styles.profileStatContentWithIcon : null]}>
        {icon ? <View style={styles.profileStatIcon} testID={testID ? `${testID}-icon` : undefined}>{icon}</View> : null}
        {hasIcon ? <Text numberOfLines={2} style={[styles.profileStatLabel, styles.profileStatLabelWithIcon, { color: tokens.muted }]}>{label}</Text> : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.profileStatValue, hasIcon ? styles.profileStatValueWithIcon : null, compactValue ? styles.profileStatValueCompact : null, { color: tokens.text }]}>{value}</Text>
        {!hasIcon ? <Text numberOfLines={2} style={[styles.profileStatLabel, { color: tokens.muted }]}>{label}</Text> : null}
      </View>
    </View>
  )
}

export function ProfileLiquidScore({
  caseOverviewScoreAura: CaseOverviewScoreAura,
  label,
  percent,
  reduceTransparency,
  scope,
  showProgressDot = false,
  secondaryLabel,
  size = 'regular',
  tokens,
  value,
}: {
  caseOverviewScoreAura: CustomerV21ScoreAura
  label: string
  percent: number
  reduceTransparency: boolean
  scope: string
  showProgressDot?: boolean
  secondaryLabel?: string
  size?: 'regular' | 'large'
  tokens: CustomerThemeTokens
  value: string
}) {
  const progressId = `profileLiquidScoreProgress${scope}`
  const ringRadius = 43
  const circumference = 2 * Math.PI * ringRadius
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const progressLength = (circumference * clampedPercent) / 100
  const frameSize = size === 'large' ? 154 : 112
  const svgSize = size === 'large' ? 132 : 102
  const lensInset = size === 'large' ? 24 : 17
  const progressAngle = (Math.PI * 2 * clampedPercent) / 100
  const progressDotX = 50 + ringRadius * Math.cos(progressAngle)
  const progressDotY = 50 + ringRadius * Math.sin(progressAngle)
  const scoreContentWidth = frameSize - lensInset * 2 - 6
  const compactValue = value.length > 3
  return (
    <View style={[styles.profileLiquidScore, size === 'large' ? styles.profileLiquidScoreLarge : null, { height: frameSize, width: frameSize }]} testID={`customer-v21-profile-score-${scope}`}>
      {!reduceTransparency ? <CaseOverviewScoreAura scope={`Profile${scope}`} /> : null}
      <Svg height={svgSize} style={styles.caseOverviewScoreSvg} viewBox="0 0 100 100" width={svgSize}>
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
        {showProgressDot ? (
          <Circle
            cx={progressDotX}
            cy={progressDotY}
            fill="#08AF9C"
            r={3.25}
            stroke={tokens.mode === 'dark' ? tokens.raised : '#FFFFFF'}
            strokeWidth={1.5}
            testID={`customer-v21-profile-score-${scope}-progress-dot`}
          />
        ) : null}
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.profileScoreLens,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.82)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.30)' : 'rgba(255,255,255,0.95)',
            bottom: lensInset,
            left: lensInset,
            right: lensInset,
            top: lensInset,
          },
        ]}
      >
        {!reduceTransparency ? <View style={styles.caseOverviewScoreHighlight} /> : null}
      </View>
      <View style={[styles.caseOverviewScoreInside, { width: scoreContentWidth }]}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={compactValue ? 0.6 : 0.72}
          numberOfLines={compactValue ? 2 : 1}
          style={[
            styles.profileScoreValue,
            size === 'large' ? styles.profileScoreValueLarge : null,
            compactValue ? styles.profileScoreValueStatus : null,
            compactValue && size === 'large' ? styles.profileScoreValueStatusLarge : null,
            { color: tokens.primary },
          ]}
          testID={`customer-v21-profile-score-${scope}-value`}
        >
          {value}
        </Text>
        <View style={[styles.profileScoreMeta, size === 'large' ? styles.profileScoreMetaLarge : null]}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={secondaryLabel ? 0.62 : 0.72}
            numberOfLines={secondaryLabel ? 1 : size === 'large' ? 2 : 1}
            style={[styles.profileScoreLabel, size === 'large' ? styles.profileScoreLabelLarge : null, { color: tokens.muted }]}
          >
            {label}
          </Text>
          {secondaryLabel ? (
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.62}
              numberOfLines={1}
              style={[styles.profileScoreSubLabel, size === 'large' ? styles.profileScoreSubLabelLarge : null, { color: tokens.muted }]}
            >
              {secondaryLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}
