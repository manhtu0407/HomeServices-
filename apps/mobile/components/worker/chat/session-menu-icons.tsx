import Svg, { Circle, Path } from 'react-native-svg'

import { color } from '@/design/theme'

export function WorkerV5KaelSessionIcon({
  filled = false,
  kind,
  size,
  strokeColor = color.brand.primaryDark,
  strokeWidth = 2,
  testID,
}: {
  filled?: boolean
  kind: 'more' | 'pin' | 'plus'
  size?: number
  strokeColor?: string
  strokeWidth?: number
  testID?: string
}) {
  if (kind === 'more') {
    const iconSize = size ?? 18
    return <Svg height={iconSize} viewBox="0 0 24 24" width={iconSize}>
      <Circle cx={12} cy={5.5} fill={color.brand.primaryDark} r={1.25} />
      <Circle cx={12} cy={12} fill={color.brand.primaryDark} r={1.25} />
      <Circle cx={12} cy={18.5} fill={color.brand.primaryDark} r={1.25} />
    </Svg>
  }

  if (kind === 'pin') {
    const iconSize = size ?? 14
    return <Svg height={iconSize} viewBox="0 0 24 24" width={iconSize}>
      <Path
        d="M8.2 4.5h7.6l-1.25 5.2 2.45 2.45v1.35H7v-1.35L9.45 9.7 8.2 4.5Zm3.8 9v6"
        fill={filled ? 'rgba(12,158,139,0.18)' : 'none'}
        stroke={strokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.65}
      />
    </Svg>
  }

  const iconSize = size ?? 20
  return <Svg height={iconSize} testID={testID} viewBox="0 0 24 24" width={iconSize}>
    <Path d="M12 5.25v13.5M5.25 12h13.5" fill="none" stroke={strokeColor} strokeLinecap="round" strokeWidth={strokeWidth} />
  </Svg>
}
