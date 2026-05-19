import { type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { createGlassSurfaceStyle, type GlassMode, type GlassVariant } from './tokens'

type GlassSurfaceProps = {
  backgroundColor?: string
  borderColor?: string
  children: ReactNode
  mode?: GlassMode
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: GlassVariant
}

export function GlassSurface({ backgroundColor, borderColor, children, mode = 'light', style, testID, variant = 'subtle' }: GlassSurfaceProps) {
  const { reduceTransparency } = useGlassAccessibility()

  return (
    <View
      style={[
        styles.surface,
        createGlassSurfaceStyle({ backgroundColor, borderColor, mode, reduceTransparency, variant }),
        style,
      ]}
      testID={testID}
    >
      {reduceTransparency ? null : <View pointerEvents="none" style={styles.edgeHighlight} />}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  edgeHighlight: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    height: 1,
    left: 14,
    opacity: 0.62,
    position: 'absolute',
    right: 14,
    top: 1,
    zIndex: 1,
  },
  surface: {
    position: 'relative',
  },
})
