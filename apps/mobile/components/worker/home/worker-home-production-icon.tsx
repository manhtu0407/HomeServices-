import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'
import type { SvgProps } from 'react-native-svg'

export type WorkerHomeProductionIconName =
  | 'activity'
  | 'briefcase'
  | 'camera'
  | 'calendar'
  | 'check'
  | 'chevron-down'
  | 'chevron-forward'
  | 'coins'
  | 'inbox'
  | 'options'
  | 'person'
  | 'search'
  | 'shield'
  | 'star'

const stroke = {
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.8,
}

export function WorkerHomeProductionIcon({
  color,
  name,
  size,
  style,
  testID,
}: {
  color: string
  name: WorkerHomeProductionIconName
  size: number
  style?: SvgProps['style']
  testID?: string
}) {
  const glyph = (() => {
    switch (name) {
      case 'search':
        return <><Circle cx={11} cy={11} r={7} {...stroke} stroke={color} /><Line x1={16.5} x2={21} y1={16.5} y2={21} {...stroke} stroke={color} /></>
      case 'options':
        return <><Line x1={4} x2={20} y1={7} y2={7} {...stroke} stroke={color} /><Circle cx={9} cy={7} fill="white" r={2} stroke={color} strokeWidth={1.8} /><Line x1={4} x2={20} y1={17} y2={17} {...stroke} stroke={color} /><Circle cx={15} cy={17} fill="white" r={2} stroke={color} strokeWidth={1.8} /></>
      case 'chevron-down':
        return <Polyline points="6,9 12,15 18,9" {...stroke} stroke={color} />
      case 'chevron-forward':
        return <Polyline points="9,5 16,12 9,19" {...stroke} stroke={color} />
      case 'briefcase':
        return <><Rect height={13} rx={3} width={18} x={3} y={7} {...stroke} stroke={color} /><Path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18M12 10v5M9.5 12.5h5" {...stroke} stroke={color} /></>
      case 'camera':
        return <><Rect height={11.5} rx={2.4} width={17} x={3.5} y={7.5} {...stroke} stroke={color} /><Path d="M8 7.5 9.2 5h5.6L16 7.5" {...stroke} stroke={color} /><Circle cx={12} cy={13.1} r={3.1} {...stroke} stroke={color} /></>
      case 'inbox':
        return <><Path d="M4.5 8.5 3.5 20h17L19.5 8.5" {...stroke} stroke={color} /><Path d="M3.9 14.5h4.8l1.6 2h3.4l1.6-2h4.8M12 3.5v7M9.5 8l2.5 2.5L14.5 8" {...stroke} stroke={color} /></>
      case 'activity':
        return <><Circle cx={12} cy={12} r={8.5} {...stroke} stroke={color} /><Path d="M12 7.3v5.1l3.4 2" {...stroke} stroke={color} /></>
      case 'calendar':
        return <><Rect height={15} rx={2} width={16} x={4} y={5} {...stroke} stroke={color} /><Path d="M8 3v4M16 3v4M4 10h16" {...stroke} stroke={color} /><Polyline points="8,15 10.5,17.5 16,12" {...stroke} stroke={color} /></>
      case 'check':
        return <><Circle cx={12} cy={12} r={9} {...stroke} stroke={color} /><Polyline points="8,12 11,15 17,9" {...stroke} stroke={color} /></>
      case 'coins':
        return <><Path d="M5 7.5C5 5.6 8.1 4 12 4s7 1.6 7 3.5-3.1 3.5-7 3.5-7-1.6-7-3.5Z" {...stroke} stroke={color} /><Path d="M5 7.5V12c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5V7.5M5 12v4.5c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5V12" {...stroke} stroke={color} /><Circle cx={12} cy={7.5} fill={color} r={1} /></>
      case 'star':
        return <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" {...stroke} stroke={color} />
      case 'person':
        return <><Circle cx={12} cy={12} r={9} {...stroke} stroke={color} /><Circle cx={12} cy={9} r={3} {...stroke} stroke={color} /><Path d="M6.5 18c1.3-3 3.1-4.5 5.5-4.5s4.2 1.5 5.5 4.5" {...stroke} stroke={color} /></>
      case 'shield':
        return <><Path d="M12 3.3 19 6v5.1c0 4.4-2.6 7.7-7 9.6-4.4-1.9-7-5.2-7-9.6V6l7-2.7Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={1.7} /><Path d="m8.6 12 2.2 2.2 4.6-4.6" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /></>
    }
  })()

  return <Svg height={size} style={style} testID={testID} viewBox="0 0 24 24" width={size}>{glyph}</Svg>
}
