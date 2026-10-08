import { memo } from 'react'
import { Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import {
  activeKaelResponseBlockId,
  formatKaelResponseText,
  type KaelResponseBlock,
  type KaelResponseStreamState,
} from '@/lib/kael-response-stream'
import { useKaelResponseStreamPresentation } from '@/components/ui/use-kael-respond-stream-presentation'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ChatStyles as styles } from './chat-styles'
import { KaelChatMascot } from './kael-chat-mascot'
import { KaelLiquidReveal } from './kael-liquid-reveal'

export function KaelResponseSurface({
  language,
  onPresentationSettled,
  reduceMotion,
  revealOnMount,
  state,
  testID,
  tokens,
}: {
  language: AppLanguage
  onPresentationSettled?: (responseId: string) => void
  reduceMotion: boolean
  /** Set on the live reply only; a stored turn renders complete. */
  revealOnMount?: boolean
  state: KaelResponseStreamState
  testID?: string
  tokens: CustomerThemeTokens
}) {
  const presentationState = useKaelResponseStreamPresentation(state, {
    onSettled: onPresentationSettled,
    reduceMotion,
    revealOnMount,
  })
  const activeBlockId = activeKaelResponseBlockId(presentationState)
  const streaming = state.status === 'streaming'

  return (
    <View
      accessibilityLabel={streaming
        ? (language === 'vi' ? 'Kael \u0111ang ph\u1ea3n h\u1ed3i' : 'Kael is responding')
        : undefined}
      accessibilityLiveRegion={streaming ? 'polite' : undefined}
      accessibilityState={streaming ? { busy: true } : undefined}
      accessible={streaming || undefined}
      style={styles.kaelResponse}
      testID={testID}
    >
      <View style={styles.kaelResponseIdentity}>
        <KaelChatMascot
          motion={streaming ? 'live' : 'static'}
          reduceMotion={reduceMotion}
          size={36}
          testID={testID ? `${testID}-mascot` : undefined}
        />
        <View style={styles.kaelResponseContent}>
          {presentationState.blockOrder.map((blockId, index) => {
            const block = presentationState.blocks[blockId]
            if (!block || (!block.text && blockId !== activeBlockId)) return null
            return (
              <KaelResponseBlockView
                block={block}
                index={index}
                key={blockId}
                reduceMotion={reduceMotion}
                tokens={tokens}
              />
            )
          })}
        </View>
      </View>
    </View>
  )
}

const KaelResponseBlockView = memo(function KaelResponseBlockView({
  block,
  index,
  reduceMotion,
  tokens,
}: {
  block: KaelResponseBlock
  index: number
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  return (
    <KaelLiquidReveal
      reduceMotion={reduceMotion}
      style={styles.kaelResponseBlock}
      testID={`customer-v21-kael-response-block-${index}`}
    >
      {block.kind === 'list' ? (
        <KaelResponseList block={block} tokens={tokens} />
      ) : block.kind === 'paragraph' ? (
        <KaelResponseParagraph block={block} tokens={tokens} />
      ) : (
        <View style={block.kind === 'callout'
          ? [styles.kaelResponseCallout, { backgroundColor: 'transparent', borderColor: 'transparent' }]
          : null}
        >
          <Text
            style={[
              block.kind === 'heading' ? styles.kaelResponseHeading : styles.kaelResponseText,
              { color: block.kind === 'callout' ? tokens.muted : tokens.text },
            ]}
          >
            {displayBlockText(block)}
          </Text>
        </View>
      )}
    </KaelLiquidReveal>
  )
})

function KaelResponseParagraph({ block, tokens }: {
  block: KaelResponseBlock
  tokens: CustomerThemeTokens
}) {
  const occurrenceByItem = new Map<string, number>()
  return (
    <View style={styles.kaelResponseProse}>
      {formatKaelResponseText(block.text).map((item) => {
        const itemId = `${item.kind}:${item.text}`
        const occurrence = occurrenceByItem.get(itemId) ?? 0
        occurrenceByItem.set(itemId, occurrence + 1)
        const key = `${block.id}:${itemId}:${occurrence}`
        return item.kind === 'bullet' ? (
          <View key={key} style={styles.kaelResponseListRow}>
            <Text style={[styles.kaelResponseListMarker, { color: tokens.primary }]}>{'\u2022'}</Text>
            <Text style={[styles.kaelResponseListText, { color: tokens.text }]}>{item.text}</Text>
          </View>
        ) : (
          <Text
            key={key}
            style={[styles.kaelResponseText, { color: tokens.text }]}
          >
            {item.text}
          </Text>
        )
      })}
    </View>
  )
}

function KaelResponseList({ block, tokens }: {
  block: KaelResponseBlock
  tokens: CustomerThemeTokens
}) {
  const items = block.text.split('\n').filter((line) => line.trim().length > 0)
  const occurrenceByLine = new Map<string, number>()
  return (
    <View style={styles.kaelResponseList}>
      {items.map((line) => {
        const parsed = parseListLine(line)
        const occurrence = occurrenceByLine.get(line) ?? 0
        occurrenceByLine.set(line, occurrence + 1)
        return (
          <View key={`${block.id}:item:${line}:${occurrence}`} style={styles.kaelResponseListRow}>
            <Text style={[styles.kaelResponseListMarker, { color: tokens.primary }]}>{parsed.marker}</Text>
            <Text style={[styles.kaelResponseListText, { color: tokens.text }]}>
              {parsed.text}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function displayBlockText(block: KaelResponseBlock) {
  if (block.kind === 'heading') return block.text.replace(/^\s*#{1,3}\s+/gmu, '')
  if (block.kind === 'callout') return block.text.replace(/^\s*>\s?/gmu, '')
  return block.text
}

function parseListLine(line: string) {
  const match = line.match(/^\s*((?:[-*\u2022]|\d+[.)]))\s+(.*)$/u)
  if (!match) return { marker: '\u2022', text: line.trim() }
  const ordered = /^\d/u.test(match[1])
  return { marker: ordered ? match[1] : '\u2022', text: match[2] }
}
