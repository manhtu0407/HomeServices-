import { typography } from '@/design/theme'
import type { ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { CustomerThemeTokens } from '../customer-theme'
import { KaelPhaseAvatar } from './kael-phase-avatar'
import type { CaseWorkResponseModel } from './case-work-response-model'
import { KaelLiquidReveal } from './kael-liquid-reveal'

const AVATAR_SIZE = 56
const RESPONSE_PADDING_X = 4

// Where the note rail starts inside a response row: under the avatar's centre, so the rail reads as hanging
// from Kael and a surface that follows the header lines up with it.
export const CASE_WORK_CONTENT_INSET = AVATAR_SIZE / 2
// Space between the rail and the text beside it, shared by every surface drawn on the rail.
export const CASE_WORK_RAIL_PADDING = 16
export const CASE_WORK_ROW_STYLE = { alignSelf: 'center', maxWidth: 680, paddingHorizontal: RESPONSE_PADDING_X, width: '100%' } as const

export function caseWorkAccentLine(tokens: Pick<CustomerThemeTokens, 'mode'>) {
  return tokens.mode === 'dark' ? 'rgba(122,243,223,0.62)' : '#9fd7cc'
}

export function CaseWorkResponse({
  controls,
  details,
  hideNoteSummary = false,
  model,
  reduceMotion,
  testID = 'customer-v21-case-work-response',
  tokens,
}: {
  controls?: ReactNode
  details?: ReactNode
  hideNoteSummary?: boolean
  model: CaseWorkResponseModel
  reduceMotion: boolean
  testID?: string
  tokens: CustomerThemeTokens
}) {
  const { width } = useWindowDimensions()
  const compact = width <= 560
  const accentLine = caseWorkAccentLine(tokens)

  return (
    <KaelLiquidReveal
      accessible={false}
      reduceMotion={reduceMotion}
      style={styles.response}
      testID={testID}
    >
      <View style={styles.header} testID={`${testID}-header`}>
        <KaelPhaseAvatar reduceMotion={reduceMotion} size={AVATAR_SIZE} testID={`${testID}-avatar`} />
        <View style={styles.headerCopy}>
          <Text
            accessibilityRole="header"
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.3}
            minimumFontScale={0.8}
            numberOfLines={1}
            style={[compact ? styles.titleCompact : styles.titleWide, { color: tokens.text }]}
            testID="customer-v21-case-work-response-title"
          >
            {model.title}
          </Text>
          <Text
            accessibilityLabel={`${model.status}`}
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={[styles.status, { color: tokens.primary }]}
            testID="customer-v21-case-work-response-status"
          >
            {model.status}
          </Text>
        </View>
      </View>

      <View
        accessible={!details && !controls}
        accessibilityLabel={hideNoteSummary ? undefined : `${model.noteTitle}. ${model.noteCopy}`}
        style={[styles.note, { borderLeftColor: accentLine }]}
        testID="customer-v21-case-work-response-note"
      >
        {!hideNoteSummary ? (
          <>
            <Text style={[styles.noteTitle, { color: tokens.primary }]}>{model.noteTitle}</Text>
            <Text
              style={[styles.noteCopy, { color: tokens.muted }]}
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: AVATAR_SIZE,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  note: {
    borderLeftWidth: 2,
    marginLeft: CASE_WORK_CONTENT_INSET,
    marginTop: 18,
    maxWidth: 608,
    paddingLeft: CASE_WORK_RAIL_PADDING,
  },
  noteCopy: {
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
    paddingHorizontal: RESPONSE_PADDING_X,
    paddingVertical: 8,
    width: '100%',
  },
  status: {
    ...typography.footnote,
    fontWeight: '600',
  },
  // One line on a real device: the copy is kept short, and adjustsFontSizeToFit absorbs what is left (a long
  // request subject, large system text) before numberOfLines truncates.
  titleCompact: {
    ...typography.headline,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  titleWide: {
    ...typography.title3,
    fontWeight: '600',
  },
})
