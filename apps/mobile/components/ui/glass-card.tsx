import { type ReactNode } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { GlassSurface } from './glass-surface'
import type { GlassMaterial, GlassMode } from './tokens'

type GlassCardProps = {
  children: ReactNode
  material?: GlassMaterial
  mode?: GlassMode
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function GlassCard({ children, material = 'standard', mode = 'light', style, testID }: GlassCardProps) {
  return (
    <GlassSurface material={material} mode={mode} style={style} testID={testID} variant="hero">
      {children}
    </GlassSurface>
  )
}
