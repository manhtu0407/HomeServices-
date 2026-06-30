import type { ReactNode } from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

export type EntryIconName =
  | 'arrow-right'
  | 'back'
  | 'check'
  | 'eye'
  | 'lock'
  | 'mail'
  | 'spark'
  | 'user'

export type ProviderBrand = 'facebook' | 'gmail' | 'google'

export function EntryIcon({ color = '#088779', name, size = 18 }: { color?: string; name: EntryIconName; size?: number }) {
  const common = { fill: 'none', stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.9 }
  let content: ReactNode

  switch (name) {
    case 'arrow-right':
      content = <Path d="m9 5 7 7-7 7" {...common} strokeWidth={2.1} />
      break
    case 'back':
      content = <Path d="m15 5-7 7 7 7" {...common} strokeWidth={2.1} />
      break
    case 'check':
      content = <Path d="m6 12.5 4 4L18 8" {...common} strokeWidth={2.4} />
      break
    case 'eye':
      content = (
        <>
          <Path d="M2.7 12s3.2-5.5 9.3-5.5 9.3 5.5 9.3 5.5-3.2 5.5-9.3 5.5S2.7 12 2.7 12Z" {...common} strokeWidth={1.7} />
          <Circle cx="12" cy="12" r="2.5" {...common} strokeWidth={1.7} />
        </>
      )
      break
    case 'lock':
      content = (
        <>
          <Rect x="4" y="10" width="16" height="11" rx="4" {...common} />
          <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" {...common} />
        </>
      )
      break
    case 'mail':
      content = (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="4" {...common} />
          <Path d="m5 8 7 5 7-5" {...common} />
        </>
      )
      break
    case 'spark':
      content = <Path d="M12 3c.7 4.7 3.3 7.3 8 8-4.7.7-7.3 3.3-8 8-.7-4.7-3.3-7.3-8-8 4.7-.7 7.3-3.3 8-8Z" fill={color} />
      break
    case 'user':
      content = (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" {...common} />
        </>
      )
      break
    default:
      content = null
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24">{content}</Svg>
}

export function ProviderBrandIcon({ provider, size = 18 }: { provider: ProviderBrand; size?: number }) {
  if (provider === 'google') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityLabel="Google">
        <Path d="M16.7 9.2c0-.6-.1-1.1-.2-1.6H9v3.1h4.3c-.2 1-.8 1.9-1.6 2.4v2h2.6c1.5-1.4 2.4-3.4 2.4-5.9Z" fill="#4285F4" />
        <Path d="M9 17c2.2 0 4-.7 5.3-1.9l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.5-3.3H1.8v2.1C3.1 15.2 5.8 17 9 17Z" fill="#34A853" />
        <Path d="M4.5 10.6c-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6V5.3H1.8C1.3 6.4 1 7.6 1 9s.3 2.6.8 3.7l2.7-2.1Z" fill="#FBBC05" />
        <Path d="M9 4.1c1.2 0 2.3.4 3.1 1.2l2.3-2.3C13 1.7 11.2 1 9 1 5.8 1 3.1 2.8 1.8 5.3l2.7 2.1C5.1 5.5 6.9 4.1 9 4.1Z" fill="#EA4335" />
      </Svg>
    )
  }

  if (provider === 'gmail') {
    return (
      <Svg width={size * 1.24} height={size * 0.93} viewBox="0 0 24 18" accessibilityLabel="Gmail">
        <Path d="M3 18h4V8.5L1 4v12c0 1.1.9 2 2 2Z" fill="#4285F4" />
        <Path d="M17 18h4c1.1 0 2-.9 2-2V4l-6 4.5V18Z" fill="#34A853" />
        <Path d="M17 4.5v4L23 4V3c0-2.5-2.9-3.9-4.8-2.4L17 1.5v3Z" fill="#FBBC04" />
        <Path d="M7 8.5v-4L12 8.25l5-3.75v4L12 12.25 7 8.5Z" fill="#EA4335" />
        <Path d="M1 3v1l6 4.5v-4L5.8.6C3.9-.8 1 .5 1 3Z" fill="#C5221F" />
      </Svg>
    )
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Facebook">
      <Circle cx="12" cy="12" r="11" fill="#1877F2" />
      <Path d="M13.5 20v-7h2.4l.36-2.75H13.5V8.5c0-.8.22-1.34 1.38-1.34h1.48V4.7c-.26-.04-1.14-.11-2.17-.11-2.15 0-3.62 1.31-3.62 3.72v1.94H8.14V13h2.43v7h2.93Z" fill="#FFFFFF" />
    </Svg>
  )
}
