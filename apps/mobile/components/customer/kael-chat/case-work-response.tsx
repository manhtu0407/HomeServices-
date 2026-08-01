import type { ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { CustomerThemeTokens } from '../customer-theme'
import type { CaseWorkResponseModel } from './case-work-response-model'
import { KaelLiquidReveal } from './kael-liquid-reveal'

export function CaseWorkResponse({
  controls,
  details,
  model,
  reduceMotion,
  testID = 'customer-v21-case-work-response',
  tokens,
}: {
  controls?: ReactNode
  details?: ReactNode
  model: CaseWorkResponseModel
  reduceMotion: boolean
  testID?: string
  tokens: CustomerThemeTokens
}) {
  const { width } = useWindowDimensions()
  const compact = width <= 560
  const accentLine = tokens.mode === 'dark' ? 'rgba(122,243,223,0.62)' : '#9fd7cc'

  return (
    <KaelLiquidReveal
      accessible={false}
      reduceMotion={reduceMotion}
      style={styles.response}
      testID={testID}
    >
      <View style={[styles.summary, compact ? styles.summaryCompact : null]}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            compact ? styles.titleCompact : styles.titleWide,
            { color: tokens.text },
          ]}
          testID="customer-v21-case-work-response-title"
        >
          {model.title}
        </Text>
        <Text
          accessibilityLabel={`${model.status}`}
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={[styles.status, compact ? styles.statusCompact : null, { color: tokens.muted }]}
          testID="customer-v21-case-work-response-status"
        >
          {model.status}
        </Text>
      </View>

      <View
        accessible={!details && !controls}
        accessibilityLabel={`${model.noteTitle}. ${model.noteCopy}`}
        style={[
          styles.note,
          compact ? styles.noteCompact : null,
          { borderLeftColor: accentLine },
        ]}
        testID="customer-v21-case-work-response-note"
      >
        <Text style={[styles.noteTitle, { color: tokens.primary }]}>{model.noteTitle}</Text>
        <Text
          style={[styles.noteCopy, compact ? styles.noteCopyCompact : null, { color: tokens.muted }]}
          testID="customer-v21-case-work-response-note-copy"
        >
          {model.noteCopy}
        </Text>
        {details ? <View style={styles.details}>{details}</View> : null}
        {controls ? (
          <View accessible={false} style={styles.controls} testID="customer-v21-case-work-response-controls">
            {controls}
          </View>
        ) : null}
      </View>
    </KaelLiquidReveal>
  )
}

const styles = StyleSheet.create({
  controls: {
    gap: 10,
    marginTop: 22,
  },
  details: {
    gap: 9,
    marginTop: 18,
  },
  note: {
    borderLeftWidth: 2,
    marginTop: 29,
    maxWidth: 608,
    paddingLeft: 18,
  },
  noteCompact: {
    marginTop: 27,
    paddingLeft: 16,
  },
  noteCopy: {
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 26.35,
  },
  noteCopyCompact: {
    lineHeight: 26.52,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.07,
    lineHeight: 19,
    marginBottom: 7,
  },
  response: {
    alignSelf: 'center',
    maxWidth: 680,
    paddingHorizontal: 4,
    paddingVertical: 8,
    width: '100%',
  },
  status: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 5,
  },
  statusCompact: {
    marginTop: 0,
  },
  summary: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 40,
    justifyContent: 'space-between',
  },
  summaryCompact: {
    flexDirection: 'column',
    gap: 9,
  },
  title: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.36,
    lineHeight: 31.2,
    maxWidth: 512,
  },
  titleCompact: {
    flexBasis: 'auto',
    flexGrow: 0,
    fontSize: 21,
    letterSpacing: -0.25,
    lineHeight: 28.14,
  },
  titleWide: {
    flexBasis: 0,
    flexGrow: 1,
  },
})
