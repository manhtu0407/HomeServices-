import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'

export type LiquidNavIconName = 'activity' | 'camera' | 'earnings' | 'home' | 'profile' | 'services'

export function LiquidNavIcon({ color, name, selected, size = 22, style, testID }: {
  color: ColorValue
  name: LiquidNavIconName
  selected: boolean
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const strokeWidth = selected ? 2.04 : 1.86

  return (
    <Svg
      fill="none"
      height={size}
      style={style}
      testID={testID}
      viewBox="0 0 24 24"
      width={size}
    >
      {name === 'home' ? (
        <Path
          d="M3.8 10.3 12 3.75l8.2 6.55v8.15a2 2 0 0 1-2 2h-4.05v-6.2h-4.3v6.2H5.8a2 2 0 0 1-2-2Z"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ) : name === 'services' ? (
        <>
          <Rect height={6.7} rx={2} stroke={color} strokeWidth={strokeWidth} width={6.7} x={3.7} y={3.7} />
          <Rect height={6.7} rx={2} stroke={color} strokeWidth={strokeWidth} width={6.7} x={13.6} y={3.7} />
          <Rect height={6.7} rx={2} stroke={color} strokeWidth={strokeWidth} width={6.7} x={3.7} y={13.6} />
          <Rect height={6.7} rx={2} stroke={color} strokeWidth={strokeWidth} width={6.7} x={13.6} y={13.6} />
        </>
      ) : name === 'earnings' ? (
        <>
          <Path d="M4.25 7.25V6.75A2.75 2.75 0 0 1 7 4h8a2.75 2.75 0 0 1 2.75 2.75v.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M4.25 7.25h15.5V17A2.75 2.75 0 0 1 17 19.75H7A2.75 2.75 0 0 1 4.25 17Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M19.75 9.25h-4a2.75 2.75 0 0 0 0 5.5h4" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Circle cx={15.75} cy={12} fill={color} r={0.72} />
        </>
      ) : name === 'camera' ? (
        <>
          <Rect height={15.5} rx={5.2} stroke={color} strokeWidth={strokeWidth} width={17.5} x={3.25} y={5.25} />
          <Circle cx={12} cy={13} r={3.8} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={17.35} cy={9.4} fill={color} r={1.35} />
        </>
      ) : name === 'activity' ? (
        <>
          <Circle cx={12} cy={12} r={8.45} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M12 7.25v5.15l3.35 2.05" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={7.8} r={3.7} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M4.8 20.2c.42-4.15 3.08-6.25 7.2-6.25s6.78 2.1 7.2 6.25" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
        </>
      )}
    </Svg>
  )
}
