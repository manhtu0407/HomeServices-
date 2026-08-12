import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { AlphaStop as Stop, NativeSafeRadialGradient as RadialGradient } from '@/components/ui/svg-alpha-stop'

const styles = StyleSheet.create({
  aura: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
})

function safeScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '') || 'KaelModeMenu'
}

export function KaelModeMenuMintAura({
  reduceTransparency,
  scope,
  testID,
}: {
  reduceTransparency: boolean
  scope: string
  testID?: string
}) {
  if (reduceTransparency) return null

  const gradientId = `kaelModeMenuMintAura${safeScope(scope)}`

  return (
    <View pointerEvents="none" style={styles.aura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 58" width="100%">
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="76%">
            <Stop offset="0" stopColor="rgba(75,228,205,0.22)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${gradientId})`} height="58" width="360" />
      </Svg>
    </View>
  )
}
