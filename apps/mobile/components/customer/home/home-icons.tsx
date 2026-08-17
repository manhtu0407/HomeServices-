import Svg, { Circle, Path, type SvgProps } from 'react-native-svg'

export type HomeIconName = 'bell' | 'calendar' | 'check' | 'flash' | 'list' | 'search' | 'shield' | 'snow'

export function HomeIcon({ color, name, size }: { color: string; name: HomeIconName; size: number }) {
  const props: SvgProps = {
    fill: 'none',
    height: size,
    viewBox: '0 0 24 24',
    width: size,
  }

  if (name === 'search') {
    return <Svg {...props}><Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="1.9" /><Path d="m15.4 15.4 5 5" stroke={color} strokeLinecap="round" strokeWidth="1.9" /></Svg>
  }
  if (name === 'bell') {
    return <Svg {...props}><Path d="M6.3 16.6h11.4l-1.1-1.8V9.3a4.6 4.6 0 0 0-9.2 0v5.5l-1.1 1.8Z" stroke={color} strokeLinejoin="round" strokeWidth="1.8" /><Path d="M10.1 19.2a2.1 2.1 0 0 0 3.8 0" stroke={color} strokeLinecap="round" strokeWidth="1.8" /></Svg>
  }
  if (name === 'calendar') {
    return <Svg {...props}><RectIcon color={color} /><Path d="M7.5 3.6v3M16.5 3.6v3M4.7 9.2h14.6" stroke={color} strokeLinecap="round" strokeWidth="1.7" /></Svg>
  }
  if (name === 'check') {
    return <Svg {...props}><Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth="1.7" /><Path d="m8.2 12.2 2.4 2.4 5.2-5.2" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" /></Svg>
  }
  if (name === 'shield') {
    return <Svg {...props}><Path d="M12 3.3 19 6v5.1c0 4.4-2.6 7.7-7 9.6-4.4-1.9-7-5.2-7-9.6V6l7-2.7Z" stroke={color} strokeLinejoin="round" strokeWidth="1.7" /><Path d="m8.6 12 2.2 2.2 4.6-4.6" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></Svg>
  }
  if (name === 'list') {
    return <Svg {...props}><Path d="M6.7 4.5h10.6v15H6.7zM9.3 8h5.4M9.3 12h5.4M9.3 16h3.4" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></Svg>
  }
  if (name === 'snow') {
    return <Svg {...props}><Path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M8.2 4.8 12 7l3.8-2.2M8.2 19.2 12 17l3.8 2.2" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" /></Svg>
  }
  return <Svg {...props}><Path d="m13.3 3.3-6 9h4.3l-1 8.4 6.1-10h-4.2l.8-7.4Z" stroke={color} strokeLinejoin="round" strokeWidth="1.7" /></Svg>
}

function RectIcon({ color }: { color: string }) {
  return <Path d="M5.2 6.2h13.6v13H5.2z" stroke={color} strokeLinejoin="round" strokeWidth="1.7" />
}
