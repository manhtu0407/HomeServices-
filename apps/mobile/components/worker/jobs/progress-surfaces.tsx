import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { styles as stylesLight } from './progress-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

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
  const styles = useWorkerThemedStyles(stylesLight)
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ProgressRail({
  activeStep,
  formulaAura = true,
  language,
  reduceTransparency,
}: {
  activeStep: number
  formulaAura?: boolean
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const labels = [
    textByLanguage(language, 'Nhận', 'Accept'),
    textByLanguage(language, 'Đến', 'Arrive'),
    textByLanguage(language, 'Làm', 'Work'),
    textByLanguage(language, 'Duyệt', 'Review'),
    textByLanguage(language, 'Đóng', 'Close'),
  ]
  return <WorkerV5Rail formulaAura={formulaAura} labels={labels} activeStep={activeStep} reduceTransparency={reduceTransparency} testID="worker-v5-progress-rail" />
}

export function WorkerV5WorkProgressBoard({
  caseWideAura,
  items,
  language,
  reduceTransparency,
  styleVariant = 'default',
  zipAura,
}: {
  caseWideAura: WorkerV5ProgressAuraComponent
  items: readonly WorkerV5ProgressItem[]
  language: AppLanguage
  reduceTransparency: boolean
  styleVariant?: 'default' | 'jobs-review'
  zipAura: WorkerV5ProgressAuraComponent
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const isJobsReview = styleVariant === 'jobs-review'
  return (
    <View style={[styles.workProgressBoardShell, isJobsReview && styles.workProgressBoardShellJobsReview]} testID="worker-v5-work-progress-board">
      <View style={styles.workProgressBoardMeta}>
        <Text style={[styles.workProgressBoardTitle, isJobsReview && styles.workProgressBoardTitleJobsReview]}>{textByLanguage(language, 'Bảng công việc', 'Work board')}</Text>
      </View>
      <WorkerV5StepList
        caseWideAura={caseWideAura}
        formulaAura
        items={items}
        reduceTransparency={reduceTransparency}
        styleVariant={styleVariant}
        testID="worker-v5-in-progress-step-list"
        zipAura={zipAura}
      />
    </View>
  )
}

function WorkerV5Rail({
  activeStep,
  formulaAura,
  labels,
  reduceTransparency,
  testID,
}: {
  activeStep: number
  formulaAura: boolean
  labels: readonly string[]
  reduceTransparency: boolean
  testID: string
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  return (
    <View style={[styles.railCard, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura ? (
        <WorkerV5FormulaMintCardAura
          reduceTransparency={reduceTransparency}
          scope="ScopeChangeProgressRail"
          testID="worker-v5-progress-rail-formula-mint-aura"
        />
      ) : null}
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
  styleVariant = 'default',
  testID = 'worker-v5-step-list',
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5ProgressAuraComponent
  formulaAura?: boolean
  items: readonly WorkerV5ProgressItem[]
  reduceTransparency?: boolean
  styleVariant?: 'default' | 'jobs-review'
  testID?: string
  zipAura: WorkerV5ProgressAuraComponent
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const isJobsReview = styleVariant === 'jobs-review'
  const primaryActiveIndex = isJobsReview ? items.findIndex((item) => item.state === 'active') : -1
  return (
    <View style={[styles.stepList, formulaAura && styles.stepListFormula, isJobsReview && styles.stepListJobsReview, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura && !reduceTransparency && !isJobsReview ? (
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
            isJobsReview && styles.stepRowJobsReview,
            isJobsReview && item.state === 'done' ? styles.stepRowJobsReviewDone : null,
            isJobsReview && item.state === 'active' && index === primaryActiveIndex ? styles.stepRowJobsReviewActive : null,
            isJobsReview && item.state === 'active' && index !== primaryActiveIndex ? styles.stepRowJobsReviewContext : null,
            isJobsReview && index === items.length - 1 ? styles.stepRowJobsReviewLast : null,
          ]}
        >
          <View
            style={[
              styles.stepState,
              isJobsReview && styles.stepStateJobsReview,
              item.state === 'done' ? styles.stepStateDone : null,
              item.state === 'active' ? styles.stepStateActive : null,
              isJobsReview && item.state === 'done' ? styles.stepStateJobsReviewDone : null,
              isJobsReview && item.state === 'active' && index === primaryActiveIndex ? styles.stepStateJobsReviewActive : null,
              isJobsReview && item.state === 'active' && index !== primaryActiveIndex ? styles.stepStateJobsReviewContext : null,
            ]}
          >
            <Text
              style={[
                styles.stepStateText,
                isJobsReview ? styles.stepStateTextJobsReview : null,
                item.state === 'active' ? styles.stepStateTextActive : null,
                item.state === 'done' ? styles.stepStateTextDone : null,
                isJobsReview && item.state === 'active' && index === primaryActiveIndex ? styles.stepStateTextJobsReviewActive : null,
                isJobsReview && item.state === 'active' && index !== primaryActiveIndex ? styles.stepStateTextJobsReviewContext : null,
                isJobsReview && item.state === 'done' ? styles.stepStateTextJobsReviewDone : null,
              ]}
            >
              {item.state === 'done' ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={[styles.stepTitle, isJobsReview && styles.stepTitleJobsReview]} numberOfLines={2} testID={`worker-v5-step-title-${index}`}>
            {item.title}
          </Text>
          <Text style={[styles.stepMeta, isJobsReview && styles.stepMetaJobsReview]} numberOfLines={2} testID={`worker-v5-step-meta-${index}`}>
            {item.meta}
          </Text>
        </View>
      ))}
    </View>
  )
}
