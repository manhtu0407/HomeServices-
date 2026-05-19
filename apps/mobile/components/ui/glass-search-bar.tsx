import { TextInput, type TextInputProps } from 'react-native'
import { GlassSurface } from './glass-surface'
import type { GlassMode } from './tokens'

type GlassSearchBarProps = TextInputProps & {
  mode?: GlassMode
}

export function GlassSearchBar({ mode = 'light', style, ...inputProps }: GlassSearchBarProps) {
  return (
    <GlassSurface mode={mode} variant="control">
      <TextInput {...inputProps} accessibilityLabel={inputProps.accessibilityLabel ?? inputProps.placeholder} style={style} />
    </GlassSurface>
  )
}
