import { useEffect, useReducer } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import {
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
} from '@/lib/verified-response-reveal'

import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'

const ROW_SETTLE_CADENCE_MS = 320
type PriceReasoningRevealState = {
  activeRowIndex: number | null
  complete: boolean
  visibleDetails: string[]
}

type PriceReasoningRevealAction =
  | { type: 'activate-row'; rowIndex: number }
  | { delta: string; rowIndex: number; type: 'append-delta' }
  | { model: AgenticEstimateSupportingPhaseModel; type: 'complete' }

export function AgenticPriceReasoningStream({
  model,
  reduceMotion,
  tokens,
}: {
  model: AgenticEstimateSupportingPhaseModel
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  return (
    <AgenticPriceReasoningStreamSession
      key={priceReasoningContentKey(model)}
      model={model}
      reduceMotion={reduceMotion}
      tokens={tokens}
    />
  )
}

function AgenticPriceReasoningStreamSession({
  model,
  reduceMotion,
  tokens,
}: {
  model: AgenticEstimateSupportingPhaseModel
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const [reveal, dispatchReveal] = useReducer(priceReasoningRevealReducer, model, initialReveal)

  useEffect(() => {
    if (reduceMotion) return undefined

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let elapsedMs = 0
    const schedule = (callback: () => void) => {
      timers.push(setTimeout(() => {
        if (!cancelled) callback()
      }, elapsedMs))
    }

    model.rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) {
        schedule(() => {
          dispatchReveal({ rowIndex, type: 'activate-row' })
        })
      }

      const deltas = splitVerifiedResponseDeltas(row.detail, 14)
      deltas.forEach((delta, deltaIndex) => {
        schedule(() => {
          dispatchReveal({ delta, rowIndex, type: 'append-delta' })
        })
        if (deltaIndex < deltas.length - 1) elapsedMs += verifiedResponseCadenceMs(delta)
      })

      if (rowIndex < model.rows.length - 1) elapsedMs += ROW_SETTLE_CADENCE_MS
    })

    schedule(() => dispatchReveal({ model, type: 'complete' }))
    return () => {
      cancelled = true
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [model, reduceMotion])

  const visibleReveal = reduceMotion ? completedReveal(model) : reveal
  const visibleRows = model.rows.flatMap((row, rowIndex) => {
    const visibleDetail = visibleReveal.visibleDetails[rowIndex]
    return visibleDetail && visibleDetail.length > 0
      ? [{ row, rowIndex, visibleDetail }]
      : []
  })
  const accessibilityLabel = visibleReveal.complete
    ? `${model.title}. ${model.rows.map((row) => `${row.label}: ${accessibleRowDetail(row)}`).join('. ')}. ${model.valueStatement}`
    : undefined

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityState={visibleReveal.complete ? undefined : { busy: true }}
      accessible={visibleReveal.complete}
      style={[styles.surface, { borderColor: tokens.border }]}
      testID="customer-v21-agentic-estimate-supporting-phase"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.primary }]}>
        {model.title}
      </Text>
      {visibleRows.map(({ row, rowIndex, visibleDetail }) => {
        const active = visibleReveal.activeRowIndex === rowIndex
        const structured = Boolean(row.sections?.length)
        const visibleSections = row.sections
          ? visibleSectionValues(row.sections, visibleDetail).filter((section) => section.value.length > 0)
          : []
        return (
          <View
            key={row.key}
            style={[
              styles.row,
              row.mediaUrl ? styles.evidenceRow : null,
              structured ? styles.structuredRow : null,
              active ? { backgroundColor: tokens.service } : null,
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
            {row.sections?.length && visibleSections.length > 0 ? (
              <View
                accessibilityLiveRegion={active ? 'polite' : 'none'}
                style={[styles.sections, styles.sectionStack]}
                testID={`customer-v21-agentic-estimate-support-${row.key}-sections`}
              >
                {visibleSections.map((section) => (
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
                accessibilityLiveRegion={active ? 'polite' : 'none'}
                style={[styles.detail, { color: tokens.text }]}
              >
                {visibleDetail}
              </Text>
            )}
          </View>
        )
      })}
      {visibleReveal.complete ? (
        <Text style={[styles.value, { color: tokens.muted }]}>
          {model.valueStatement}
        </Text>
      ) : null}
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

function priceReasoningContentKey(model: AgenticEstimateSupportingPhaseModel) {
  return [
    model.title,
    ...model.rows.flatMap((row) => [
      row.key,
      row.label,
      row.detail,
      row.mediaUrl ?? '',
      ...(row.sections?.flatMap((section) => [section.label, section.value]) ?? []),
    ]),
    model.valueStatement,
  ].join('\u0000')
}

function visibleSectionValues(
  sections: NonNullable<AgenticEstimateSupportingPhaseModel['rows'][number]['sections']>,
  visibleDetail: string,
) {
  let remaining = visibleDetail.length
  return sections.map((section, index) => {
    if (index > 0) remaining = Math.max(0, remaining - 1)
    const visibleLength = Math.min(section.value.length, remaining)
    remaining = Math.max(0, remaining - section.value.length)
    return { ...section, value: section.value.slice(0, visibleLength) }
  })
}

function accessibleRowDetail(row: AgenticEstimateSupportingPhaseModel['rows'][number]) {
  return row.sections?.length
    ? row.sections.map((section) => `${section.label}: ${section.value}`).join('. ')
    : row.detail
}

function initialReveal(model: AgenticEstimateSupportingPhaseModel): PriceReasoningRevealState {
  if (model.rows.length === 0) return completedReveal(model)
  return { activeRowIndex: 0, complete: false, visibleDetails: [''] }
}

function priceReasoningRevealReducer(
  current: PriceReasoningRevealState,
  action: PriceReasoningRevealAction,
): PriceReasoningRevealState {
  switch (action.type) {
    case 'activate-row':
      return {
        activeRowIndex: action.rowIndex,
        complete: false,
        visibleDetails: [...current.visibleDetails.slice(0, action.rowIndex), ''],
      }
    case 'append-delta': {
      const visibleDetails = [...current.visibleDetails]
      visibleDetails[action.rowIndex] = `${visibleDetails[action.rowIndex] ?? ''}${action.delta}`
      return { ...current, visibleDetails }
    }
    case 'complete':
      return completedReveal(action.model)
    default:
      return current
  }
}

function completedReveal(model: AgenticEstimateSupportingPhaseModel): PriceReasoningRevealState {
  return {
    activeRowIndex: null,
    complete: true,
    visibleDetails: model.rows.map((row) => row.detail),
  }
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
