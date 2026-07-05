import { Text, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ChatStyles as styles } from './chat-styles'

export function ChatBubble({
  role,
  testID,
  text,
  tokens,
}: {
  role: 'customer' | 'kael'
  testID?: string
  text: string
  tokens: CustomerThemeTokens
}) {
  const isCustomer = role === 'customer'
  return (
    <View style={[styles.chatBubble, isCustomer ? styles.chatBubbleCustomer : styles.chatBubbleKael, { backgroundColor: isCustomer ? tokens.primary : tokens.raised, borderColor: tokens.border }]} testID={testID}>
      <Text style={[styles.chatBubbleText, { color: isCustomer ? tokens.primaryText : tokens.text }]}>{text}</Text>
    </View>
  )
}

export function ChatMediaCameraIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={20}
      style={styles.chatMediaCameraIcon}
      testID="customer-v21-kael-media-camera-icon"
      viewBox="0 0 24 24"
      width={20}
    >
      <Rect height={15.5} rx={5.2} stroke={color} strokeWidth={2} width={17.5} x={3.25} y={5.25} />
      <Circle cx={12} cy={13} r={3.8} stroke={color} strokeWidth={2} />
      <Circle cx={17.35} cy={9.4} fill={color} r={1.35} />
    </Svg>
  )
}

export function ChatModeSwitchAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.chatModeSwitchAura} testID="customer-v21-chat-mode-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 58" width="100%">
        <Defs>
          <RadialGradient id="chatModeSwitchAuraFill" cx="50%" cy="50%" r="76%">
            <Stop offset="0" stopColor="rgba(75,228,205,0.22)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatModeSwitchAuraFill)" height="58" width="360" />
      </Svg>
    </View>
  )
}

export function ChatComposerAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.chatComposerAura} testID="customer-v21-chat-composer-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 70" width="100%">
        <Defs>
          <RadialGradient id="chatComposerAuraFill" cx="82%" cy="42%" r="66%">
            <Stop offset="0" stopColor="rgba(71,226,203,0.18)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.07)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatComposerAuraFill)" height="70" width="360" />
      </Svg>
    </View>
  )
}

export function ChatCanvasAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.chatCanvasAura} testID="customer-v21-chat-canvas-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <RadialGradient id="chatCanvasTop" cx="18%" cy="0%" r="56%">
            <Stop offset="0" stopColor="rgba(136,235,221,0.12)" />
            <Stop offset="0.58" stopColor="rgba(136,235,221,0.035)" />
            <Stop offset="0.86" stopColor="rgba(136,235,221,0)" />
          </RadialGradient>
          <RadialGradient id="chatCanvasBottom" cx="80%" cy="92%" r="62%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.08)" />
            <Stop offset="0.66" stopColor="rgba(13,174,154,0.025)" />
            <Stop offset="0.92" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatCanvasTop)" height="844" width="390" />
        <Rect fill="url(#chatCanvasBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}
