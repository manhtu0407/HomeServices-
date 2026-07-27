import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect } from 'react-native-svg'

import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { styles } from './aura-styles'

export const WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY = 1.4

const formulaMintCardAlpha = {
  primary: 0.2 * WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY,
  secondary: 0.12 * WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY,
  soft: 0.08 * WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY,
} as const

function safeWorkerAuraScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '') || 'Card'
}

export function WorkerV5FormulaMintCardAura({
  reduceTransparency = false,
  scope,
  style,
  testID,
}: {
  reduceTransparency?: boolean
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const safeScope = safeWorkerAuraScope(scope)
  const topRightId = `workerV5FormulaMintCardTopRight${safeScope}`
  const bottomLeftId = `workerV5FormulaMintCardBottomLeft${safeScope}`

  if (reduceTransparency) {
    return (
      <View
        pointerEvents="none"
        style={[styles.workerV5FormulaMintCardAura, styles.workerV5FormulaMintCardAuraOpaque, style]}
        testID={testID}
      />
    )
  }

  return (
    <View pointerEvents="none" style={[styles.workerV5FormulaMintCardAura, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 160" width="100%">
        <Defs>
          <RadialGradient id={topRightId} cx="86%" cy="4%" r="74%">
            <Stop offset="0" stopColor="#50E8D2" stopOpacity={formulaMintCardAlpha.primary} />
            <Stop offset="0.46" stopColor="#97F6E8" stopOpacity={formulaMintCardAlpha.secondary} />
            <Stop offset="0.8" stopColor="#F7FFFB" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={bottomLeftId} cx="4%" cy="100%" r="68%">
            <Stop offset="0" stopColor="#53DCCE" stopOpacity={formulaMintCardAlpha.secondary} />
            <Stop offset="0.58" stopColor="#E6FBF3" stopOpacity={formulaMintCardAlpha.soft} />
            <Stop offset="0.86" stopColor="#F7FFFB" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topRightId})`} height="160" width="360" />
        <Rect fill={`url(#${bottomLeftId})`} height="160" width="360" />
      </Svg>
    </View>
  )
}

export function WorkerV5CustomerCaseWideMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const topId = `workerV5CaseWideMintAuraTop${scope}`
  const leftId = `workerV5CaseWideMintAuraLeft${scope}`
  const bottomId = `workerV5CaseWideMintAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerCaseWideMintAura, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 130" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="88%" cy="2%" r="68%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.38)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.17)" />
            <Stop offset="0.76" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="5%" cy="96%" r="58%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.20)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.11)" />
            <Stop offset="0.84" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="58%" cy="108%" r="58%">
            <Stop offset="0" stopColor="rgba(151,246,232,0.16)" />
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

export function WorkerV5CustomerFulfillmentCanvasAura({
  reduceTransparency = false,
  scope,
  testID,
}: {
  reduceTransparency?: boolean
  scope: string
  testID?: string
}) {
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope={`WorkerV5Fulfillment${scope}`}
      testID={testID ?? `worker-v5-fulfillment-formula-mint-aura-${scope}`}
    />
  )
}

export function WorkerV5SourceCardSkin({ testID }: { testID?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <LinearGradient id="workerV5SourceCardFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.83)" />
            <Stop offset="1" stopColor="rgba(250,255,253,0.65)" />
          </LinearGradient>
          <LinearGradient id="workerV5SourceCardEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(255,255,255,0)" />
            <Stop offset="0.50" stopColor="rgba(255,255,255,0.98)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#workerV5SourceCardFill)" height="100" width="100" />
        <Rect fill="url(#workerV5SourceCardEdge)" height="1.3" width="82" x="9" y="0" />
      </Svg>
    </View>
  )
}

export function WorkerV5CustomerCaseWorkCardAura({
  scope,
  testID,
}: {
  scope: string
  testID?: string
}) {
  const topId = `workerV5CaseWorkAuraTop${scope}`
  const bottomId = `workerV5CaseWorkAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.workerV5CustomerCaseWorkCardAura} testID={testID}>
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

export function WorkerV5CustomerZipMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const fillId = `workerV5ZipMintAura${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerZipMintAura, style]} testID={testID}>
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

export function WorkerV5KaelChatScreenAura({
  reduceTransparency = false,
  scope,
  testID,
}: {
  reduceTransparency?: boolean
  scope: string
  testID?: string
}) {
  if (reduceTransparency) return null

  const fillId = `workerV5KaelChatScreenAura${scope}`
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <RadialGradient cx={351} cy={84.4} gradientUnits="userSpaceOnUse" id={fillId} rx={300} ry={260}>
            <Stop offset="0" stopColor="rgba(121,229,211,0.23)" />
            <Stop offset="0.70" stopColor="rgba(121,229,211,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="844" width="390" />
      </Svg>
    </View>
  )
}

export function WorkerV5SuccessEmblemAura({ scope, testID }: { scope: string; testID?: string }) {
  const coreId = `workerV5SuccessEmblemAuraCore${scope}`
  const edgeId = `workerV5SuccessEmblemAuraEdge${scope}`
  return (
    <View pointerEvents="none" style={styles.successEmblemAura} testID={testID}>
      <Svg height="92" preserveAspectRatio="none" viewBox="0 0 92 92" width="92">
        <Defs>
          <RadialGradient id={coreId} cx="45%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#F4FFFC" />
            <Stop offset="0.55" stopColor="#CBF8EE" />
            <Stop offset="1" stopColor="#7EDCCA" />
          </RadialGradient>
          <RadialGradient id={edgeId} cx="50%" cy="52%" r="58%">
            <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <Stop offset="0.58" stopColor="rgba(63,223,202,0.12)" />
            <Stop offset="1" stopColor="rgba(63,223,202,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="46" cy="46" fill={`url(#${coreId})`} r="46" />
        <Circle cx="46" cy="46" fill={`url(#${edgeId})`} r="46" />
      </Svg>
    </View>
  )
}

