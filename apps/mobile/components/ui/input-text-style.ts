import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'

// iOS builds a TextInput's placeholder and its typed text through two paths, and only the typed
// text gets the baseline offset that a lineHeight taller than the font's own line adds. An input
// that carries lineHeight therefore draws the two at different heights. Inputs size from the
// font's natural line instead, so every path lands on the same baseline.
export function withoutInputLineHeight(style: StyleProp<TextStyle>): TextStyle {
  const flat: TextStyle = { ...StyleSheet.flatten(style) }
  delete flat.lineHeight
  return flat
}
