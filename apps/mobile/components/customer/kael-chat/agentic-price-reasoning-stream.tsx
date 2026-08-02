import { useEffect, useState } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import {
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
} from '@/lib/verified-response-reveal'

import type { AgenticEstimateSupportingPhaseModel } from './agentic-estimate-display-model'

const ROW_SETTLE_CADENCE_MS = 320
const COMPACT_LAYOUT_MAX_WIDTH = 599
const DEFAULT_EVIDENCE_ASPECT_RATIO = 4 / 3

type PriceReasoningRevealState = {
  activeRowIndex: number | null
  complete: boolean
  visibleDetails: string[]
}

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
  const [reveal, setReveal] = useState<PriceReasoningRevealState>(() => initialReveal(model))
  const { width: windowWidth } = useWindowDimensions()

  useEffect(() => {
    if (reduceMotion) return undefined

    let cancelled = false
    const revealRows = async () => {
      for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
        if (cancelled) return
        if (rowIndex > 0) {
          setReveal((current) => ({
            activeRowIndex: rowIndex,
            complete: false,
            visibleDetails: [...current.visibleDetails.slice(0, rowIndex), ''],
          }))
        }
        const deltas = splitVerifiedResponseDeltas(model.rows[rowIndex].detail, 14)
        for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex += 1) {
          if (cancelled) return
          const delta = deltas[deltaIndex]
          setReveal((current) => {
            const visibleDetails = [...current.visibleDetails]
            visibleDetails[rowIndex] = `${visibleDetails[rowIndex] ?? ''}${delta}`
            return { ...current, visibleDetails }
          })
          if (deltaIndex < deltas.length - 1) {
            await waitForReasoningCadence(verifiedResponseCadenceMs(delta))
          }
        }
        if (rowIndex < model.rows.length - 1) {
          await waitForReasoningCadence(ROW_SETTLE_CADENCE_MS)
        }
      }
      if (!cancelled) setReveal(completedReveal(model))
    }
    void revealRows()
    return () => {
      cancelled = true
    }
  }, [model, reduceMotion])

  const visibleReveal = reduceMotion ? completedReveal(model) : reveal
  const visibleRows = model.rows.slice(0, visibleReveal.visibleDetails.length)
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
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>
        {model.title}
      </Text>
      {visibleRows.map((row, rowIndex) => {
        const active = visibleReveal.activeRowIndex === rowIndex
        const visibleDetail = visibleReveal.visibleDetails[rowIndex] ?? ''
        const structured = Boolean(row.sections?.length)
        const useSectionColumns = row.layout === 'columns' && windowWidth > COMPACT_LAYOUT_MAX_WIDTH
        return (
          <View
            key={row.key}
            style={[
              styles.row,
              structured ? styles.structuredRow : null,
              active ? { backgroundColor: tokens.service } : null,
            ]}
            testID={`customer-v21-agentic-estimate-support-${row.key}`}
          >
            <Text style={[styles.label, { color: tokens.primary }]}>
              {row.label}
            </Text>
            {row.mediaUrl ? (
              <EvidencePreview
                label={row.label}
                mediaUrl={row.mediaUrl}
                testID={`customer-v21-agentic-estimate-support-${row.key}-preview`}
                tokens={tokens}
              />
            ) : null}
            {row.sections?.length ? (
              <View
                accessibilityLiveRegion={active ? 'polite' : 'none'}
                style={[
                  styles.sections,
                  useSectionColumns ? styles.sectionColumns : styles.sectionStack,
                ]}
                testID={`customer-v21-agentic-estimate-support-${row.key}-sections`}
              >
                {visibleSectionValues(row.sections, visibleDetail).map((section) => (
                  <View
                    key={section.label}
                    style={[
                      styles.section,
                      useSectionColumns ? styles.sectionColumn : null,
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
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_EVIDENCE_ASPECT_RATIO)

  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={label}
      contentFit="cover"
      onLoad={({ source }) => {
        if (source.width > 0 && source.height > 0) {
          setAspectRatio(source.width / source.height)
        }
      }}
      source={{ uri: mediaUrl }}
      style={[
        styles.evidencePreview,
        { aspectRatio, backgroundColor: tokens.service, borderColor: tokens.border },
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

function completedReveal(model: AgenticEstimateSupportingPhaseModel): PriceReasoningRevealState {
  return {
    activeRowIndex: null,
    complete: true,
    visibleDetails: model.rows.map((row) => row.detail),
  }
}

function waitForReasoningCadence(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

const styles = StyleSheet.create({
  detail: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
  },
  evidencePreview: {
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 184,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  label: {
    flexBasis: 94,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 19,
  },
  row: {
    alignItems: 'flex-start',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 8,
  },
  sectionColumn: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 142,
  },
  sectionColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sectionStack: {
    flexDirection: 'column',
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  sections: {
    gap: 10,
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
    gap: 5,
    paddingBottom: 17,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 5,
  },
  value: {
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 7,
  },
})
