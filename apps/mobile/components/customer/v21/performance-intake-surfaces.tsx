import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  buildServiceScopeCard,
  getMissingRequiredPerformanceQuestions,
  getServicePerformancePlaybook,
  runKaelAgenticPerformanceStep,
  type IntakeAnswerValue,
  type IntakeQuestion,
  type ServiceIntakeState,
} from '@nestscout/shared'

import { KaelButton, KaelChip, KaelInlineStepper, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

export function PerformanceIntakePanel({
  language,
  onAddPhotos,
  onAnswerChange,
  photoCount,
  state,
  tokens,
}: {
  language: AppLanguage
  onAddPhotos: () => void
  onAnswerChange: (questionId: string, value: IntakeAnswerValue) => void
  photoCount: number
  state: ServiceIntakeState
  tokens: CustomerThemeTokens
}) {
  const playbook = getServicePerformancePlaybook(state.serviceLineId)
  const missingQuestions = getMissingRequiredPerformanceQuestions(state)
  const scopeCard = useMemo(() => buildServiceScopeCard(state), [state])
  const decision = useMemo(() => runKaelAgenticPerformanceStep({ state }), [state])
  const requiredComplete = missingQuestions.length === 0
  const status = performanceStatusCopy(decision.kind, language)
  const checklist = language === 'vi' ? scopeCard.completionChecklistVi : scopeCard.completionChecklistEn
  const boundaries = language === 'vi' ? scopeCard.unsupportedBoundariesVi : scopeCard.unsupportedBoundariesEn

  return (
    <View style={styles.root} testID="customer-v21-performance-intake">
      <View style={styles.intro}>
        <Text style={[styles.scopeName, { color: tokens.primary }]}>{playbook.kaelScopeName}</Text>
        <Text style={[styles.introText, { color: tokens.muted }]}>
          {language === 'vi' ? playbook.performanceGoalVi : playbook.performanceGoalEn}
        </Text>
      </View>

      {playbook.questions.map((question, index) => (
        <PerformanceQuestion
          answer={state.answers[question.id]}
          index={index}
          key={question.id}
          language={language}
          onChange={(value) => onAnswerChange(question.id, value)}
          question={question}
          tokens={tokens}
        />
      ))}

      <View style={[styles.mediaSection, { borderColor: tokens.border }]} testID="customer-v21-performance-media">
        <View style={styles.mediaCopy}>
          <Text style={[styles.questionLabel, { color: tokens.text }]}>{language === 'vi' ? 'Ảnh hiện trạng' : 'Current-condition photos'}</Text>
          <Text style={[styles.helper, styles.mediaHelper, { color: tokens.muted }]}>
            {scopeCard.mediaRequirement.required
              ? (language === 'vi' ? `Cần ít nhất ${scopeCard.mediaRequirement.minPhotos} ảnh.` : `At least ${scopeCard.mediaRequirement.minPhotos} photo${scopeCard.mediaRequirement.minPhotos === 1 ? '' : 's'} required.`)
              : (language === 'vi' ? 'Ảnh giúp Kael tăng độ tin cậy của phạm vi.' : 'Photos improve scope confidence.')}
          </Text>
        </View>
        <View style={styles.mediaAction}>
          <Text style={[styles.mediaCount, { color: tokens.primary }]}>{photoCount}/5</Text>
          <KaelButton
            disabled={photoCount >= 5}
            label={language === 'vi' ? 'Thêm ảnh' : 'Add photos'}
            onPress={onAddPhotos}
            size="small"
            testID="customer-v21-performance-add-photos"
            variant="secondary"
          />
        </View>
      </View>

      {requiredComplete ? (
        <View
          style={[styles.scopeCard, { backgroundColor: tokens.service, borderColor: tokens.border }]}
          testID="customer-v21-performance-scope-card"
        >
          <View style={styles.scopeHeader}>
            <View style={styles.scopeHeaderCopy}>
              <Text style={[styles.scopeTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Phạm vi Kael đã tổng hợp' : 'Scope prepared by Kael'}
              </Text>
              <Text style={[styles.scopeStatus, { color: tokens.primary }]} testID="customer-v21-performance-status">
                {status}
              </Text>
            </View>
            <Text style={[styles.confidence, { color: tokens.primary }]}>
              {confidenceCopy(scopeCard.confidence, language)}
            </Text>
          </View>

          <View style={styles.metrics}>
            <ScopeMetric
              label={language === 'vi' ? 'Thời lượng' : 'Duration'}
              value={`${scopeCard.estimatedDurationMinutes.min}–${scopeCard.estimatedDurationMinutes.max} ${language === 'vi' ? 'phút' : 'min'}`}
              tokens={tokens}
            />
            <ScopeMetric
              label={language === 'vi' ? 'Số người' : 'Crew'}
              value={String(scopeCard.recommendedCrewSize)}
              tokens={tokens}
            />
            <ScopeMetric
              label={language === 'vi' ? 'Mức độ' : 'Complexity'}
              value={complexityCopy(scopeCard.complexity, language)}
              tokens={tokens}
            />
          </View>

          <ScopeList
            items={checklist}
            title={language === 'vi' ? 'Hoàn tất khi' : 'Completion checklist'}
            tokens={tokens}
          />
          <ScopeList
            items={boundaries}
            title={language === 'vi' ? 'Không bao gồm' : 'Not included'}
            tokens={tokens}
          />
        </View>
      ) : (
        <Text style={[styles.missingText, { color: tokens.muted }]} testID="customer-v21-performance-missing">
          {language === 'vi'
            ? `Còn ${missingQuestions.length} thông tin bắt buộc để Kael tạo phạm vi.`
            : `${missingQuestions.length} required answer${missingQuestions.length === 1 ? '' : 's'} remaining.`}
        </Text>
      )}
    </View>
  )
}

function PerformanceQuestion({
  answer,
  index,
  language,
  onChange,
  question,
  tokens,
}: {
  answer: IntakeAnswerValue | undefined
  index: number
  language: AppLanguage
  onChange: (value: IntakeAnswerValue) => void
  question: IntakeQuestion
  tokens: CustomerThemeTokens
}) {
  const label = language === 'vi' ? question.labelVi : question.labelEn
  const helper = language === 'vi' ? question.helperVi : question.helperEn

  return (
    <View style={[styles.question, { borderBottomColor: tokens.border }]} testID={`customer-v21-performance-question-${question.id}`}>
      <View style={styles.questionHeading}>
        <Text style={[styles.questionIndex, { color: tokens.primary }]}>{String(index + 1).padStart(2, '0')}</Text>
        <View style={styles.questionCopy}>
          <Text style={[styles.questionLabel, { color: tokens.text }]}>{label}</Text>
          <Text style={[styles.requirement, { color: tokens.muted }]}>
            {question.required
              ? (language === 'vi' ? 'Bắt buộc' : 'Required')
              : (language === 'vi' ? 'Không bắt buộc' : 'Optional')}
          </Text>
        </View>
      </View>
      {helper ? <Text style={[styles.helper, { color: tokens.muted }]}>{helper}</Text> : null}
      {question.type === 'single_select' || question.type === 'multi_select' ? (
        <View style={styles.options}>
          {question.options?.map((option) => {
            const selected = question.type === 'multi_select'
              ? Array.isArray(answer) && answer.includes(option.value)
              : answer === option.value
            return (
              <KaelChip
                accessibilityState={{ selected }}
                key={option.value}
                label={language === 'vi' ? option.labelVi : option.labelEn}
                onPress={() => onChange(nextOptionValue(question, answer, option.value))}
                testID={`customer-v21-performance-option-${question.id}-${option.value}`}
                variant={selected ? 'selected' : 'unselected'}
              />
            )
          })}
        </View>
      ) : null}
      {question.type === 'number' ? (
        <KaelInlineStepper
          decrementButtonTestID={`customer-v21-performance-number-${question.id}-decrement`}
          decrementDisabled={typeof answer !== 'number' || answer <= (question.min ?? 0)}
          decrementLabel={language === 'vi' ? `Giảm ${label}` : `Decrease ${label}`}
          incrementDisabled={typeof answer === 'number' && answer >= (question.max ?? Number.MAX_SAFE_INTEGER)}
          incrementButtonTestID={`customer-v21-performance-number-${question.id}-increment`}
          incrementLabel={language === 'vi' ? `Tăng ${label}` : `Increase ${label}`}
          onDecrement={() => onChange(Math.max(question.min ?? 0, (typeof answer === 'number' ? answer : question.min ?? 0) - 1))}
          onIncrement={() => onChange(Math.min(question.max ?? Number.MAX_SAFE_INTEGER, (typeof answer === 'number' ? answer : (question.min ?? 1) - 1) + 1))}
          testID={`customer-v21-performance-number-${question.id}`}
          value={typeof answer === 'number' ? answer : '—'}
          valueAccessibilityLabel={label}
        />
      ) : null}
      {question.type === 'text' ? (
        <KaelTextField
          accessibilityLabel={label}
          inputShellStyle={[styles.textShell, { backgroundColor: tokens.base, borderColor: tokens.border }]}
          multiline
          onChangeText={onChange}
          placeholder={language === 'vi' ? question.placeholderVi : question.placeholderEn}
          placeholderTextColor={tokens.subtleText}
          style={[styles.textInput, { color: tokens.text }]}
          testID={`customer-v21-performance-text-${question.id}`}
          value={typeof answer === 'string' ? answer : ''}
        />
      ) : null}
    </View>
  )
}

function ScopeMetric({ label, tokens, value }: { label: string; tokens: CustomerThemeTokens; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: tokens.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: tokens.muted }]}>{label}</Text>
    </View>
  )
}

