import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect } from 'react-native-svg'

import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import type { CustomerV21ScreenId } from './types'
import { customerV21AuraStyles as styles } from './aura-styles'

type ReduceTransparencyProps = {
  reduceTransparency: boolean
}

export function SourceCardSkin({ testID }: { testID?: string }) {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} testID={testID} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <LinearGradient id="sourceCardFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.83)" />
            <Stop offset="1" stopColor="rgba(250,255,253,0.65)" />
          </LinearGradient>
          <LinearGradient id="sourceCardEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(255,255,255,0)" />
            <Stop offset="0.50" stopColor="rgba(255,255,255,0.98)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#sourceCardFill)" height="100" width="100" />
        <Rect fill="url(#sourceCardEdge)" height="1.3" width="82" x="9" y="0" />
      </Svg>
    </View>
  )
}

export function SourceIconAura() {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.sourceIconAura}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 92 92" width="100%">
        <Defs>
          <RadialGradient id="sourceIconAuraFill" cx="50%" cy="50%" r="70%">
            <Stop offset="0" stopColor="rgba(75,228,205,0.34)" />
            <Stop offset="0.44" stopColor="rgba(122,243,223,0.16)" />
            <Stop offset="0.76" stopColor="rgba(75,228,205,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#sourceIconAuraFill)" height="92" width="92" />
      </Svg>
    </View>
  )
}

export function SourceIconTileSkin() {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F7FFFB' }]} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 56 56" width="100%">
        <Defs>
          <LinearGradient id="sourceIconTileFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.86)" />
            <Stop offset="1" stopColor="rgba(231,251,246,0.57)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#sourceIconTileFill)" height="56" width="56" />
      </Svg>
    </View>
  )
}

export function CaseWorkCardAura({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) return null

  const topId = `caseWorkAuraTop${scope}`
  const bottomId = `caseWorkAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkCardAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 180" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="90%" cy="0%" r="64%">
            <Stop offset="0" stopColor="rgba(77,231,209,0.25)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="5%" cy="100%" r="60%">
            <Stop offset="0" stopColor="rgba(75,214,201,0.17)" />
            <Stop offset="0.74" stopColor="rgba(75,214,201,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="180" width="360" />
        <Rect fill={`url(#${bottomId})`} height="180" width="360" />
      </Svg>
    </View>
  )
}

export function ZipMintAura({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useGlassAccessibility()
  if (reduceTransparency) return null

  const fillId = `zipMintAura${scope}`
  return (
    <View pointerEvents="none" style={styles.zipMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 220 180" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.35)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.15)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="180" width="220" />
      </Svg>
    </View>
  )
}

export function CaseWideMintAura({
  intensity = 'default',
  scope,
  testID,
}: {
  intensity?: 'default' | 'strong'
  scope: string
  testID?: string
}) {
  const { reduceTransparency } = useGlassAccessibility()
  if (reduceTransparency) return null

  const topId = `caseWideMintAuraTop${scope}`
  const leftId = `caseWideMintAuraLeft${scope}`
  const bottomId = `caseWideMintAuraBottom${scope}`
  const strong = intensity === 'strong'
  return (
    <View pointerEvents="none" style={styles.caseWideMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 130" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="88%" cy="2%" r="68%">
            <Stop offset="0" stopColor={strong ? 'rgba(143,226,212,0.57)' : 'rgba(143,226,212,0.38)'} />
            <Stop offset="0.45" stopColor={strong ? 'rgba(230,251,243,0.26)' : 'rgba(230,251,243,0.17)'} />
            <Stop offset="0.76" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="5%" cy="96%" r="58%">
            <Stop offset="0" stopColor={strong ? 'rgba(83,220,206,0.30)' : 'rgba(83,220,206,0.20)'} />
            <Stop offset="0.58" stopColor={strong ? 'rgba(230,251,243,0.17)' : 'rgba(230,251,243,0.11)'} />
            <Stop offset="0.84" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="58%" cy="108%" r="58%">
            <Stop offset="0" stopColor={strong ? 'rgba(151,246,232,0.24)' : 'rgba(151,246,232,0.16)'} />
            <Stop offset="0.72" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="130" width="360" />
        <Rect fill={`url(#${leftId})`} height="130" width="360" />
        <Rect fill={`url(#${bottomId})`} height="130" width="360" />
      </Svg>
    </View>
  )
}

export function CaseWorkSourceChipAura({ scope }: { scope: string }) {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) return null

  const fillId = `caseWorkSourceChipAura${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkSourceChipAura} testID={`customer-v21-case-work-source-chip-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 104 40" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="54%" cy="48%" r="72%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.24)" />
            <Stop offset="0.62" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.9" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="40" width="104" />
      </Svg>
    </View>
  )
}

