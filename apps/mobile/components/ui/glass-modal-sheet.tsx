import { type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { GlassSurface } from './glass-surface'
import type { GlassMode } from './tokens'

type GlassModalSheetProps = {
  children: ReactNode
  mode?: GlassMode
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function GlassModalSheet({ children, mode = 'light', style, testID }: GlassModalSheetProps) {
  return (
    <GlassSurface mode={mode} style={[styles.sheet, style]} testID={testID} variant="sheet">
      <View pointerEvents="none" style={styles.handle} />
      {children}
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(117,139,134,0.46)',
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 42,
  },
  sheet: {
    padding: 18,
  },
})
