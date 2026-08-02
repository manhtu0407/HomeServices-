import { memo } from 'react'
import { Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import {
  activeKaelResponseBlockId,
  type KaelResponseBlock,
  type KaelResponseStreamState,
} from '@/lib/kael-response-stream'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ChatStyles as styles } from './chat-styles'
import { KaelLiquidReveal } from './kael-liquid-reveal'

export function KaelResponseSurface({
  language,
  reduceMotion,
  state,
  testID,
  tokens,
}: {
  language: AppLanguage
  reduceMotion: boolean
  state: KaelResponseStreamState
  testID?: string
  tokens: CustomerThemeTokens
}) {
  const activeBlockId = activeKaelResponseBlockId(state)
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
      <Text style={[styles.kaelResponseLabel, { color: tokens.primary }]}>Kael</Text>
      <View style={[styles.kaelResponseRail, { borderLeftColor: tokens.primary }]}>
        {state.blockOrder.map((blockId, index) => {
          const block = state.blocks[blockId]
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
      ) : (
        <View style={block.kind === 'callout'
          ? [styles.kaelResponseCallout, { backgroundColor: tokens.service, borderColor: tokens.border }]
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
