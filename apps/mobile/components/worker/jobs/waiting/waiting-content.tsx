import React from 'react'
import { AccessibilityInfo, Animated, AppState, Dimensions, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { AppStateStatus, LayoutChangeEvent } from 'react-native'
import { color } from '@/design/theme'
import { stageButtonHeight, stageLayout, stageMetric, stageTypography } from '../stage-ratio'
import { waitingAssets, waitingDarkAssets } from './waiting-assets'
import { waitingCopy } from './waiting-copy'
import { clockAnchor, epochNow, readWaitingClock } from './waiting-time'
import type { ClockReading } from './waiting-time'
import type { ClockAnchor, WaitingContentProps } from './waiting.types'
import { WaitingAtmosphere, WaitingButtonFill, WaitingClockIcon, WaitingParticles, WaitingRing } from './waiting-scene'
import { waitingTokens as tLight } from './waiting-tokens'
import { workerThemedStylesProxy, workerThemedTokensProxy } from '../../ui/worker-dark-styles'
import { getWorkerThemeModeNow } from '../../worker-theme'

const t = workerThemedTokensProxy(tLight)

type LocalState = { width: number; reading: ClockReading; reduced: boolean; foreground: boolean }
let instanceSequence = 0
/** Native screen content, shared by stage 3 and stage 7. No nested ScrollView, no stage mutation. */
export class WaitingContent extends React.PureComponent<WaitingContentProps, LocalState> {
  private readonly id = `ns-wait-${++instanceSequence}`
  private anchor: ClockAnchor = clockAnchor()
  private readonly drift = new Animated.Value(0)
  private motion?: Animated.CompositeAnimation
  private timer?: ReturnType<typeof setInterval>
  private subscriptions: { remove: () => void }[] = []
  private deadlineSeen: string | null = null
  private mountedFlag = false
  state: LocalState = { width: 390, reading: this.read(), reduced: true, foreground: AppState.currentState !== 'background' && AppState.currentState !== 'inactive' }

  private read() { return readWaitingClock(this.props.model.clock, this.props.previewNowMs ?? epochNow(this.props.model.clock.anchor ?? this.anchor, performance.now())) }
  componentDidMount() {
    this.mountedFlag = true
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => { if (this.mountedFlag) this.setState({ reduced }) }).catch(() => {})
    this.subscriptions.push(AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => this.setState({ reduced })))
    this.subscriptions.push(AppState.addEventListener('change', (s: AppStateStatus) => this.setState({ foreground: s === 'active' })))
    this.restartClock(); this.restartMotion()
  }
  componentDidUpdate(previous: WaitingContentProps, state: LocalState) {
    if (previous.model.clock.requestKey !== this.props.model.clock.requestKey) { this.anchor = clockAnchor(); this.deadlineSeen = null }
    if (previous.model !== this.props.model || previous.previewNowMs !== this.props.previewNowMs || state.foreground !== this.state.foreground) this.restartClock()
    if (previous.reduceMotion !== this.props.reduceMotion || previous.model.state !== this.props.model.state || previous.previewNowMs !== this.props.previewNowMs || state.reduced !== this.state.reduced || state.foreground !== this.state.foreground) this.restartMotion()
  }
  componentWillUnmount() { this.mountedFlag = false; clearInterval(this.timer); this.motion?.stop(); this.subscriptions.forEach(s => s.remove()) }
  private tick = () => {
    const reading = this.read()
    if (reading.text !== this.state.reading.text || reading.mode !== this.state.reading.mode || reading.expired !== this.state.reading.expired) this.setState({ reading })
    const key = `${this.props.model.clock.requestKey}|${this.props.model.clock.expiresAt}`
    if (this.props.model.state === 'waiting' && reading.expired && this.deadlineSeen !== key) { this.deadlineSeen = key; this.props.onDeadlineReached?.() }
  }
  private restartClock() {
    clearInterval(this.timer); this.tick()
    if (this.state.foreground && this.props.model.state === 'waiting' && this.props.previewNowMs === undefined) this.timer = setInterval(this.tick, 250)
  }
  private restartMotion() {
    this.motion?.stop(); this.drift.setValue(0)
    if ((this.props.reduceMotion ?? this.state.reduced) || !this.state.foreground || this.props.model.state !== 'waiting' || this.props.previewNowMs !== undefined) return
    this.motion = Animated.loop(Animated.sequence([
      Animated.timing(this.drift, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false }),
      Animated.timing(this.drift, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false }),
    ])); this.motion.start()
  }
  private layout = (event: LayoutChangeEvent) => { const width = Math.min(560, event.nativeEvent.layout.width); if (Math.abs(width - this.state.width) > 0.5 && width > 0) this.setState({ width }) }
  render() {
    const { model, onOpenDetails, language = 'vi' } = this.props
    const { reading } = this.state, s = this.state.width / t.width
    const copy = waitingCopy(model, reading, language), assets = (getWorkerThemeModeNow() === 'dark' ? waitingDarkAssets : waitingAssets)[model.kind]
    const closed = model.state !== 'waiting'
    // Text resolves against the real window width, not the measured/capped card width `s`
    // uses for layout, so the app's Apple type scale never shrinks relative to other screens.
    const windowWidth = Dimensions.get('window').width
    const timerScale = reading.text.length > 5 ? t.timerScale.long : t.timerScale.short
    const timerStyle = stageTypography('largeTitle', windowWidth, timerScale)
    const colors = this.props.buttonColors ?? [t.colors.buttonStart, t.colors.buttonEnd] as const
    // The design floor alone leaves the near-white atmosphere short of a tall device's actual
    // bottom edge; the same 620/0.92 floor worker-v5-flow.tsx gives its own ScrollView keeps this
    // screen's own background reaching that edge instead of handing off to a mismatched parent fill.
    const viewportMinHeight = Math.max(620, Math.round(Dimensions.get('window').height * 0.92))
    const minHeight = Math.max((t.contentHeight + t.layout.bodyOffset) * s, viewportMinHeight)
    return <View onLayout={this.layout} style={[styles.root, { minHeight }]} testID={`waiting-${model.kind}`}>
      <WaitingAtmosphere id={this.id} />
      <View testID={`waiting-body-${model.kind}`} style={{ paddingTop: t.layout.bodyOffset * s }}>
        <View style={{ height: 410 * s }} testID={`waiting-scene-${model.kind}`}>
          <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: -6 * s, opacity: this.drift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] }), transform: [{ translateY: this.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -2 * s] }) }] }}>
            <WaitingParticles scale={s} id={this.id}/>
          </Animated.View>
          <View pointerEvents="none" style={{ position: 'absolute', top: 14 * s, left: 106 * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WaitingRing scale={s} id={this.id}/>
          </View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: (model.kind === 'customer-confirmation' ? 72 : 67) * s, left: (model.kind === 'customer-confirmation' ? 182 : 194) * s, width: (model.kind === 'customer-confirmation' ? 225 : 207) * s, height: 166 * s, transform: [{ translateY: this.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -2 * s] }) }] }}>
            <Image source={assets.hero} resizeMode="contain" style={{ width: '100%', height: '100%' }} accessible={false} />
          </Animated.View>
          <View style={{ position: 'absolute', top: 231 * s, left: 26 * s, right: 26 * s, alignItems: 'center' }} accessible accessibilityLabel={`${copy.timer}: ${closed ? '--:--' : reading.text}`}>
            <Text selectable testID={`waiting-time-${model.kind}`} style={{ ...timerStyle, color: t.colors.text, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center' }} maxFontSizeMultiplier={1.15}>{closed ? '--:--' : reading.text}</Text>
            <View style={{ marginTop: 36 * s, flexDirection: 'row', alignItems: 'center', gap: 5 * s }}>
              <WaitingClockIcon size={21 * s} color="#00C79A"/><Text style={{ ...stageTypography(t.type.timerLabel.role, windowWidth), fontWeight: t.type.timerLabel.weight, color: color.brand.primary }} maxFontSizeMultiplier={1.3}>{copy.timer}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 14 * s, alignItems: 'center' }}>
          <Text accessibilityRole="header" style={{ ...stageTypography(t.type.heading.role, windowWidth), fontWeight: t.type.heading.weight, color: t.colors.text, textAlign: 'center' }}>{copy.title}</Text>
          <Text style={{ ...stageTypography(t.type.body.role, windowWidth), fontWeight: t.type.body.weight, color: t.colors.secondary, textAlign: 'center', marginTop: 6 * s }}>{copy.body}</Text>
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 12 * s, height: 110 * s }}>
          <Image source={assets.footer} resizeMode="stretch" style={{ width: '100%', height: '100%' }}/>
        </View>
        <View style={{ marginTop: 2 * s, paddingBottom: stageMetric(stageLayout.sectionGap, windowWidth) }}>
          <Pressable onPress={onOpenDetails} accessibilityRole="button" accessibilityLabel={copy.action} testID={`waiting-details-${model.kind}`}
            style={({ pressed }) => [{ height: stageButtonHeight(windowWidth), borderRadius: stageMetric(stageLayout.buttonRadius, windowWidth), alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 19px rgba(0,199,158,0.23)', transform: [{ scale: pressed ? 0.987 : 1 }] }]}>
            <WaitingButtonFill id={this.id} colors={colors}/>
            <Text style={{ ...stageTypography(t.type.button.role, windowWidth), position: 'relative', zIndex: 1, color: '#FFFFFF', fontWeight: t.type.button.weight, textAlign: 'center' }} maxFontSizeMultiplier={1.15}>{copy.action}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  }
}
const styles = workerThemedStylesProxy(StyleSheet.create({ root: { width: '100%', maxWidth: 560, alignSelf: 'center', position: 'relative', backgroundColor: '#FCFFFE' } }))