function ScopeList({ items, title, tokens }: { items: readonly string[]; title: string; tokens: CustomerThemeTokens }) {
  return (
    <View style={styles.list}>
      <Text style={[styles.listTitle, { color: tokens.text }]}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.listRow}>
          <View style={[styles.bullet, { backgroundColor: tokens.primary }]} />
          <Text style={[styles.listText, { color: tokens.muted }]}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

function nextOptionValue(question: IntakeQuestion, current: IntakeAnswerValue | undefined, value: string): IntakeAnswerValue {
  if (question.type !== 'multi_select') return value
  const values = Array.isArray(current) ? current : []
  if (value === 'none') return values.includes('none') ? [] : ['none']
  const withoutNone = values.filter((entry) => entry !== 'none')
  if (withoutNone.includes(value)) return withoutNone.filter((entry) => entry !== value)
  if (question.maxSelections && withoutNone.length >= question.maxSelections) return withoutNone
  return [...withoutNone, value]
}

function performanceStatusCopy(kind: ReturnType<typeof runKaelAgenticPerformanceStep>['kind'], language: AppLanguage) {
  const copy = {
    vi: {
      ask_question: 'Cần thêm thông tin',
      request_media: 'Cần ảnh để tăng độ tin cậy',
      show_scope_card: 'Sẵn sàng để bạn kiểm tra',
      needs_human_review: 'Cần chuyên viên duyệt',
      create_job_handoff: 'Sẵn sàng tạo yêu cầu',
      beta_service_blocked: 'Đang ở chế độ xem trước',
    },
    en: {
      ask_question: 'More information needed',
      request_media: 'Photos needed for confidence',
      show_scope_card: 'Ready for your review',
      needs_human_review: 'Specialist review required',
      create_job_handoff: 'Ready to create request',
      beta_service_blocked: 'Scope preview mode',
    },
  } as const
  return copy[language][kind]
}

function confidenceCopy(value: 'low' | 'medium' | 'high', language: AppLanguage) {
  if (language === 'vi') return value === 'high' ? 'Tin cậy cao' : value === 'medium' ? 'Tin cậy vừa' : 'Tin cậy thấp'
  return value === 'high' ? 'High confidence' : value === 'medium' ? 'Medium confidence' : 'Low confidence'
}

function complexityCopy(value: 'small' | 'medium' | 'large', language: AppLanguage) {
  if (language === 'vi') return value === 'small' ? 'Nhỏ' : value === 'medium' ? 'Vừa' : 'Lớn'
  return value === 'small' ? 'Small' : value === 'medium' ? 'Medium' : 'Large'
}

const styles = StyleSheet.create({
  bullet: { borderRadius: 999, height: 5, marginTop: 7, width: 5 },
  confidence: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  helper: { fontSize: 12, lineHeight: 17, marginLeft: 32 },
  intro: { gap: 4 },
  introText: { fontSize: 13, lineHeight: 19 },
  list: { gap: 7, marginTop: 14 },
  listRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  listText: { flex: 1, fontSize: 12, lineHeight: 18 },
  listTitle: { fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  mediaAction: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  mediaCopy: { flex: 1 },
  mediaCount: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  mediaHelper: { marginLeft: 0, marginTop: 2 },
  mediaSection: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 12 },
  metric: { flex: 1, gap: 2 },
  metricLabel: { fontSize: 10.5, lineHeight: 14 },
  metricValue: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 14 },
  missingText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 32, marginTop: 4 },
  question: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, paddingBottom: 16 },
  questionCopy: { flex: 1 },
  questionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  questionIndex: { fontSize: 11, fontWeight: '800', lineHeight: 18, width: 22 },
  questionLabel: { fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  requirement: { fontSize: 10.5, lineHeight: 14, marginTop: 1 },
  root: { gap: 16 },
  scopeCard: { borderCurve: 'continuous', borderRadius: 20, borderWidth: 1, padding: 15 },
  scopeHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  scopeHeaderCopy: { flex: 1 },
  scopeName: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2, lineHeight: 16 },
  scopeStatus: { fontSize: 11.5, fontWeight: '600', lineHeight: 16, marginTop: 2 },
  scopeTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  textInput: { fontSize: 13, lineHeight: 19, minHeight: 64, padding: 12 },
  textShell: { borderRadius: 16, marginLeft: 32 },
})
