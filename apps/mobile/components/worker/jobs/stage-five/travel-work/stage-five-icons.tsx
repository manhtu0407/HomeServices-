import React from 'react'
import Svg, { Circle, Path, Rect, Line, G } from 'react-native-svg'
export type IconName = 'back'|'chevron'|'phone'|'chat'|'home'|'route'|'clock'|'car'|'traffic'|'send'|'share'|'bookmark'|'info'|'check'|'edit'|'pin'|'camera'|'note'|'warning'|'support'|'pause'|'play'|'layers'|'locate'|'close'|'refresh'
export function Icon({name,size=22,color='#009C87'}:{name:IconName;size?:number;color?:string}) {
 const paths:Partial<Record<IconName,React.ReactNode>>={
 back:<Path d="m14 5-7 7 7 7"/>,chevron:<Path d="m9 5 7 7-7 7"/>,
 phone:<Path d="M6 3 3.5 5c-1 1 0 5 4 9s8 6 10 5l3-2-5-4-2 2c-2-1-4-3-5-5l2-2-4-5Z"/>,
 chat:<><Path d="M4 4h16v12H9l-5 4V4Z"/><Circle cx="8" cy="10" r=".5"/><Circle cx="12" cy="10" r=".5"/><Circle cx="16" cy="10" r=".5"/></>,
 home:<><Path d="m2 10 10-8 10 8M5 9v12h5v-7h4v7h5V9"/></>,
 route:<><Circle cx="5" cy="18" r="3"/><Circle cx="18" cy="5" r="3"/><Path d="M6 15v-4h12V8"/></>,
 clock:<><Circle cx="12" cy="12" r="9"/><Path d="M12 6v6l4 3"/></>,
 car:<><Path d="M4 10 6 4h12l2 6M3 10h18v9H3zM5 19v2m14-2v2"/><Path d="M6 14h2m8 0h2"/></>,
 traffic:<><Rect x="3" y="12" width="3" height="9" rx=".8" fill={color} stroke="none"/><Rect x="10" y="6" width="3" height="15" rx=".8" fill={color} stroke="none"/><Rect x="17" y="2" width="3" height="19" rx=".8" fill={color} stroke="none"/></>,
 send:<><Path d="m3 9 18-6-6 18-4-8-8-4Z"/><Path d="m11 13 10-10"/></>,
 share:<><Circle cx="6" cy="12" r="3"/><Circle cx="18" cy="5" r="3"/><Circle cx="18" cy="19" r="3"/><Path d="m9 10 6-4m-6 8 6 4"/></>,
 bookmark:<><Path d="M5 3h14v19l-7-5-7 5V3Z"/><Path d="M8 7h8M8 10h8"/></>,
 info:<><Circle cx="12" cy="12" r="9"/><Path d="M12 11v6M12 7v.5"/></>,
 check:<Path d="m5 12 4 4L19 6"/>,edit:<><Path d="m5 14 10-10 4 4L9 18l-5 1 1-5ZM13 6l4 4M3 21h18"/></>,
 pin:<><Path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><Circle cx="12" cy="10" r="2.5"/></>,
 camera:<><Path d="M3 6h5l2-3h4l2 3h5v14H3V6Z"/><Circle cx="12" cy="13" r="4"/></>,
 note:<><Path d="M5 2h10l5 5v15H5V2ZM15 2v6h5M8 12h8M8 16h8M8 6h3"/></>,
 warning:<><Path d="M12 3 2 21h20L12 3Z"/><Path d="M12 9v5m0 3v1"/></>,
 support:<><Circle cx="10" cy="6" r="4"/><Path d="M2 22v-3a8 8 0 0 1 16 0v3m1-16v8m-4-4h8"/></>,
 pause:<><Rect x="6" y="4" width="4" height="16" rx="1" fill={color} stroke="none"/><Rect x="14" y="4" width="4" height="16" rx="1" fill={color} stroke="none"/></>,
 play:<Path d="m8 4 12 8-12 8V4Z" fill={color}/>,layers:<><Path d="m3 8 9-6 9 6-9 6-9-6Zm0 5 9 6 9-6M3 18l9 5 9-5"/></>,
 locate:<><Circle cx="12" cy="12" r="7"/><Circle cx="12" cy="12" r="3"/><Path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
 close:<Path d="m6 6 12 12M18 6 6 18"/>,refresh:<><Path d="M20 8V3l-4 4M4 16v5l4-4M20 8A9 9 0 0 0 5 5M4 16a9 9 0 0 0 15 3"/></>
 }
 return <Svg style={{position:'relative',zIndex:1}} width={size} height={size} viewBox="0 0 24 24" fill="none"><G stroke={color} strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</G></Svg>
}
