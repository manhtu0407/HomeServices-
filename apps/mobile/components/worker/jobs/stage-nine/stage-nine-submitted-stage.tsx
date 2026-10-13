import type { ReactNode } from 'react'
import { Pressable, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { PrimaryCtaFill, primaryCtaFrame } from '@/components/ui/primary-cta-fill'

import { stageButtonHeight, stageLayout, stageMetric, stageTypography } from '../stage-ratio'
import { StageNineSubmittedEmblem } from './stage-nine-submitted-emblem'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../../worker-theme'

export type StageNineStepState = 'done' | 'current' | 'pending'

export type StageNineSubmittedStep = {
  meta: string
  state: StageNineStepState
  status: string
  title: string
}

type Props = {
  actionLabels: { next: string; view: string }
  heroMeta: string
  heroTitle: string
  nextDisabled: boolean
  note?: ReactNode
  onNext: () => void
  onView: () => void
  sectionTitle: string
  statusLabel: string
  statusTone: 'done' | 'idle' | 'waiting'
  steps: readonly StageNineSubmittedStep[]
  topNote?: ReactNode
}

const NODE = 28

function StepNode({ color, ink, state }: { color: string; ink: string; state: StageNineStepState }) {
  if (state === 'done') {
    return (
      <View style={{ alignItems: 'center', backgroundColor: color, borderRadius: NODE / 2, height: NODE, justifyContent: 'center', width: NODE }}>
        <Svg height={16} viewBox="0 0 24 24" width={16}>
          <Path d="m5.5 12.5 4.2 4.2L18.5 7.5" fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
        </Svg>
      </View>
    )
  }
  return (
    <View style={{ alignItems: 'center', borderColor: state === 'current' ? color : '#8A9BA0', borderRadius: NODE / 2, borderWidth: 2, height: NODE, justifyContent: 'center', width: NODE }}>
      {state === 'current' ? <View style={{ backgroundColor: color, borderRadius: 5, height: 10, width: 10 }} /> : null}
    </View>
  )
}

/** The submitted state of Stage 9: one hero, a stepper that reads the real record, and two full-width actions. */
export function StageNineSubmittedStage({
  actionLabels,
  heroMeta,
  heroTitle,
  nextDisabled,
  note,
  onNext,
  onView,
  sectionTitle,
  statusLabel,
  statusTone,
  steps,
  topNote,
}: Props) {
  const { width } = useWindowDimensions()
  const tokens = getWorkerThemeTokens(useWorkerThemeMode())
  const buttonHeight = stageButtonHeight(width)
  const buttonRadius = stageMetric(stageLayout.buttonRadius, width)
  const pillColor = statusTone === 'done' ? tokens.primary : statusTone === 'waiting' ? tokens.primary : tokens.muted

  return (
    <View style={{ gap: 16, paddingBottom: 96 }} testID="worker-v5-stage-nine-prototype">
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 0 }} testID="worker-v5-stage-nine-hero">
        <View accessible={false} testID="worker-v5-stage-nine-status-emblem">
          <StageNineSubmittedEmblem primary={tokens.primary} />
        </View>
        <Text accessibilityRole="header" numberOfLines={2} style={[stageTypography('title2', width), { color: tokens.text, fontWeight: '600', marginTop: 4, textAlign: 'center' }]}>{heroTitle}</Text>
        <Text numberOfLines={3} style={[stageTypography('subheadline', width), { color: tokens.muted, textAlign: 'center' }]}>{heroMeta}</Text>
        <View style={{ alignItems: 'center', borderColor: pillColor, borderRadius: 14, borderWidth: 1, marginTop: 6, minHeight: 28, paddingHorizontal: 14, justifyContent: 'center' }}>
          <Text style={[stageTypography('footnote', width), { color: pillColor, fontWeight: '600' }]}>{statusLabel}</Text>
        </View>
      </View>

      {topNote}

      <View style={{ backgroundColor: tokens.base, borderColor: tokens.border, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 }} testID="worker-v5-stage-nine-status-card">
        <Text style={[stageTypography('body', width), { color: tokens.text, fontWeight: '600', marginBottom: 14 }]}>{sectionTitle}</Text>
        <View testID="worker-v5-stage-nine-status-list">
          {steps.map((step, index) => {
            const last = index === steps.length - 1
            return (
              <View key={step.title} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <StepNode color={tokens.primary} ink={tokens.base} state={step.state} />
                  {last ? null : <View style={{ backgroundColor: step.state === 'done' ? tokens.primary : tokens.border, flex: 1, marginVertical: 4, minHeight: 22, width: 2 }} />}
                </View>
                <View style={{ alignItems: 'flex-start', flex: 1, flexDirection: 'row', gap: 10, paddingBottom: last ? 0 : 14 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[stageTypography('body', width), { color: tokens.text, fontWeight: '600' }]}>{step.title}</Text>
                    <Text style={[stageTypography('subheadline', width), { color: tokens.muted }]}>{step.meta}</Text>
                  </View>
                  <Text style={[stageTypography('footnote', width), { color: step.state === 'done' ? tokens.primary : tokens.muted, fontWeight: '600', marginTop: 3 }]}>{step.status}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {note}

      <View style={{ flexDirection: 'row', gap: stageMetric(stageLayout.componentGap, width) }}>
        <Pressable
          accessibilityRole="button"
          onPress={onView}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: tokens.base,
            borderColor: tokens.border,
            borderRadius: buttonRadius,
            borderWidth: 1,
            flex: 1,
            justifyContent: 'center',
            minHeight: buttonHeight,
            opacity: pressed ? 0.84 : 1,
            paddingHorizontal: 10,
          })}
          testID="worker-v5-completion-submitted-timeline-action"
        >
          <Text numberOfLines={2} style={[stageTypography('callout', width), { color: tokens.primary, fontWeight: '600', textAlign: 'center' }]}>{actionLabels.view}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={onNext}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              borderRadius: buttonRadius,
              flex: 1.3,
              justifyContent: 'center',
              minHeight: buttonHeight,
              opacity: pressed && !nextDisabled ? 0.84 : 1,
              overflow: 'hidden',
              paddingHorizontal: 10,
            },
            nextDisabled ? { backgroundColor: tokens.depthSurface, borderColor: tokens.border, borderWidth: 1 } : primaryCtaFrame,
          ]}
          testID="worker-v5-completion-submitted-next-action"
        >
          {nextDisabled ? null : <PrimaryCtaFill radius={0} />}
          <Text numberOfLines={2} style={[stageTypography('callout', width), { color: nextDisabled ? tokens.muted : '#FFFFFF', fontWeight: '600', position: 'relative', textAlign: 'center', zIndex: 1 }]}>{actionLabels.next}</Text>
        </Pressable>
      </View>
    </View>
  )
}
