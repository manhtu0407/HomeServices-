import { useId } from 'react'
import Svg, { Circle, Defs, Mask, Path, Rect } from 'react-native-svg'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'

export type LiquidNavFilledIconName = 'activity' | 'earnings' | 'home' | 'profile' | 'services'

// Filled tab glyphs: Apple HIG Tab bars, "Prefer filled symbols or icons for consistency with
// the platform." Cut-outs (clock hands, wallet clasp) are masks so the glass shows through.
export function LiquidNavFilledIcon({ color, name, size = 22, style, testID }: {
  color: ColorValue
  name: LiquidNavFilledIconName
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const maskId = `liquid-nav-cutout-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`

  return (
    <Svg fill="none" height={size} style={style} testID={testID} viewBox="0 0 24 24" width={size}>
      {name === 'home' ? (
        <Path
          d="M3.8 10.3 12 3.75l8.2 6.55v8.15a2 2 0 0 1-2 2h-4.05v-6.2h-4.3v6.2H5.8a2 2 0 0 1-2-2Z"
          fill={color}
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={1.2}
        />
      ) : name === 'services' ? (
        <>
          <Rect fill={color} height={7.2} rx={2.1} width={7.2} x={3.4} y={3.4} />
          <Rect fill={color} height={7.2} rx={2.1} width={7.2} x={13.4} y={3.4} />
          <Rect fill={color} height={7.2} rx={2.1} width={7.2} x={3.4} y={13.4} />
          <Rect fill={color} height={7.2} rx={2.1} width={7.2} x={13.4} y={13.4} />
        </>
      ) : name === 'activity' ? (
        <>
          <Defs>
            <Mask id={maskId}>
              <Rect fill="#fff" height={24} width={24} />
              <Path d="M12 7.4v5l3.2 2" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            </Mask>
          </Defs>
          <Circle cx={12} cy={12} fill={color} mask={`url(#${maskId})`} r={9.1} />
        </>
      ) : name === 'earnings' ? (
        <>
          <Defs>
            <Mask id={maskId}>
              <Rect fill="#fff" height={24} width={24} />
              <Path d="M20.4 9.2h-4.5a2.8 2.8 0 0 0 0 5.6h4.5Z" fill="#000" />
              <Circle cx={15.9} cy={12} fill="#fff" r={1.05} />
            </Mask>
          </Defs>
          <Path
            d="M4 6.9A2.9 2.9 0 0 1 6.9 4h8.2A2.9 2.9 0 0 1 18 6.9v.2h1.9V17a2.9 2.9 0 0 1-2.9 2.9H6.9A2.9 2.9 0 0 1 4 17Z"
            fill={color}
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <>
          <Circle cx={12} cy={7.7} fill={color} r={4} />
          <Path d="M4.4 20.3c.45-4.35 3.3-6.55 7.6-6.55s7.15 2.2 7.6 6.55Z" fill={color} stroke={color} strokeLinejoin="round" strokeWidth={1.2} />
        </>
      )}
    </Svg>
  )
}
