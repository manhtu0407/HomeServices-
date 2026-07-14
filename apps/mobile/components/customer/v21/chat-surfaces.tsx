import { Text, View } from 'react-native'
import Svg, { Circle, Defs, Path, RadialGradient, Rect } from 'react-native-svg'

import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ChatStyles as styles } from './chat-styles'

export function ChatBubble({
  role,
  testID,
  text,
  tokens,
}: {
  role: 'customer' | 'worker' | 'kael'
  testID?: string
  text: string
  tokens: CustomerThemeTokens
}) {
  const isCustomer = role === 'customer'
  const isWorker = role === 'worker'
  return (
    <View style={[styles.chatBubble, isCustomer ? styles.chatBubbleCustomer : styles.chatBubbleKael, { backgroundColor: isCustomer ? tokens.primary : isWorker ? tokens.ghost : tokens.raised, borderColor: tokens.border }]} testID={testID}>
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
  return (
    <FormulaMintCanvasAura
      reduceTransparency={reduceTransparency}
      scope="CustomerChat"
      testID="customer-v21-chat-canvas-aura"
    />
  )
}

export function ChatBackIcon({ color }: { color: string }) {
  return (
    <Svg fill="none" height={22} style={styles.chatBackIcon} viewBox="0 0 24 24" width={22}>
      <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  )
}

export function ChatNewConversationIcon({ color }: { color: string }) {
  return (
    <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeLinecap="round" strokeWidth={2.1} />
    </Svg>
  )
}
