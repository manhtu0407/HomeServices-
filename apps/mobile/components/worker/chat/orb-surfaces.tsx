import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { formatKaelResponseText } from '@/lib/kael-response-stream'
import { useWorkerKaelOrbPalette } from './orb-palette'
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
  const palette = useWorkerKaelOrbPalette()
  // Dark replaces the light bubble and reply colours with the neutral dark tokens.
  const dark = palette.mode === 'dark'
  const replyColor = dark ? { color: palette.ink } : null
  return (
    <View
      accessibilityLabel={speakerLabel}
      style={bareKaelReply
        ? styles.kaelOrbBareReply
        : [styles.kaelOrbBubble, align === 'right' ? styles.kaelOrbBubbleRight : styles.kaelOrbBubbleLeft, dark ? (align === 'right' ? { backgroundColor: palette.accent, borderColor: palette.accent } : { backgroundColor: palette.bubbleLeftFill, borderColor: palette.bubbleLeftBorder }) : null]}
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
                <Text style={[styles.kaelOrbBareReplyBulletMarker, dark ? { color: palette.accent } : null]}>{'\u2022'}</Text>
                <Text style={[styles.kaelOrbBareReplyBulletText, replyColor]}>{item.text}</Text>
              </View>
            ) : (
              <Text key={key} style={[styles.kaelOrbBareReplyText, replyColor]}>{item.text}</Text>
            )
          })}
        </View>
      ) : (
        <Text
          style={[
            styles.kaelOrbBubbleText,
            align === 'right' ? styles.kaelOrbBubbleTextRight : null,
            strongFirstLine ? styles.kaelOrbBubbleTextStrong : null,
            dark ? { color: align === 'right' ? palette.tokens.primaryText : palette.ink } : null,
          ]}
        >
          {body}
        </Text>
      )}
    </View>
  )
}
