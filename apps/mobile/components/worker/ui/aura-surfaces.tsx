import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect } from 'react-native-svg'

import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { styles } from './aura-styles'

const calmCanvasStyle = [StyleSheet.absoluteFill, { backgroundColor: '#F6F7F7' }]

function CalmCanvas({ testID }: { testID: string }) {
  return <View pointerEvents="none" style={calmCanvasStyle} testID={testID} />
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
  scope,
  testID,
}: {
  scope: string
  testID?: string
}) {
  const safeScope = scope.replace(/[^a-zA-Z0-9]/g, '')
  const baseId = `workerV5FulfillmentCanvasBase${safeScope}`
  const topId = `workerV5FulfillmentCanvasTop${safeScope}`
  const heroId = `workerV5FulfillmentCanvasHero${safeScope}`
  const leftId = `workerV5FulfillmentCanvasLeft${safeScope}`
  const bottomId = `workerV5FulfillmentCanvasBottom${safeScope}`

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id={baseId} x1="0" x2="0.92" y1="0" y2="1">
            <Stop offset="0" stopColor="#F8FAFA" />
            <Stop offset="0.42" stopColor="#F6F7F7" />
            <Stop offset="1" stopColor="#F2F6F5" />
          </LinearGradient>
          <RadialGradient id={topId} cx="100%" cy="2%" r="82%">
            <Stop offset="0" stopColor="rgba(73,232,210,0.11)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.04)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={heroId} cx="86%" cy="26%" r="70%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.09)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.035)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="-18%" cy="45%" r="76%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.07)" />
            <Stop offset="0.76" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="82%" cy="104%" r="78%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.065)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${baseId})`} height="844" width="390" />
        <Rect fill={`url(#${topId})`} height="844" width="390" />
        <Rect fill={`url(#${heroId})`} height="844" width="390" />
        <Rect fill={`url(#${leftId})`} height="844" width="390" />
        <Rect fill={`url(#${bottomId})`} height="844" width="390" />
      </Svg>
    </View>
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

export function WorkerV5SuccessEmblemAura({ scope, testID }: { scope: string; testID?: string }) {
  const coreId = `workerV5SuccessEmblemAuraCore${scope}`
  const edgeId = `workerV5SuccessEmblemAuraEdge${scope}`
  return (
    <View pointerEvents="none" style={styles.successEmblemAura} testID={testID}>
      <Svg height="104" preserveAspectRatio="none" viewBox="0 0 104 104" width="104">
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
        <Rect fill={`url(#${coreId})`} height="104" rx="34" width="104" />
        <Rect fill={`url(#${edgeId})`} height="104" rx="34" width="104" />
      </Svg>
    </View>
  )
}

export function WorkerV5SuccessCheckFill({ scope, testID }: { scope: string; testID?: string }) {
  const fillId = `workerV5SuccessCheckFill${scope}`
  return (
    <View pointerEvents="none" style={styles.successCheckFill} testID={testID}>
      <Svg height="63" preserveAspectRatio="none" viewBox="0 0 63 63" width="63">
        <Defs>
          <LinearGradient id={fillId} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#33D4BD" />
            <Stop offset="1" stopColor="#087F73" />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="63" rx="23" width="63" />
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

export function WorkerV5HomeAuraBackground() {
  return <CalmCanvas testID="worker-v5-page-mint-aura" />
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

export function WorkerV5EarningsHomeAuraBackground() {
  return <CalmCanvas testID="worker-v5-earnings-page-customer-mint-aura" />
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