export function CaseWorkActionButtonAura({ scope }: { scope: string }) {
  const { reduceTransparency } = useGlassAccessibility()

  if (reduceTransparency) return null

  const fillId = `caseWorkActionAura${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkActionButtonAura} testID={`customer-v21-case-work-action-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 180 48" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="52%" cy="44%" r="76%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.20)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.08)" />
            <Stop offset="0.88" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="48" width="180" />
      </Svg>
    </View>
  )
}

export function HomeCanvasAura({ reduceTransparency }: ReduceTransparencyProps) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope="CustomerHome"
      testID="customer-v21-home-canvas-aura"
    />
  )
}

export function ProfileCanvasAura({
  reduceTransparency,
  screenId,
}: ReduceTransparencyProps & {
  screenId: CustomerV21ScreenId
}) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope={`CustomerProfile${screenId}`}
      testID={`customer-v21-profile-canvas-aura-${screenId}`}
    />
  )
}

export function AgenticCanvasAura({
  reduceTransparency,
  screenId,
}: ReduceTransparencyProps & {
  screenId: CustomerV21ScreenId
}) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope={`CustomerAgentic${screenId}`}
      testID={`customer-v21-agentic-canvas-aura-${screenId}`}
    />
  )
}

export function LocationEtaCanvasAura({ reduceTransparency }: ReduceTransparencyProps) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope="CustomerLocationEta"
      testID="customer-v21-location-canvas-aura"
    />
  )
}

export function FulfillmentCanvasAura({
  reduceTransparency,
  screenId,
}: ReduceTransparencyProps & {
  screenId: CustomerV21ScreenId
}) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope={`CustomerFulfillment${screenId}`}
      testID={`customer-v21-fulfillment-canvas-aura-${screenId}`}
    />
  )
}

export function CustomerScreenCanvasAura({
  reduceTransparency,
  screenId,
}: ReduceTransparencyProps & {
  screenId: CustomerV21ScreenId
}) {
  if (screenId === '2.1-home') return <HomeCanvasAura reduceTransparency={reduceTransparency} />
  if (screenId === '2.10-location-eta') return <LocationEtaCanvasAura reduceTransparency={reduceTransparency} />
  if (screenId === '2.11-live-alert' || screenId === '2.12-job-accepted' || screenId === '2.13-job-progress') {
    return <FulfillmentCanvasAura reduceTransparency={reduceTransparency} screenId={screenId} />
  }
  if (screenId === '5.1-agentic-home' || screenId === '5.2-command-center' || screenId === '5.3-approval-queue' || screenId === '5.4-memory') {
    return <AgenticCanvasAura reduceTransparency={reduceTransparency} screenId={screenId} />
  }
  if (screenId === '6.1-profile-overview' || screenId === '6.2-usage-ranking' || screenId === '6.3-protect-money') {
    return <ProfileCanvasAura reduceTransparency={reduceTransparency} screenId={screenId} />
  }

  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope={`CustomerV21${screenId}`}
      testID={`customer-v21-screen-canvas-aura-${screenId}`}
    />
  )
}

