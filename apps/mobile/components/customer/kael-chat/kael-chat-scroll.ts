import type { NativeScrollEvent } from 'react-native'

type ChatScrollMetrics = Pick<
  NativeScrollEvent,
  'contentOffset' | 'contentSize' | 'layoutMeasurement'
>

export function isChatNearBottom(event: ChatScrollMetrics, threshold = 72) {
  const distance = event.contentSize.height - event.layoutMeasurement.height - event.contentOffset.y
  return distance <= threshold
}
