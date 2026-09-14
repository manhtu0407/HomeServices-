import React from 'react'
import Svg, { Path, Circle, Rect } from 'react-native-svg'
import { stageElevenTokens as t } from './stage-eleven.tokens'
export type StageElevenIconName = 'check' | 'back' | 'bank' | 'wallet' | 'receipt' | 'briefcase' | 'pin' | 'user' | 'calendar' | 'clock' | 'copy' | 'coins' | 'home' | 'sprout' | 'down' | 'refresh' | 'alert' | 'download' | 'star'
export function StageElevenIcon({ name, size = 20, color = t.text, filled = false }: {
  name: StageElevenIconName; size?: number; color?: string; filled?: boolean
}) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    {name === 'check' && <Path d="m5 12 4.5 4.5L19 7" {...stroke} strokeWidth={2.5}/>}
    {name === 'back' && <Path d="m14 5-7 7 7 7M7 12h13" {...stroke}/>}
    {name === 'bank' && <><Path d="m3 8 9-5 9 5H3ZM3 21h18M5 18V11m5 7v-7m4 7v-7m5 7v-7" {...stroke}/></>}
    {name === 'wallet' && <><Path d="M4 6V5l14-2v3M4 6h15a2 2 0 0 1 2 2v11H5a3 3 0 0 1-3-3V9a3 3 0 0 1 2-3Z" {...stroke} fill={filled ? color : 'none'}/><Path d="M21 10h-5a3 3 0 0 0 0 6h5" {...stroke} stroke={filled ? '#fff' : color}/><Circle cx={17} cy={13} r={.9} fill={filled ? '#fff' : color}/></>}
    {name === 'receipt' && <><Path d="M5 3h9l5 5v13H5Z" {...stroke} fill={filled ? color : 'none'}/><Path d="M14 3v6h5M8 13h8m-8 4h6" {...stroke} stroke={filled ? '#fff' : color}/></>}
    {name === 'briefcase' && <><Rect x={3} y={7} width={18} height={14} rx={3} {...stroke} fill={filled ? color : 'none'}/><Path d="M8 7V4h8v3M3 12c5 3 13 3 18 0m-9 0v3" {...stroke} stroke={filled ? '#fff' : color}/></>}
    {name === 'pin' && <><Path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0Z" {...stroke}/><Circle cx={12} cy={10} r={2.5} {...stroke}/></>}
    {name === 'user' && <><Circle cx={12} cy={7} r={3.5} {...stroke}/><Path d="M4 21v-3c0-5 16-5 16 0v3H4Z" {...stroke}/></>}
    {name === 'calendar' && <><Rect x={3} y={5} width={18} height={16} rx={2.5} {...stroke}/><Path d="M7 3v5m10-5v5M3 10h18" {...stroke}/></>}
    {name === 'clock' && <><Circle cx={12} cy={12} r={9} {...stroke}/><Path d="M12 6v6l4 3" {...stroke}/></>}
    {name === 'copy' && <><Rect x={8} y={7} width={12} height={14} rx={2} {...stroke}/><Path d="M15 7V3H4v14h4" {...stroke}/></>}
    {name === 'coins' && <><Path d="M4 6c0-4 16-4 16 0s-16 4-16 0Zm0 0v5c0 4 16 4 16 0V6M4 11v5c0 4 16 4 16 0v-5M4 16v3c0 4 16 4 16 0v-3" {...stroke}/></>}
    {name === 'home' && <Path d="m2 11 10-8 10 8-2 1v9h-6v-7h-4v7H4v-9Z" {...stroke} fill={filled ? color : 'none'}/>}
    {name === 'sprout' && <><Path d="M12 22V12M12 13C3 13 2 7 3 3c6 0 10 3 9 10ZM12 13c0-8 4-11 10-10 0 7-4 10-10 10Z" {...stroke} fill={filled ? color : 'none'}/></>}
    {name === 'down' && <Path d="m6 9 6 6 6-6" {...stroke}/>}
    {name === 'refresh' && <><Path d="M20 5v6h-6M4 19v-6h6M5 8a8 8 0 0 1 15 3M4 13a8 8 0 0 0 15 3" {...stroke}/></>}
    {name === 'alert' && <><Circle cx={12} cy={12} r={9} {...stroke}/><Path d="M12 6v7" {...stroke}/><Circle cx={12} cy={17} r={1} fill={color}/></>}
    {name === 'download' && <Path d="M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5" {...stroke}/>}
    {name === 'star' && <Path d="m12 2 3 6.3 7 .9-5.1 5 1.3 7L12 18l-6.2 3.2 1.3-7L2 9.2l7-.9Z" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.1} strokeLinejoin="round"/>}
  </Svg>
}