export function HomeHeroSourceAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.homeHeroSourceAura} testID="customer-v21-home-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 250 210" width="100%">
        <Defs>
          <RadialGradient id="homeHeroSourceAuraFill" cx="50%" cy="50%" r="74%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.34)" />
            <Stop offset="0.48" stopColor="rgba(149,246,229,0.12)" />
            <Stop offset="0.74" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#homeHeroSourceAuraFill)" height="210" width="250" />
      </Svg>
    </View>
  )
}

export function CaseOverviewHeroAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.caseOverviewHeroAura} testID="customer-v21-case-overview-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 190" width="100%">
        <Defs>
          <RadialGradient id="caseOverviewHeroRight" cx="88%" cy="36%" r="58%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.13)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="caseOverviewHeroLeft" cx="10%" cy="8%" r="50%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.11)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
          <LinearGradient id="caseOverviewHeroTopEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(149,243,227,0)" />
            <Stop offset="0.46" stopColor="rgba(92,237,214,0.22)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </LinearGradient>
          <LinearGradient id="caseOverviewHeroRightEdge" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(149,243,227,0)" />
            <Stop offset="0.50" stopColor="rgba(92,237,214,0.18)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </LinearGradient>
          <RadialGradient id="caseOverviewHeroCornerAura" cx="88%" cy="16%" r="42%">
            <Stop offset="0" stopColor="rgba(92,237,214,0.18)" />
            <Stop offset="0.58" stopColor="rgba(149,243,227,0.08)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#caseOverviewHeroRight)" height="190" width="360" />
        <Rect fill="url(#caseOverviewHeroLeft)" height="190" width="360" />
        <Rect fill="url(#caseOverviewHeroTopEdge)" height="18" rx="9" width="250" x="76" y="3" testID="customer-v21-case-overview-hero-top-edge-aura" />
        <Rect fill="url(#caseOverviewHeroRightEdge)" height="138" rx="14" width="30" x="318" y="26" testID="customer-v21-case-overview-hero-right-edge-aura" />
        <Rect fill="url(#caseOverviewHeroCornerAura)" height="190" width="360" />
      </Svg>
    </View>
  )
}

export function HomeEmptySourceAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.homeEmptySourceAura} testID="customer-v21-home-empty-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="homeEmptyAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.20)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.08)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="homeEmptyAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#homeEmptyAuraRight)" height="220" width="360" />
        <Rect fill="url(#homeEmptyAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

export function BookingProblemChipAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingProblemChipAura} testID="customer-v21-booking-problem-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 330 150" width="100%">
        <Defs>
          <RadialGradient id="bookingProblemAuraBottom" cx="82%" cy="92%" r="70%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.18)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.07)" />
            <Stop offset="0.86" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="bookingProblemAuraLeft" cx="5%" cy="10%" r="54%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.10)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingProblemAuraBottom)" height="150" width="330" />
        <Rect fill="url(#bookingProblemAuraLeft)" height="150" width="330" />
      </Svg>
    </View>
  )
}

export function BookingSuggestedChipAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingSuggestedChipAura} testID="customer-v21-booking-suggested-chip-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 160 48" width="100%">
        <Defs>
          <RadialGradient id="bookingSuggestedChipAuraFill" cx="52%" cy="48%" r="70%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingSuggestedChipAuraFill)" height="48" width="160" />
      </Svg>
    </View>
  )
}

export function BookingDraftButtonAura({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingDraftButtonAura} testID="customer-v21-booking-submit-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 58" width="100%">
        <Defs>
          <RadialGradient id="bookingDraftButtonAuraCenter" cx="52%" cy="52%" r="72%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.22)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="bookingDraftButtonAuraLeft" cx="10%" cy="96%" r="62%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.13)" />
            <Stop offset="0.72" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingDraftButtonAuraCenter)" height="58" width="340" />
        <Rect fill="url(#bookingDraftButtonAuraLeft)" height="58" width="340" />
      </Svg>
    </View>
  )
}

export function BookingSearchMintBorder({ reduceTransparency }: ReduceTransparencyProps) {
  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingSearchMintBorder} testID="customer-v21-booking-search-mint-border" />
  )
}
