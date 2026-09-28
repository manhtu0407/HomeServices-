import { useState } from 'react'
import { Pressable, Text as RNText, View, type TextProps } from 'react-native'

import { EvidencePhotoSlots } from '@/components/job/evidence-photo-slots'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { DisciplinePolicyView, WorkerViolationCaseView } from '@/lib/api-types/program'
import type { AppLanguage } from '@/lib/app-language'
import {
  MAX_APPEAL_IMAGES,
  type AppealImageDraft,
  type useWorkerViolations,
} from '@/lib/frontend-workflow/use-worker-violations'

import { textByLanguage } from '../ui/format'
import { WorkerCompensationSection } from './compensation-section'
import { styles } from './violation-styles'
import { caseStatusLabel, consequenceLabel, levelRules, violationLabel } from './violation-copy'

type ViolationsController = ReturnType<typeof useWorkerViolations>

const MIN_APPEAL_REASON = 20
const EVIDENCE_PALETTE = {
  text: color.text.strong,
  muted: color.text.secondary,
  border: color.surface.stroke,
  tile: color.surface.mint,
  raised: color.surface.raised,
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function formatDate(value: string, language: AppLanguage) {
  return new Date(value).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function appealDaysLeft(item: WorkerViolationCaseView, now = Date.now()): number | null {
  if (item.status !== 'confirmed' || item.appeal_status !== 'none' || !item.appeal_deadline_at) return null
  const remaining = Date.parse(item.appeal_deadline_at) - now
  return remaining > 0 ? Math.ceil(remaining / 86_400_000) : null
}

function appealErrorCopy(code: string, language: AppLanguage): string {
  switch (code) {
    case 'APPEAL_WINDOW_CLOSED':
      return textByLanguage(language, 'Đã quá hạn gửi khiếu nại cho hồ sơ này.', 'The appeal window for this case has closed.')
    case 'MEDIA_READ_FAILED':
    case 'MEDIA_UPLOAD_FAILED':
    case 'STORAGE_ERROR':
      return textByLanguage(language, 'Chưa tải được ảnh bằng chứng. Thử lại hoặc gửi ảnh khác.', 'Could not upload the evidence photo. Try again or pick another photo.')
    case 'VALIDATION':
      return textByLanguage(language, `Lý do cần ít nhất ${MIN_APPEAL_REASON} ký tự.`, `The reason needs at least ${MIN_APPEAL_REASON} characters.`)
    default:
      return textByLanguage(language, 'Chưa gửi được khiếu nại. Kiểm tra kết nối rồi thử lại.', 'Could not send the appeal. Check your connection and try again.')
  }
}

function RulesCard({ language, policy }: { language: AppLanguage; policy: DisciplinePolicyView }) {
  return (
    <View style={styles.card} testID="worker-v5-discipline-rules">
      <Text style={styles.sectionTitle}>{textByLanguage(language, '5 mức xử lý vi phạm', 'Five penalty levels')}</Text>
      <Text style={styles.sectionHint}>
        {textByLanguage(
          language,
          `Chỉ áp dụng sau khi quản trị viên xác nhận. Khiếu nại trong ${policy.appeal_window_days} ngày; được minh oan sẽ khôi phục đầy đủ. Thu nhập đã làm không bao giờ bị trừ.`,
          `Applies only after an administrator confirms. Appeal within ${policy.appeal_window_days} days; if cleared, everything is restored. Earned income is never deducted.`,
        )}
      </Text>
      {levelRules(policy, language).map((rule) => (
        <View key={rule.level} style={styles.ruleRow} testID={`worker-v5-discipline-rule-${rule.level}`}>
          <View style={[styles.levelBadge, rule.level >= 3 && styles.levelBadgeSerious]}>
            <Text style={[styles.levelBadgeText, rule.level >= 3 && styles.levelBadgeTextSerious]}>{rule.level}</Text>
          </View>
          <View style={styles.ruleCopy}>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
            <Text style={styles.ruleBody}>{rule.consequence}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function AppealForm({
  controller,
  daysLeft,
  item,
  language,
}: {
  controller: ViolationsController
  daysLeft: number
  item: WorkerViolationCaseView
  language: AppLanguage
}) {
  const [reason, setReason] = useState('')
  const [images, setImages] = useState<AppealImageDraft[]>([])
  const submitting = controller.submittingCaseId === item.id
  const reasonLongEnough = reason.trim().length >= MIN_APPEAL_REASON

  return (
    <View style={styles.appealSection} testID={`worker-v5-appeal-form-${item.id}`}>
      <Text style={styles.sectionTitle}>{textByLanguage(language, 'Khiếu nại', 'Appeal')}</Text>
      <Text style={styles.sectionHint}>
        {textByLanguage(
          language,
          `Còn ${daysLeft} ngày · lý do từ ${MIN_APPEAL_REASON} ký tự, ảnh không bắt buộc.`,
          `${daysLeft} days left · reason of ${MIN_APPEAL_REASON}+ characters, photos optional.`,
        )}
      </Text>
      <KaelTextField
        multiline
        accessibilityLabel={textByLanguage(language, 'Lý do khiếu nại', 'Appeal reason')}
        maxLength={2000}
        onChangeText={setReason}
        placeholder={textByLanguage(language, 'Trình bày sự việc theo cách bạn thấy', 'Describe what happened as you saw it')}
        testID={`worker-v5-appeal-reason-${item.id}`}
        value={reason}
      />
      <EvidencePhotoSlots
        label={textByLanguage(language, `Ảnh bằng chứng (tối đa ${MAX_APPEAL_IMAGES})`, `Evidence photos (up to ${MAX_APPEAL_IMAGES})`)}
        language={language}
        max={MAX_APPEAL_IMAGES}
        onChange={setImages}
        palette={EVIDENCE_PALETTE}
        photos={images}
        testID={`worker-v5-appeal-photos-${item.id}`}
      />
      <KaelButton
        disabled={!reasonLongEnough || submitting}
        label={submitting ? textByLanguage(language, 'Đang gửi khiếu nại', 'Sending appeal') : textByLanguage(language, 'Gửi khiếu nại', 'Send appeal')}
        loading={submitting}
        onPress={() => { void controller.submitAppeal(item.id, reason, images) }}
        testID={`worker-v5-appeal-submit-${item.id}`}
        variant="primary"
      />
      {controller.appealErrorCode && !submitting ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText} testID={`worker-v5-appeal-error-${item.id}`}>{appealErrorCopy(controller.appealErrorCode, language)}</Text>
      ) : null}
    </View>
  )
}

function CaseCard({ controller, item, language }: { controller: ViolationsController; item: WorkerViolationCaseView; language: AppLanguage }) {
  const daysLeft = appealDaysLeft(item)
  const cleared = item.appeal_status === 'overturned'
  return (
    <View style={styles.card} testID={`worker-v5-violation-${item.id}`}>
      <View style={styles.caseHeader}>
        <View style={[styles.levelBadge, item.level >= 3 && styles.levelBadgeSerious]}>
          <Text style={[styles.levelBadgeText, item.level >= 3 && styles.levelBadgeTextSerious]}>{item.level}</Text>
        </View>
        <View style={styles.ruleCopy}>
          <Text style={styles.ruleTitle}>{violationLabel(item.violation_code, language)}</Text>
          <Text style={[styles.status, cleared && styles.statusCleared]} testID={`worker-v5-violation-status-${item.id}`}>
            {`${caseStatusLabel(item, language)} · ${formatDate(item.created_at, language)}`}
          </Text>
        </View>
      </View>
      {item.decision_reason ? (
        <Text style={styles.ruleBody}>{textByLanguage(language, `Lý do: ${item.decision_reason}`, `Reason: ${item.decision_reason}`)}</Text>
      ) : null}
      {item.status === 'proposed' ? (
        <Text style={styles.ruleBody}>
          {textByLanguage(language, `Chưa có hình phạt nào được áp dụng. Quản trị viên sẽ xem xét trước ${formatDate(item.decision_deadline_at, language)}.`, `No penalty applies yet. An administrator will review by ${formatDate(item.decision_deadline_at, language)}.`)}
        </Text>
      ) : null}
      {item.consequences.length > 0 ? (
        <View style={styles.consequenceList}>
          {item.consequences.map((consequence, index) => (
            <Text key={`${consequence.entry_kind}-${index}`} style={[styles.consequence, consequence.restored && styles.consequenceRestored]}>
              {`${consequenceLabel(consequence.entry_kind, language)}${consequence.effective_until ? textByLanguage(language, ` · đến ${formatDate(consequence.effective_until, language)}`, ` · until ${formatDate(consequence.effective_until, language)}`) : ''}${consequence.restored ? textByLanguage(language, ' · đã khôi phục', ' · restored') : ''}`}
            </Text>
          ))}
        </View>
      ) : null}
      {daysLeft !== null ? <AppealForm controller={controller} daysLeft={daysLeft} item={item} language={language} /> : null}
    </View>
  )
}

export function WorkerV5Violations({ controller, language }: { controller: ViolationsController; language: AppLanguage }) {
  if (!controller.cases || !controller.policy) {
    return (
      <View style={styles.card} testID="worker-v5-violations">
        <Text style={styles.sectionTitle}>
          {controller.loading
            ? textByLanguage(language, 'Đang tải hồ sơ vi phạm', 'Loading your violation record')
            : textByLanguage(language, 'Chưa thể tải hồ sơ vi phạm', 'Your violation record is unavailable')}
        </Text>
        {!controller.loading ? (
          <Pressable accessibilityRole="button" onPress={() => void controller.reload()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="worker-v5-violations-retry">
            <Text style={styles.secondaryLabel}>{textByLanguage(language, 'Thử lại', 'Try again')}</Text>
          </Pressable>
        ) : null}
      </View>
    )
  }
  return (
    <View style={styles.stack} testID="worker-v5-violations">
      <WorkerCompensationSection language={language} />
      <RulesCard language={language} policy={controller.policy} />
      {controller.cases.length === 0 ? (
        <View style={styles.card} testID="worker-v5-violations-empty">
          <Text style={styles.sectionTitle}>{textByLanguage(language, 'Bạn chưa có hồ sơ vi phạm nào', 'You have no violation record')}</Text>
          <Text style={styles.sectionHint}>{textByLanguage(language, 'Giữ mọi giao dịch trong app để bảo vệ thu nhập và điểm thưởng của bạn.', 'Keep every transaction in the app to protect your income and reward points.')}</Text>
        </View>
      ) : controller.cases.map((item) => (
        <CaseCard controller={controller} item={item} key={item.id} language={language} />
      ))}
    </View>
  )
}
