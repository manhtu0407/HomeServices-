import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { formatKaelResponseText } from '@/lib/kael-response-stream'
import { styles } from './orb-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}
export function WorkerV5KaelOrbBubble({
  align,
  appearance = 'bubble',
  body,
  speakerLabel,
  strongFirstLine = false,
}: {
  align?: 'right'
  appearance?: 'bare' | 'bubble'
  body?: string
  speakerLabel: string
  strongFirstLine?: boolean
}) {
  const bareKaelReply = appearance === 'bare' && align !== 'right'
  const responseItems = bareKaelReply ? formatKaelResponseText(body ?? '') : []
  const occurrenceByItem = new Map<string, number>()
  return (
    <View
      accessibilityLabel={speakerLabel}
      style={bareKaelReply
        ? styles.kaelOrbBareReply
        : [styles.kaelOrbBubble, align === 'right' ? styles.kaelOrbBubbleRight : styles.kaelOrbBubbleLeft]}
      testID={`worker-v5-kael-bubble-${align === 'right' ? 'worker' : 'kael'}`}
    >
      {bareKaelReply ? (
        <View style={styles.kaelOrbBareReplyContent}>
          {responseItems.map((item) => {
            const itemId = `${item.kind}:${item.text}`
            const occurrence = occurrenceByItem.get(itemId) ?? 0
            occurrenceByItem.set(itemId, occurrence + 1)
            const key = `${itemId}:${occurrence}`
            return item.kind === 'bullet' ? (
              <View key={key} style={styles.kaelOrbBareReplyBulletRow}>
                <Text style={styles.kaelOrbBareReplyBulletMarker}>{'\u2022'}</Text>
                <Text style={styles.kaelOrbBareReplyBulletText}>{item.text}</Text>
              </View>
            ) : (
              <Text key={key} style={styles.kaelOrbBareReplyText}>{item.text}</Text>
            )
          })}
        </View>
      ) : (
        <Text
          style={[
            styles.kaelOrbBubbleText,
            align === 'right' ? styles.kaelOrbBubbleTextRight : null,
            strongFirstLine ? styles.kaelOrbBubbleTextStrong : null,
          ]}
        >
          {body}
        </Text>
      )}
    </View>
  )
}
