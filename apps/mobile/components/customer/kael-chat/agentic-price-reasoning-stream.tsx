import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'

import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'

export function AgenticPriceReasoningStream({
  model,
  tokens,
}: {
  model: AgenticEstimateSupportingPhaseModel
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const accessibilityLabel = `${model.title}. ${model.rows.map((row) => `${row.label}: ${accessibleRowDetail(row)}`).join('. ')}. ${model.valueStatement}`

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[styles.surface, { borderColor: tokens.border }]}
      testID="customer-v21-agentic-estimate-supporting-phase"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.primary }]}>
        {model.title}
      </Text>
      {model.rows.map((row) => {
        const structured = Boolean(row.sections?.length)
        return (
          <View
            key={row.key}
            style={[
              styles.row,
              row.mediaUrl ? styles.evidenceRow : null,
              structured ? styles.structuredRow : null,
            ]}
            testID={`customer-v21-agentic-estimate-support-${row.key}`}
          >
            {row.mediaUrl ? (
              <View
                style={styles.evidenceHeader}
                testID={`customer-v21-agentic-estimate-support-${row.key}-header`}
              >
                <Text style={[styles.label, { color: tokens.primary }]}>
                  {row.label}
                </Text>
                <EvidencePreview
                  label={row.label}
                  mediaUrl={row.mediaUrl}
                  testID={`customer-v21-agentic-estimate-support-${row.key}-preview`}
                  tokens={tokens}
                />
              </View>
            ) : (
              <Text style={[styles.label, { color: tokens.primary }]}>
                {row.label}
              </Text>
            )}
            {row.sections?.length ? (
              <View
                accessibilityLiveRegion="none"
                style={[styles.sections, styles.sectionStack]}
                testID={`customer-v21-agentic-estimate-support-${row.key}-sections`}
              >
                {row.sections.map((section) => (
                  <View
                    key={section.label}
                    style={[
                      styles.section,
                      { borderColor: tokens.border },
                    ]}
                  >
                    <Text style={[styles.sectionLabel, { color: tokens.muted }]}>
                      {section.label}
                    </Text>
                    <Text style={[styles.sectionValue, { color: tokens.text }]}>
                      {section.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text
                accessibilityLiveRegion="none"
                style={[styles.detail, { color: tokens.text }]}
              >
                {row.detail}
              </Text>
            )}
          </View>
        )
      })}
      <Text style={[styles.value, { color: tokens.muted }]}>
        {model.valueStatement}
      </Text>
    </View>
  )
}

function EvidencePreview({
  label,
  mediaUrl,
  testID,
  tokens,
}: {
  label: string
  mediaUrl: string
  testID: string
  tokens: CustomerThemeTokens
}) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={label}
      contentFit="cover"
      source={{ uri: mediaUrl }}
      style={[
        styles.evidencePreview,
        { backgroundColor: tokens.service, borderColor: tokens.border },
      ]}
      testID={testID}
    />
  )
}

function accessibleRowDetail(row: AgenticEstimateSupportingPhaseModel['rows'][number]) {
  return row.sections?.length
    ? row.sections.map((section) => `${section.label}: ${section.value}`).join('. ')
    : row.detail
}

const styles = StyleSheet.create({
  detail: {
    fontSize: 14,
    lineHeight: 22,
  },
  evidencePreview: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 84,
    overflow: 'hidden',
    width: 112,
  },
  evidenceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 6,
  },
  evidenceRow: {
    marginTop: -6,
    paddingTop: 2,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 19,
  },
  row: {
    alignItems: 'flex-start',
    borderRadius: 14,
    flexDirection: 'column',
    gap: 8,
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingTop: 10,
  },
  sectionStack: {
    flexDirection: 'column',
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 17,
  },
  sections: {
    gap: 12,
    width: '100%',
  },
  sectionValue: {
    fontSize: 14,
    lineHeight: 22,
  },
  structuredRow: {
    flexDirection: 'column',
    gap: 5,
  },
  surface: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingBottom: 20,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 4,
  },
  value: {
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 10,
  },
})
