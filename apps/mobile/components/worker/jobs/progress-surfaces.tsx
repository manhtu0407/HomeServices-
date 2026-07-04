import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { styles } from './progress-styles'

type WorkerV5ProgressAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5StepState = 'active' | 'done' | 'todo'

type WorkerV5ProgressItem = {
  meta: string
  state: WorkerV5StepState
  title: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ProgressRail({ activeStep, language }: { activeStep: number; language: AppLanguage }) {
  const labels = [
    textByLanguage(language, 'Nhận', 'Accept'),
    textByLanguage(language, 'Đến', 'Arrive'),
    textByLanguage(language, 'Làm', 'Work'),
    textByLanguage(language, 'Duyệt', 'Review'),
    textByLanguage(language, 'Đóng', 'Close'),
  ]
  return <WorkerV5Rail labels={labels} activeStep={activeStep} testID="worker-v5-progress-rail" />
}

export function WorkerV5WorkProgressBoard({
  caseWideAura,
  items,
  language,
  reduceTransparency,
  zipAura,
}: {
  caseWideAura: WorkerV5ProgressAuraComponent
  items: ReadonlyArray<WorkerV5ProgressItem>
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5ProgressAuraComponent
}) {
  return (
    <View style={styles.workProgressBoardShell} testID="worker-v5-work-progress-board">
      <View style={styles.workProgressBoardMeta}>
        <Text style={styles.workProgressBoardTitle}>{textByLanguage(language, 'Bảng công việc', 'Work board')}</Text>
        <Text style={styles.workProgressBoardCount}>{items.length}</Text>
      </View>
      <WorkerV5StepList
        caseWideAura={caseWideAura}
        formulaAura
        items={items}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-in-progress-step-list"
        zipAura={zipAura}
      />
    </View>
  )
}

function WorkerV5Rail({ activeStep, labels, testID }: { activeStep: number; labels: readonly string[]; testID: string }) {
  return (
    <View style={styles.railCard} testID={testID}>
      <View style={styles.progressRail}>
        {labels.map((label, index) => {
          const step = index + 1
          const done = step < activeStep
          const active = step === activeStep
          return (
            <View key={label} style={styles.railSegment} testID={`${testID}-segment-${step}`}>
              {index < labels.length - 1 ? <View style={[styles.railLine, done ? styles.railLineDone : null]} /> : null}
              <View style={[styles.railNode, done || active ? styles.railNodeOn : null, active ? styles.railNodeActive : null]}>
                <Text style={[styles.railNodeText, done || active ? styles.railNodeTextOn : null]}>{done ? '✓' : step}</Text>
              </View>
              <Text style={[styles.railLabel, active ? styles.railLabelActive : null]} numberOfLines={1} testID={`${testID}-label-${step}`}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function WorkerV5StepList({
  caseWideAura: CaseWideAura,
  formulaAura = false,
  items,
  reduceTransparency = false,
  testID = 'worker-v5-step-list',
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5ProgressAuraComponent
  formulaAura?: boolean
  items: ReadonlyArray<WorkerV5ProgressItem>
  reduceTransparency?: boolean
  testID?: string
  zipAura: WorkerV5ProgressAuraComponent
}) {
  return (
    <View style={[styles.stepList, formulaAura && styles.stepListFormula, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope="StepListWide" style={styles.checkInChecklistAura} testID={`${testID}-formula-aura`} />
          <ZipAura scope="StepListFine" style={styles.checkInChecklistZipAura} testID={`${testID}-zip-mint-aura`} />
        </>
      ) : null}
      {items.map((item, index) => (
        <View
          key={`${item.title}-${index}`}
          style={[
            styles.stepRow,
            item.state === 'done' ? styles.stepRowDone : null,
            item.state === 'active' ? styles.stepRowActive : null,
          ]}
        >
          <View style={[styles.stepState, item.state === 'done' ? styles.stepStateDone : null, item.state === 'active' ? styles.stepStateActive : null]}>
            <Text style={[styles.stepStateText, item.state === 'active' ? styles.stepStateTextActive : null, item.state === 'done' ? styles.stepStateTextDone : null]}>
              {item.state === 'done' ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.stepTitle} numberOfLines={2} testID={`worker-v5-step-title-${index}`}>{item.title}</Text>
          <Text style={styles.stepMeta} numberOfLines={2} testID={`worker-v5-step-meta-${index}`}>{item.meta}</Text>
        </View>
      ))}
    </View>
  )
}
