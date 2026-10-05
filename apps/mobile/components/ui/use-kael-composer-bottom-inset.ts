import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// The Kael chat screens leave the bottom edge out of their SafeAreaView and pad the composer
// here instead. The disclaimer under the composer is plain text, so on iPhone it may sit inside
// the home-indicator inset, just clear of the indicator, rather than above the whole inset.
export const KAEL_COMPOSER_IOS_INDICATOR_CLEARANCE = 18
export const KAEL_COMPOSER_MIN_BOTTOM_GAP = 8

export function kaelComposerBottomPadding(insetBottom: number, keyboardVisible: boolean, os: string) {
  if (keyboardVisible || insetBottom <= 0) return KAEL_COMPOSER_MIN_BOTTOM_GAP
  // Android's inset is the navigation bar, which text must never sit under.
  if (os !== 'ios') return insetBottom + KAEL_COMPOSER_MIN_BOTTOM_GAP
  return Math.max(Math.min(insetBottom, KAEL_COMPOSER_IOS_INDICATOR_CLEARANCE), KAEL_COMPOSER_MIN_BOTTOM_GAP)
}

export function useKaelComposerBottomInset() {
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return kaelComposerBottomPadding(insets.bottom, keyboardVisible, Platform.OS)
}
