import { useId } from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'

import { component } from '@/design/theme'

const recipe = component.button.primary

// The rim and glow every filled primary CTA wears with the fill below.
export const primaryCtaFrame = {
  borderColor: recipe.border,
  borderWidth: 1,
  boxShadow: recipe.boxShadow,
} satisfies ViewStyle

// The one paint for filled primary CTAs in every role and theme: the sign-in button's mint
// gradient with its soft top-left light. Dark mode keeps the same colours, as iOS filled buttons do.
export function PrimaryCtaFill({ radius, testID = 'primary-cta-fill' }: { radius: number; testID?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fillId = `primary-cta-${id}`
  const lightId = `primary-cta-light-${id}`
  return (
    <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} testID={testID} width="100%">
      <Defs>
        <LinearGradient id={fillId} x1="0%" x2="100%" y1="0%" y2="0%">
          {recipe.gradient.map((stopColor, index) => (
            <Stop key={stopColor} offset={recipe.gradientStops[index]} stopColor={stopColor} />
          ))}
        </LinearGradient>
        <RadialGradient cx={recipe.highlight.cx} cy={recipe.highlight.cy} id={lightId} r={recipe.highlight.r}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={recipe.highlight.opacity} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect fill={`url(#${fillId})`} height="100%" rx={radius} width="100%" />
      <Rect fill={`url(#${lightId})`} height="100%" rx={radius} width="100%" />
    </Svg>
  )
}
