import React from 'react'
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { stageElevenMotion as m, stageElevenTokens as t } from './stage-eleven.tokens'
import { StageElevenIcon } from './stage-eleven-icons'
import type { StageElevenState } from './stage-eleven.types'

const AnimatedPath = Animated.createAnimatedComponent(Path)
let nextId = 0
export type StageElevenSuccessProps = {
  state: StageElevenState
  reduceMotion?: boolean
  /** Payment identity only. Do NOT key this to amount updates / component renders. */
  motionKey?: string | number
}

/** Native animation lifecycle is intentionally self-contained; no infinite loops.
 * All transforms/opacity use native driver. SVG stroke drawing uses the JS driver.
 * Amount text is never animated through incorrect intermediate money values.
 */
export class StageElevenSuccess extends React.PureComponent<StageElevenSuccessProps> {
  private readonly id = `stage11-confirm-${++nextId}`
  private readonly core = new Animated.Value(1)
  private readonly ring = new Animated.Value(1)
  private readonly check = new Animated.Value(1)
  private readonly halo = new Animated.Value(1)
  private readonly sparks = new Animated.Value(1)
  private sequence: Animated.CompositeAnimation | null = null
  private reduceSubscription?: { remove: () => void }
  private appSubscription?: { remove: () => void }
  private mounted = false
  private systemReduced = true

  componentDidMount() {
    this.mounted = true
    this.reduceSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      this.systemReduced = enabled
      if (enabled) this.finish()
    })
    this.appSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') this.finish()
    })
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!this.mounted) return
      this.systemReduced = enabled
      this.play()
    }).catch(() => this.finish())
  }
  componentDidUpdate(previous: StageElevenSuccessProps) {
    if (previous.state !== this.props.state || previous.motionKey !== this.props.motionKey
      || previous.reduceMotion !== this.props.reduceMotion) this.play()
  }
  componentWillUnmount() {
    this.mounted = false
    this.sequence?.stop()
    this.reduceSubscription?.remove()
    this.appSubscription?.remove()
  }
  private finish = () => {
    this.sequence?.stop()
    this.core.setValue(1); this.ring.setValue(1); this.check.setValue(1)
    this.halo.setValue(1); this.sparks.setValue(1)
  }
  private play = () => {
    this.sequence?.stop()
    if (this.props.state !== 'confirmed' || this.props.reduceMotion || this.systemReduced) {
      this.finish(); return
    }
    this.core.setValue(0); this.ring.setValue(0); this.check.setValue(0)
    this.halo.setValue(0); this.sparks.setValue(0)
    const native = Platform.OS !== 'web'
    this.sequence = Animated.parallel([
      Animated.timing(this.ring, { toValue: 1, duration: m.ringDuration, easing: Easing.out(Easing.cubic), useNativeDriver: native, isInteraction: false }),
      Animated.sequence([
        Animated.delay(m.coreDelay),
        Animated.timing(this.core, { toValue: 1, duration: m.coreDuration, easing: Easing.bezier(.2, .8, .2, 1), useNativeDriver: native, isInteraction: false }),
      ]),
      Animated.sequence([
        Animated.delay(m.checkDelay),
        Animated.timing(this.check, { toValue: 1, duration: m.checkDuration, easing: Easing.inOut(Easing.cubic), useNativeDriver: false, isInteraction: false }),
      ]),
      Animated.timing(this.halo, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: native, isInteraction: false }),
      Animated.sequence([
        Animated.delay(610),
        Animated.timing(this.sparks, { toValue: 1, duration: 1040, easing: Easing.out(Easing.cubic), useNativeDriver: native, isInteraction: false }),
      ]),
    ])
    this.sequence.start()
  }
  render() {
    if (this.props.state !== 'confirmed') {
      const color = this.props.state === 'failed' ? t.error : t.warning
      return <View style={s.stage} testID="stage11-status-not-confirmed">
        <View style={[s.pending, { borderColor: color }]}>
          <StageElevenIcon name={this.props.state === 'pending' ? 'clock' : 'alert'} size={32} color={color}/>
        </View>
      </View>
    }
    return <View style={s.stage} accessible={false} accessibilityElementsHidden testID="stage11-success-motion">
      <Animated.View style={[s.halo, {
        opacity: this.halo.interpolate({ inputRange: [0, .35, 1], outputRange: [0, .4, 0] }),
        transform: [{ scale: this.halo.interpolate({ inputRange: [0, 1], outputRange: [.6, 1.45] }) }],
      }]}/>
      <Animated.View style={[s.ring, {
        opacity: this.ring,
        transform: [{ scale: this.ring.interpolate({ inputRange: [0, .75, 1], outputRange: [.75, 1.035, 1] }) }],
      }]}/>
      <Animated.View style={[s.core, { opacity: this.core,
        transform: [{ scale: this.core.interpolate({ inputRange: [0, .78, 1], outputRange: [.65, 1.03, 1] }) }],
      }]}>
        <Svg width={76} height={76} viewBox="0 0 76 76" accessible={false}>
          <Defs><LinearGradient id={this.id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#23C79A"/><Stop offset="55%" stopColor="#009F75"/><Stop offset="1" stopColor="#007F60"/>
          </LinearGradient></Defs>
          <Circle cx={38} cy={38} r={37} fill={`url(#${this.id})`}/>
          <Circle cx={38} cy={38} r={36.5} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={1}/>
          <AnimatedPath testID="stage11-check-path" d="m23 38 10 10 21-22" fill="none" stroke="#FFFFFF" strokeWidth={5.2}
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="47 47"
            strokeDashoffset={this.check.interpolate({ inputRange: [0, 1], outputRange: [47, 0] })}/>
        </Svg>
      </Animated.View>
      {[-144, -36, 36, 144].map((angle, index) => <Animated.View key={angle} style={[s.spark, {
        backgroundColor: index % 2 === 0 ? '#24BB89' : '#9FE8CE',
        opacity: this.sparks.interpolate({ inputRange: [0, .18, .65, 1], outputRange: [0, .85, .45, 0] }),
        transform: [
          { rotate: `${angle}deg` },
          { translateY: this.sparks.interpolate({ inputRange: [0, 1], outputRange: [-46, -69] }) },
          { scaleY: this.sparks.interpolate({ inputRange: [0, 1], outputRange: [.5, 1] }) },
        ],
      }]}/>)}
    </View>
  }
}
const s = StyleSheet.create({
  stage: { height: 124, width: 180, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  halo: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 1, borderColor: '#7EDCBB' },
  ring: { position: 'absolute', width: 106, height: 106, borderRadius: 53, backgroundColor: t.mintStrong },
  core: { width: 76, height: 76, borderRadius: 38 },
  spark: { position: 'absolute', width: 3, height: 9, borderRadius: 2 },
  pending: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF9F0' },
})
