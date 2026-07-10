import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { styles } from './completion-styles'

type WorkerV5CompletionAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

export type WorkerV5FinalCheck = {
  done: boolean
  meta: string
  title: string
}

type WorkerV5TimelineState = 'active' | 'done' | 'todo'

type WorkerV5TimelineRow = {
  meta: string
  state: WorkerV5TimelineState
  title: string
}

type WorkerV5StatusTimelineComponent = ComponentType<{
  formulaAura?: boolean
  reduceTransparency?: boolean
  rows: ReadonlyArray<WorkerV5TimelineRow>
  testID: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5CompletionEvidenceHero({
  caseWideAura: CaseWideAura,
  completenessPercent,
  language,
  noteReady,
  photoCount,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CompletionAuraComponent
  completenessPercent: number | null
  language: AppLanguage
  noteReady: boolean
  photoCount: number
  reduceTransparency: boolean
  zipAura: WorkerV5CompletionAuraComponent
}) {
  const sourceCount = photoCount + (noteReady ? 1 : 0)
  const label = sourceCount
    ? textByLanguage(language, `${sourceCount} nguồn · đã kiểm tra`, `${sourceCount} sources · checked`)
    : textByLanguage(language, 'Chưa có nguồn hoàn tất', 'No completion sources yet')
  const caption = noteReady && photoCount
    ? textByLanguage(language, 'Ảnh, ghi chú và checklist lấy từ hồ sơ thật.', 'Photos, notes, and checklist come from the real case.')
    : textByLanguage(language, 'Cần ảnh hoặc ghi chú thật trước khi gửi.', 'Real photos or notes are required before submission.')
  const lensValue = sourceCount && completenessPercent != null
    ? `${Math.max(0, Math.min(100, completenessPercent))}%`
    : textByLanguage(language, 'Chờ', 'Wait')
  return (
    <View style={[styles.completionHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-completion-hero">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="CompletionEvidenceHeroWide" style={styles.completionHeroAura} testID="worker-v5-completion-evidence-mint-aura" />
          <ZipAura scope="CompletionEvidenceHeroFine" style={styles.completionHeroZipAura} testID="worker-v5-completion-evidence-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.completionHeroCopy}>
        <Text style={styles.completionHeroTitle} numberOfLines={2}>{label}</Text>
        <Text style={styles.completionHeroMeta} numberOfLines={2}>{caption}</Text>
      </View>
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue}>{lensValue}</Text>
        <Text style={styles.completionLensLabel}>{textByLanguage(language, 'Độ đầy đủ', 'Completeness')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5FinalChecklistCard({
  caseWideAura: CaseWideAura,
  checks,
  formulaAura = false,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CompletionAuraComponent
  checks: readonly WorkerV5FinalCheck[]
  formulaAura?: boolean
  reduceTransparency: boolean
  zipAura: WorkerV5CompletionAuraComponent
}) {
  return (
    <View style={[styles.finalChecklistCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-final-checklist">
      {formulaAura && !reduceTransparency ? (
        <>
          <CaseWideAura scope="FinalChecklistWide" style={styles.finalChecklistAura} testID="worker-v5-final-checklist-mint-aura" />
          <ZipAura scope="FinalChecklistFine" style={styles.finalChecklistZipAura} testID="worker-v5-final-checklist-zip-mint-aura" />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View key={check.title} style={styles.finalChecklistRow}>
          <View style={[styles.finalChecklistState, check.done ? styles.finalChecklistStateDone : null]}>
            <Text style={[styles.finalChecklistStateText, check.done ? styles.finalChecklistStateTextDone : null]}>
              {check.done ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.finalChecklistTitle} numberOfLines={2} testID={`worker-v5-final-check-title-${index}`}>{check.title}</Text>
          <Text style={styles.finalChecklistMeta} numberOfLines={2} testID={`worker-v5-final-check-meta-${index}`}>{check.meta}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5SubmissionTimeline({
  deal,
  language,
  reduceTransparency,
  statusTimeline: StatusTimeline,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  statusTimeline: WorkerV5StatusTimelineComponent
}) {
  const hasEvidence = Boolean(deal?.completionNotes?.trim() || deal?.completionPhotoUrls?.length)
  const customerConfirmed = deal?.status === 'confirmed_by_customer' || deal?.status === 'reviewed'
  const paymentRecorded = Boolean(deal?.payment?.workerNet && deal.payment.workerNet > 0)
  const rows: WorkerV5TimelineRow[] = [
    {
      meta: hasEvidence ? textByLanguage(language, 'Hash nguồn đã ghi', 'Source hash recorded') : textByLanguage(language, 'Chưa có bằng chứng thật', 'No real evidence yet'),
      state: hasEvidence ? 'done' : 'todo',
      title: textByLanguage(language, 'Bằng chứng đã khóa', 'Evidence locked'),
    },
    {
      meta: deal ? textByLanguage(language, 'Không phát hiện thiếu nguồn', 'No missing source detected') : textByLanguage(language, 'Chưa có việc để đối chiếu', 'No work to review'),
      state: deal ? 'done' : 'todo',
      title: textByLanguage(language, 'Kael đối chiếu phạm vi', 'Kael checks scope'),
    },
    {
      meta: customerConfirmed ? textByLanguage(language, 'Khách đã xác nhận trong hệ thống', 'Customer confirmed in system') : textByLanguage(language, 'Dự kiến trong lần đồng bộ tiếp theo', 'Expected in the next sync'),
      state: customerConfirmed ? 'done' : deal ? 'active' : 'todo',
      title: textByLanguage(language, 'Khách xác nhận', 'Customer confirmation'),
    },
    {
      meta: paymentRecorded ? textByLanguage(language, 'Đã có số đối soát thật', 'Real settlement amount exists') : textByLanguage(language, 'Sau khi việc đóng', 'After work closes'),
      state: paymentRecorded ? 'done' : 'todo',
      title: textByLanguage(language, 'Giải ngân về ví thợ', 'Worker settlement'),
    },
  ]
  return <StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-submission-timeline" />
}
