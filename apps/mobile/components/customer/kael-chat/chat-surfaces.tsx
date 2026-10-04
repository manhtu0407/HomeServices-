import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, Path, Rect } from 'react-native-svg'

import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import { AlphaStop as Stop, NativeSafeRadialGradient as RadialGradient } from '@/components/ui/svg-alpha-stop'
import type { CustomerThemeTokens } from '../customer-theme'
import { LiquidNavIcon } from '../dock/liquid-nav-icons'
import { customerV21ChatStyles as styles } from './chat-styles'

export function ChatBubble({
  speaker,
  streaming = false,
  testID,
  text,
  tokens,
}: {
  speaker: 'customer' | 'worker' | 'kael'
  reduceMotion?: boolean
  streaming?: boolean
  testID?: string
  text: string
  tokens: CustomerThemeTokens
}) {
  const isCustomer = speaker === 'customer'
  const isWorker = speaker === 'worker'
  return (
    <View
      accessibilityLabel={streaming ? text : undefined}
      accessibilityLiveRegion={streaming ? 'polite' : undefined}
      accessibilityState={streaming ? { busy: true } : undefined}
      accessible={streaming || undefined}
      style={[styles.chatBubble, isCustomer ? styles.chatBubbleCustomer : styles.chatBubbleKael, { backgroundColor: isCustomer ? tokens.primary : isWorker ? tokens.ghost : tokens.raised, borderColor: tokens.border }]}
      testID={testID}
    >
      <Text style={[styles.chatBubbleText, { color: isCustomer ? tokens.primaryText : tokens.text }]}>
        {text}
      </Text>
    </View>
  )
}

export function ChatMediaCameraIcon({ color, size = 20, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return <LiquidNavIcon color={color} name="camera" selected size={size} style={style} testID="customer-v21-kael-media-camera-icon" />
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

export function ChatCanvasAura({ mode, reduceTransparency }: { mode: CustomerThemeTokens['mode']; reduceTransparency: boolean }) {
  return (
    <FormulaMintCanvasAura
      mode={mode}
      reduceTransparency={reduceTransparency}
      scope="CustomerChat"
      testID="customer-v21-chat-canvas-aura"
    />
  )
}

export function ChatNewConversationIcon({ color }: { color: string }) {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path d="M12 5v14M5 12h14" stroke={color} strokeLinecap="round" strokeWidth={2.7} />
    </Svg>
  )
}
