import Svg, { Path } from 'react-native-svg'

// Cancel, Save and Delete for editing a Kael session in place, drawn inside the row's 30pt liquid controls.
export function KaelSessionRenameCancelIcon({ color }: { color: string }) {
  return <Svg height={14} viewBox="0 0 24 24" width={14}><Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke={color} strokeLinecap="round" strokeWidth={2.4} /></Svg>
}

export function KaelSessionRenameSaveIcon({ color }: { color: string }) {
  return <Svg height={15} viewBox="0 0 24 24" width={15}><Path d="M5 12.5l4.6 4.5L19 7.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} /></Svg>
}

export function KaelSessionDeleteIcon({ color }: { color: string }) {
  return <Svg height={15} viewBox="0 0 24 24" width={15}><Path d="M5.5 7h13M10 7V5.2h4V7M7.2 7l.8 11.8h8l.8-11.8M10.4 10.5v5M13.6 10.5v5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></Svg>
}
