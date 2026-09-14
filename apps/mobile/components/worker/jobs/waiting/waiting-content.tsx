import React from 'react'
import { AccessibilityInfo, Animated, AppState, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { AppStateStatus, LayoutChangeEvent } from 'react-native'
import { waitingAssets } from './waiting-assets'
import { waitingCopy } from './waiting-copy'
import { clockAnchor, epochNow, readWaitingClock } from './waiting-time'
import type { ClockReading } from './waiting-time'
import type { ClockAnchor, WaitingContentProps } from './waiting.types'
import { WaitingAtmosphere, WaitingButtonFill, WaitingIcon, WaitingParticles, WaitingRing } from './waiting-scene'
import { waitingTokens as t } from './waiting-tokens'

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
    const { model, onBack, onOpenDetails, language = 'vi' } = this.props
    const { reading } = this.state, s = this.state.width / t.width
    const copy = waitingCopy(model, reading, language), assets = waitingAssets[model.kind]
    const closed = model.state !== 'waiting'
    const size = reading.text.length > 5 ? 43 : t.type.timer
    const colors = this.props.buttonColors ?? [t.colors.buttonStart, t.colors.buttonEnd] as const
    return <View onLayout={this.layout} style={[styles.root, { minHeight: (t.contentHeight + t.layout.bodyOffset) * s }]} testID={`waiting-${model.kind}`}>
      <WaitingAtmosphere id={this.id} />
      <View testID={`waiting-header-${model.kind}`} style={{ height: 82 * s, paddingTop: 11 * s, paddingLeft: 26 * s }}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={onBack} hitSlop={8} testID={`waiting-back-${model.kind}`}
          style={({ pressed }) => [{ width: 56 * s, height: 56 * s, minWidth: 44, minHeight: 44, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderColor: '#E8F0F4', borderWidth: 1, boxShadow: '0 3px 7px rgba(42,68,104,0.15)', opacity: pressed ? 0.75 : 1 }]}>
          <WaitingIcon kind="back" size={26 * s} color="#173C77" />
        </Pressable>
      </View>
      <View testID={`waiting-body-${model.kind}`} style={{ paddingTop: t.layout.bodyOffset * s }}>
        <View style={{ height: 373 * s }} testID={`waiting-scene-${model.kind}`}>
          <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: -6 * s, opacity: this.drift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] }), transform: [{ translateY: this.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -2 * s] }) }] }}>
            <WaitingParticles scale={s} id={this.id}/>
          </Animated.View>
          <View pointerEvents="none" style={{ position: 'absolute', top: 14 * s, left: 106 * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WaitingRing scale={s} id={this.id}/>
          </View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: (model.kind === 'customer-confirmation' ? 72 : 67) * s, left: (model.kind === 'customer-confirmation' ? 182 : 194) * s, width: (model.kind === 'customer-confirmation' ? 225 : 207) * s, height: 166 * s, transform: [{ translateY: this.drift.interpolate({ inputRange: [0, 1], outputRange: [0, -2 * s] }) }] }}>
            <Image source={assets.hero} resizeMode="contain" style={{ width: '100%', height: '100%' }} accessible={false} />
          </Animated.View>
          <View style={{ position: 'absolute', top: 243 * s, left: 26 * s, right: 26 * s, alignItems: 'center' }} accessible accessibilityLabel={`${copy.timer}: ${closed ? '--:--' : reading.text}`}>
            <Text selectable testID={`waiting-time-${model.kind}`} style={{ color: t.colors.text, fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: size * s, lineHeight: 63 * s, letterSpacing: -0.3 * s, textAlign: 'center' }} maxFontSizeMultiplier={1.15}>{closed ? '--:--' : reading.text}</Text>
            <View style={{ marginTop: 1 * s, flexDirection: 'row', alignItems: 'center', gap: 5 * s }}>
              <WaitingIcon kind="clock" size={21 * s} color="#00C79A"/><Text style={{ fontSize: 17 * s, lineHeight: 25 * s, color: '#00BF97' }} maxFontSizeMultiplier={1.3}>{copy.timer}</Text>
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 28 * s, marginTop: 14 * s, alignItems: 'center' }}>
          <Text accessibilityRole="header" style={{ fontSize: t.type.heading * s, lineHeight: 37 * s, fontWeight: '700', color: t.colors.text, letterSpacing: -0.65 * s, textAlign: 'center' }}>{copy.title}</Text>
          <Text style={{ fontSize: t.type.body * s, lineHeight: 28 * s, fontWeight: '400', color: t.colors.secondary, letterSpacing: -0.47 * s, textAlign: 'center', marginTop: 6 * s }}>{copy.body}</Text>
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 23 * s, height: 157 * s }}>
          <Image source={assets.footer} resizeMode="stretch" style={{ width: '100%', height: '100%' }}/>
        </View>
        <View style={{ marginTop: 2 * s, paddingHorizontal: 26 * s, paddingBottom: 59 * s }}>
          <Pressable onPress={onOpenDetails} accessibilityRole="button" accessibilityLabel={copy.action} testID={`waiting-details-${model.kind}`}
            style={({ pressed }) => [{ height: 80 * s, minHeight: 48, borderRadius: 42 * s, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 19px rgba(0,199,158,0.23)', transform: [{ scale: pressed ? 0.987 : 1 }] }]}>
            <WaitingButtonFill id={this.id} colors={colors}/>
            <Text style={{ position: 'relative', zIndex: 1, fontSize: t.type.button * s, lineHeight: 34 * s, color: '#FFFFFF', fontWeight: '600', textAlign: 'center', letterSpacing: -0.3 * s }} maxFontSizeMultiplier={1.15}>{copy.action}</Text>
            <View pointerEvents="none" style={{ position: 'absolute', right: 31 * s }}><WaitingIcon kind="forward" size={25 * s} color="#FFFFFF"/></View>
          </Pressable>
        </View>
      </View>
    </View>
  }
}
const styles = StyleSheet.create({ root: { width: '100%', maxWidth: 560, alignSelf: 'center', position: 'relative', backgroundColor: '#FCFFFE' } })
