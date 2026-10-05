import { useState } from 'react'
import { Platform, type TextInputProps, type TextStyle } from 'react-native'

export const KAEL_COMPOSER_MIN_HEIGHT = 44
export const KAEL_COMPOSER_MAX_HEIGHT = 124

type KaelComposerInputSizing = {
  inputStyle: TextStyle
  onContentSizeChange: TextInputProps['onContentSizeChange']
  returnKeyType: TextInputProps['returnKeyType']
  scrollEnabled: boolean
  submitBehavior: TextInputProps['submitBehavior']
}

// Native multiline inputs size themselves to their text, so they get only a min/max bound
// and keep scrolling enabled. Pinning a measured height there is what broke iOS: a fixed-height
// text view with scrolling off reports its own frame as the content size, so it never grew and
// pushed earlier lines out of view. Web inputs do not grow on their own, so web keeps the
// measured height. Return inserts a line on native; on web Enter sends and Shift+Enter breaks.
export function useKaelComposerInputSizing(draft: string): KaelComposerInputSizing {
  // Measurement survives edits that keep the line count: native fires no new contentSize
  // event for them, and web can fire it before the new draft renders.
  const [measured, setMeasured] = useState({ hasDraft: Boolean(draft), height: KAEL_COMPOSER_MIN_HEIGHT })
  if (measured.hasDraft !== Boolean(draft)) {
    setMeasured({ hasDraft: Boolean(draft), height: draft ? measured.height : KAEL_COMPOSER_MIN_HEIGHT })
  }

  if (Platform.OS !== 'web') {
    return {
      inputStyle: { maxHeight: KAEL_COMPOSER_MAX_HEIGHT, minHeight: KAEL_COMPOSER_MIN_HEIGHT },
      onContentSizeChange: undefined,
      returnKeyType: 'default',
      scrollEnabled: true,
      submitBehavior: 'newline',
    }
  }

  const height = draft ? measured.height : KAEL_COMPOSER_MIN_HEIGHT
  return {
    inputStyle: { height },
    onContentSizeChange: (event) => {
      const next = Math.min(Math.max(event.nativeEvent.contentSize.height, KAEL_COMPOSER_MIN_HEIGHT), KAEL_COMPOSER_MAX_HEIGHT)
      setMeasured((current) => ({ ...current, height: next }))
    },
    returnKeyType: 'send',
    scrollEnabled: height >= KAEL_COMPOSER_MAX_HEIGHT,
    submitBehavior: 'submit',
  }
}
