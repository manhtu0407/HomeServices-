import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'

export type LiquidNavIconName = 'activity' | 'balance' | 'camera' | 'document' | 'earnings' | 'home' | 'profile' | 'services' | 'withdrawal'

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
      ) : name === 'document' ? (
        <>
          <Path d="M7.25 3.75h6.5l4.9 4.9v11.6H7.25a2.5 2.5 0 0 1-2.5-2.5V6.25a2.5 2.5 0 0 1 2.5-2.5Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M13.75 3.75v4.9h4.9M8.6 12.45h6.8M8.6 16h6.8" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
        </>
      ) : name === 'balance' ? (
        <>
          <Path d="M6.25 8.25c0-1.52 2.57-2.75 5.75-2.75s5.75 1.23 5.75 2.75-2.57 2.75-5.75 2.75-5.75-1.23-5.75-2.75Z" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M6.25 8.25v3.5c0 1.52 2.57 2.75 5.75 2.75s5.75-1.23 5.75-2.75v-3.5M6.25 11.75v3.5c0 1.52 2.57 2.75 5.75 2.75s5.75-1.23 5.75-2.75v-3.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Circle cx={12} cy={8.25} fill={color} r={0.9} />
        </>
      ) : name === 'withdrawal' ? (
        <>
          <Path d="M4.5 6.25A2.5 2.5 0 0 1 7 3.75h9.5A2.5 2.5 0 0 1 19 6.25v4.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M4.5 7.25h15v5.5h-3.25a2.75 2.75 0 0 0 0 5.5H19v.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5V7.75" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M12 3.75v6.5m0 0-2.25-2.25M12 10.25l2.25-2.25" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
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