export function WorkerV5SuccessCheckFill({ scope, testID }: { scope: string; testID?: string }) {
  const fillId = `workerV5SuccessCheckFill${scope}`
  return (
    <View pointerEvents="none" style={styles.successCheckFill} testID={testID}>
      <Svg height="58" preserveAspectRatio="none" viewBox="0 0 58 58" width="58">
        <Defs>
          <LinearGradient id={fillId} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#33D4BD" />
            <Stop offset="1" stopColor="#087D72" />
          </LinearGradient>
        </Defs>
        <Circle cx="29" cy="29" fill={`url(#${fillId})`} r="29" />
      </Svg>
    </View>
  )
}

export function WorkerV5CustomerMapMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const topId = `workerV5CustomerMapAuraTop${scope}`
  const bottomId = `workerV5CustomerMapAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerMapMintAura, style]} testID={testID}>
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

export function WorkerV5HomeAuraBackground({ reduceTransparency = false }: { reduceTransparency?: boolean } = {}) {
  return <FormulaMintCanvasAura reduceTransparency={reduceTransparency} scope="WorkerV5Home" testID="worker-v5-page-mint-aura" />
}

export function WorkerV5HomeHeroSourceAura() {
  return (
    <View pointerEvents="none" style={styles.homeCommandAura} testID="worker-v5-hero-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5HomeHeroSourceAuraFill" cx="84%" cy="18%" r="70%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.42)" />
            <Stop offset="0.46" stopColor="rgba(149,246,229,0.16)" />
            <Stop offset="0.78" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeHeroSourceAuraLeft" cx="10%" cy="92%" r="66%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5HomeHeroSourceAuraFill)" height="220" width="360" />
        <Rect fill="url(#workerV5HomeHeroSourceAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

export function WorkerV5HomeQuickActionsAura() {
  return (
    <View pointerEvents="none" style={styles.homeListMintAura} testID="worker-v5-list-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5HomeQuickAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeQuickAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.22)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5HomeQuickAuraRight)" height="220" width="360" />
        <Rect fill="url(#workerV5HomeQuickAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

export function WorkerV5EarningsHomeHeroAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeCommandAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5EarningsHeroHomeAuraFill" cx="84%" cy="18%" r="70%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.42)" />
            <Stop offset="0.46" stopColor="rgba(149,246,229,0.16)" />
            <Stop offset="0.78" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsHeroHomeAuraLeft" cx="10%" cy="92%" r="66%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5EarningsHeroHomeAuraFill)" height="220" width="360" />
        <Rect fill="url(#workerV5EarningsHeroHomeAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

export function WorkerV5EarningsHomeListAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeListMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5EarningsHomeListAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsHomeListAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.22)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5EarningsHomeListAuraRight)" height="220" width="360" />
        <Rect fill="url(#workerV5EarningsHomeListAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}
