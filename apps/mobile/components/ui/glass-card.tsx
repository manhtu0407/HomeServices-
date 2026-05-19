import { type ReactNode } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { GlassSurface } from './glass-surface'
import type { GlassMode } from './tokens'

type GlassCardProps = {
  children: ReactNode
  mode?: GlassMode
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function GlassCard({ children, mode = 'light', style, testID }: GlassCardProps) {
  return (
    <GlassSurface mode={mode} style={style} testID={testID} variant="hero">
      {children}
    </GlassSurface>
  )
}
