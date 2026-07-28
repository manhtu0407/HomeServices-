import { Platform, type TextStyle, type ViewStyle } from 'react-native'

export const customerV21WebTextInputNoOutline = Platform.select({
  web: {
    boxShadow: 'none',
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as TextStyle,
  default: null,
})

export const customerV21HiddenScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
  } as unknown as ViewStyle,
  default: null,
})

export const customerV21HiddenTextInputScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    overflow: 'hidden',
    resize: 'none',
    scrollbarWidth: 'none',
  } as unknown as TextStyle,
  default: null,
})

export const customerV21InvisibleTextInputScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    resize: 'none',
    scrollbarWidth: 'none',
  } as unknown as TextStyle,
  default: null,
})
