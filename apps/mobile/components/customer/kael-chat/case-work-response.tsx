import { typography } from '@/design/theme'
import type { ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native'

import type { CustomerThemeTokens } from '../customer-theme'
import { KaelChatMascot } from './kael-chat-mascot'
import type { CaseWorkResponseModel } from './case-work-response-model'
import { KaelLiquidReveal } from './kael-liquid-reveal'

export function CaseWorkResponse({
  controls,
  details,
  hideNoteSummary = false,
  model,
  reduceMotion,
  testID = 'customer-v21-case-work-response',
  titleStyle,
  tokens,
}: {
  controls?: ReactNode
  details?: ReactNode
  hideNoteSummary?: boolean
  model: CaseWorkResponseModel
  reduceMotion: boolean
  testID?: string
  titleStyle?: StyleProp<TextStyle>
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
      <View style={styles.responseIdentity}>
        <KaelChatMascot
          reduceMotion={reduceMotion}
          size={42}
          testID={`${testID}-mascot`}
        />
        <View style={styles.responseContent}>
          <View style={[styles.summary, compact ? styles.summaryCompact : null]}>
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                compact ? styles.titleCompact : styles.titleWide,
                titleStyle,
                { color: tokens.text },
              ]}
              testID="customer-v21-case-work-response-title"
            >
              {model.title}
            </Text>
            <Text
              accessibilityLabel={`${model.status}`}
              accessibilityLiveRegion="polite"
              style={[styles.status, compact ? styles.statusCompact : null, { color: tokens.muted }]}
              testID="customer-v21-case-work-response-status"
            >
              {model.status}
            </Text>
          </View>

          <View
            accessible={!details && !controls}
            accessibilityLabel={hideNoteSummary ? undefined : `${model.noteTitle}. ${model.noteCopy}`}
            style={[
              styles.note,
              compact ? styles.noteCompact : null,
              { borderLeftColor: accentLine },
            ]}
            testID="customer-v21-case-work-response-note"
          >
            {!hideNoteSummary ? (
              <>
                <Text style={[styles.noteTitle, { color: tokens.primary }]}>{model.noteTitle}</Text>
                <Text
                  style={[styles.noteCopy, compact ? styles.noteCopyCompact : null, { color: tokens.muted }]}
                  testID="customer-v21-case-work-response-note-copy"
                >
                  {model.noteCopy}
                </Text>
              </>
            ) : null}
            {details ? <View style={styles.details}>{details}</View> : null}
            {controls ? (
              <View accessible={false} style={styles.controls} testID="customer-v21-case-work-response-controls">
                {controls}
              </View>
            ) : null}
          </View>
        </View>
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
    ...typography.body,
  },
  noteCopyCompact: {
    ...typography.body,
  },
  noteTitle: {
    ...typography.subheadline,
    fontWeight: '600',
    marginBottom: 7,
  },
  response: {
    alignSelf: 'center',
    maxWidth: 680,
    paddingHorizontal: 4,
    paddingVertical: 8,
    width: '100%',
  },
  responseContent: {
    flex: 1,
    minWidth: 0,
  },
  responseIdentity: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  status: {
    flexShrink: 0,
    ...typography.footnote,
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
    ...typography.title2,
    fontWeight: '600',
    maxWidth: 512,
  },
  titleCompact: {
    flexBasis: 'auto',
    flexGrow: 0,
    ...typography.title2,
  },
  titleWide: {
    flexBasis: 0,
    flexGrow: 1,
  },
})
