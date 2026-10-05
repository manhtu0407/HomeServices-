import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { PrimaryCtaFill } from '@/components/ui/primary-cta-fill'

export type StageFourIconName =
  | 'building'
  | 'car'
  | 'chat'
  | 'chevron'
  | 'clock'
  | 'home'
  | 'image'
  | 'layers'
  | 'locate'
  | 'note'
  | 'person'
  | 'phone'
  | 'pin'
  | 'route'
  | 'send'
  | 'share'
  | 'traffic'

export function StageFourGradientFill({ testID }: { testID?: string }) {
  return <PrimaryCtaFill radius={0} testID={testID} />
}

export function StageFourIcon({ color, name, size }: { color: string; name: StageFourIconName; size: number }) {
  const strokeProps = { fill: 'none' as const, stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.8 }
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {name === 'building' ? <>
          <Path d="M5 20V4.5c0-.8.7-1.5 1.5-1.5h7c.8 0 1.5.7 1.5 1.5V20" {...strokeProps} />
          <Path d="M3 20h18M9 7h1M12 7h1M9 10h1M12 10h1M9 13h1M12 13h1M9 16h1M12 16h1" {...strokeProps} />
        </>
        : name === 'car' ? <>
          <Path d="m5.1 10.4 1.5-4.1c.2-.6.8-1 1.4-1h8c.6 0 1.2.4 1.4 1l1.5 4.1" {...strokeProps} />
          <Rect height={6.8} rx={1.7} width={16.4} x={3.8} y={9.5} {...strokeProps} />
          <Path d="M6.5 16.3v1.4M17.5 16.3v1.4M6 12.7h.1M18 12.7h.1" {...strokeProps} />
        </>
        : name === 'chat' ? <>
          <Path d="M4.5 5.5h15v9.2h-8l-4.5 3v-3h-2.5v-9.2Z" {...strokeProps} />
          <Path d="M8 9.8h.1M12 9.8h.1M16 9.8h.1" {...strokeProps} />
        </>
        : name === 'chevron' ? <Path d="m9 5 7 7-7 7" {...strokeProps} />
        : name === 'clock' ? <>
          <Circle cx="12" cy="12" r="8.1" {...strokeProps} />
          <Path d="M12 7.5v4.8l3.1 1.8" {...strokeProps} />
        </>
        : name === 'home' ? <Path d="m2 10 10-8 10 8M5 9v12h5v-7h4v7h5V9" {...strokeProps} />
        : name === 'image' ? <>
          <Rect height="15" rx="2.6" width="17" x="3.5" y="4.5" {...strokeProps} />
          <Circle cx="9" cy="9.6" r="1.6" {...strokeProps} />
          <Path d="m4 17.2 4.6-4.4a1.3 1.3 0 0 1 1.8 0l3.4 3.3m-1.6-1.6 2.1-2a1.3 1.3 0 0 1 1.8 0l3.9 3.7" {...strokeProps} />
        </>
        : name === 'layers' ? <>
          <Path d="m4 8 8-4 8 4-8 4-8-4Z" {...strokeProps} />
          <Path d="m4 12 8 4 8-4M4 16l8 4 8-4" {...strokeProps} />
        </>
        : name === 'locate' ? <>
          <Circle cx="12" cy="12" r="5.6" {...strokeProps} />
          <Circle cx="12" cy="12" fill={color} r="1.5" />
          <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" {...strokeProps} />
        </>
        : name === 'note' ? <>
          <Rect height="16" rx="2" width="14.5" x="4.75" y="4" {...strokeProps} />
          <Path d="M8 8h8M8 11.5h8M8 15h5" {...strokeProps} />
        </>
        : name === 'person' ? <>
          <Circle cx="12" cy="8" r="3" {...strokeProps} />
          <Path d="M5.5 20c.7-3.2 3.1-5 6.5-5s5.8 1.8 6.5 5" {...strokeProps} />
        </>
        : name === 'phone' ? <Path d="M7.2 4.6 9.4 4l1.4 4-1.8 1.4a14.7 14.7 0 0 0 5.6 5.6l1.4-1.8 4 1.4-.6 2.2c-.3 1.1-1.4 1.8-2.5 1.5C10.9 17 7 13.1 5.7 6.9c-.3-1.1.4-2.2 1.5-2.3Z" {...strokeProps} />
        : name === 'pin' ? <>
          <Path d="M12 21s6-6.1 6-11.2A6 6 0 0 0 6 9.8C6 14.9 12 21 12 21Z" {...strokeProps} />
          <Circle cx="12" cy="9.5" r="2" {...strokeProps} />
        </>
        : name === 'route' ? <>
          <Path d="M4 7v10M20 7v10M7 12h10" {...strokeProps} />
          <Path d="M9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5" {...strokeProps} />
        </>
        : name === 'send' ? <Path d="m4 12 16-8-4.2 16-4.1-5.8L4 12Zm7.7 2.2L20 4" {...strokeProps} />
        : name === 'share' ? <>
          <Circle cx="6" cy="12" r="2" {...strokeProps} />
          <Circle cx="17.5" cy="5.5" r="2" {...strokeProps} />
          <Circle cx="17.5" cy="18.5" r="2" {...strokeProps} />
          <Path d="m7.7 11 7.9-4.5M7.7 13l7.9 4.5" {...strokeProps} />
        </>
        : <Path d="M5 19V13M10 19V9M15 19V5M20 19v-8" {...strokeProps} />}
    </Svg>
  )
}
