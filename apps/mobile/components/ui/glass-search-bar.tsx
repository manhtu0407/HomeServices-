import { StyleSheet, type TextInputProps } from 'react-native'
import { GlassSurface } from './glass-surface'
import { KaelTextField } from './kael-primitives'
import type { GlassMode } from './tokens'

type GlassSearchBarProps = TextInputProps & {
  mode?: GlassMode
}

export function GlassSearchBar({ mode = 'light', style, ...inputProps }: GlassSearchBarProps) {
  return (
    <GlassSurface mode={mode} variant="control">
      <KaelTextField
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? inputProps.placeholder}
        inputShellStyle={styles.inputShell}
        mode="search"
        shellStyle={styles.fieldShell}
        style={style}
      />
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  fieldShell: { gap: 0 },
  inputShell: { backgroundColor: 'transparent', borderWidth: 0, minHeight: 44, paddingHorizontal: 0 },
})
