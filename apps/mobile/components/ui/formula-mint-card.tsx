import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { aura, color } from '@/design/theme'
import { AlphaStop as Stop, NativeSafeRadialGradient as RadialGradient } from './svg-alpha-stop'

type FormulaMintCardAuraProps = {
  reduceTransparency?: boolean
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

function safeFormulaCardScope(scope: string) {
  return scope.replace(/[^a-zA-Z0-9]/g, '') || 'Card'
}

export function FormulaMintCardAura({ reduceTransparency = false, scope, style, testID }: FormulaMintCardAuraProps) {
  const safeScope = safeFormulaCardScope(scope)
  const topRightId = `formulaMintCardTopRight${safeScope}`
  const bottomLeftId = `formulaMintCardBottomLeft${safeScope}`

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[styles.fill, styles.opaque, style]} testID={testID} />
  }

  return (
    <View pointerEvents="none" style={[styles.fill, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 160" width="100%">
        <Defs>
          <RadialGradient id={topRightId} cx="86%" cy="4%" r="74%">
            {aura.component.stops.map((stop) => <Stop key={`${topRightId}-${stop.offset}`} offset={stop.offset} stopColor={stop.color} />)}
          </RadialGradient>
          <RadialGradient id={bottomLeftId} cx="4%" cy="100%" r="68%">
            {aura.iconTile.stops.map((stop) => <Stop key={`${bottomLeftId}-${stop.offset}`} offset={stop.offset} stopColor={stop.color} />)}
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topRightId})`} height="160" width="360" />
        <Rect fill={`url(#${bottomLeftId})`} height="160" width="360" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  opaque: {
    backgroundColor: color.mint.mint50,
  },
})
