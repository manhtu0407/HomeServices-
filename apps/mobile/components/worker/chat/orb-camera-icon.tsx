import Svg, { Circle, Rect } from 'react-native-svg'

import { styles } from './orb-styles'

export function WorkerV5KaelOrbCameraIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={20}
      style={styles.kaelOrbComposerCameraIcon}
      testID="worker-v5-kael-orb-camera-icon"
      viewBox="0 0 24 24"
      width={20}
    >
      <Rect height={15.5} rx={5.2} stroke={strokeColor} strokeWidth={2} width={17.5} x={3.25} y={5.25} />
      <Circle cx={12} cy={13} r={3.8} stroke={strokeColor} strokeWidth={2} />
      <Circle cx={17.35} cy={9.4} fill={strokeColor} r={1.35} />
    </Svg>
  )
}
