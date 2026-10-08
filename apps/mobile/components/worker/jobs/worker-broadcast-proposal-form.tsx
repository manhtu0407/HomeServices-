import { useReducer, useRef } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type {
  WorkerBroadcastProposalAction,
  WorkerBroadcastProposalInput,
} from '@/lib/api-types'
import { validateWorkerProposal } from '@/lib/frontend-workflow/worker-proposal'
import type { WorkerThemeTokens } from '../worker-theme'
import { textByLanguage } from '../ui/format'
import { Text } from './worker-jobs-zip-prototype-shared'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'
import { withoutInputLineHeight } from '@/components/ui/input-text-style'

type ProposalAction = Exclude<WorkerBroadcastProposalAction, 'accept_priced_offer'>

type ProposalFormState = {
  attempted: boolean
  priceMaxText: string
  priceMinText: string
  scopeSummary: string
  submitting: boolean
}

type ProposalFormAction = { type: 'patch'; patch: Partial<ProposalFormState> }

const INITIAL_PROPOSAL_FORM_STATE: ProposalFormState = {
  attempted: false,
  priceMaxText: '',
  priceMinText: '',
  scopeSummary: '',
  submitting: false,
}

function proposalFormReducer(state: ProposalFormState, action: ProposalFormAction): ProposalFormState {
  return { ...state, ...action.patch }
}

export function WorkerBroadcastProposalForm({
  action,
  alreadyApplied = false,
  busy,
  language,
  onSubmit,
  submitted,
  tokens,
}: {
  action: ProposalAction
  alreadyApplied?: boolean
  busy: boolean
  language: AppLanguage
  onSubmit: (input: WorkerBroadcastProposalInput) => Promise<boolean>
  submitted: boolean
  tokens: WorkerThemeTokens
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const submitInFlightRef = useRef(false)
  const [form, dispatch] = useReducer(proposalFormReducer, INITIAL_PROPOSAL_FORM_STATE)
  const { attempted, priceMaxText, priceMinText, scopeSummary, submitting } = form
  const validation = validateWorkerProposal(action, { priceMaxText, priceMinText, scopeSummary })
  const disabled = busy || submitting
  const isRfq = action === 'submit_rfq_proposal'
  const copy = proposalCopy(action, language)

  if (submitted) {
    return (
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.card, { backgroundColor: tokens.statusSurface, borderColor: tokens.borderStrong }]}
        testID="worker-stage1-proposal-success"
      >
        <Text style={[styles.title, { color: tokens.text }]}>{copy.successTitle}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>
          {alreadyApplied ? copy.alreadyApplied : copy.successBody}
        </Text>
      </View>
    )
  }

  const submit = async () => {
    dispatch({ type: 'patch', patch: { attempted: true } })
    if (!validation.success || busy || submitInFlightRef.current) return
    submitInFlightRef.current = true
    dispatch({ type: 'patch', patch: { submitting: true } })
    try {
      await onSubmit(validation.input)
    } finally {
      submitInFlightRef.current = false
      dispatch({ type: 'patch', patch: { submitting: false } })
    }
  }

  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
      testID="worker-stage1-proposal-form"
    >
      <Text style={[styles.title, { color: tokens.text }]}>{copy.title}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{copy.body}</Text>
      <Text style={[styles.label, { color: tokens.text }]}>{copy.scopeLabel}</Text>
      <TextInput spellCheck={false}
        accessibilityLabel={copy.scopeLabel}
        maxLength={2_000}
        multiline
        onChangeText={(value) => dispatch({ type: 'patch', patch: { scopeSummary: value } })}
        placeholder={copy.scopePlaceholder}
        placeholderTextColor={tokens.subtleText}
        style={withoutInputLineHeight([styles.scopeInput, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }])}
        testID="worker-stage1-proposal-scope"
        textAlignVertical="top"
        value={scopeSummary}
      />
      {isRfq ? (
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Text style={[styles.label, { color: tokens.text }]}>{copy.priceMin}</Text>
            <TextInput spellCheck={false}
              accessibilityLabel={copy.priceMin}
              keyboardType="number-pad"
              maxLength={12}
              onChangeText={(value) => dispatch({ type: 'patch', patch: { priceMinText: value } })}
              placeholder="₫"
              placeholderTextColor={tokens.subtleText}
              style={withoutInputLineHeight([styles.priceInput, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }])}
              testID="worker-stage1-proposal-price-min"
              value={priceMinText}
            />
          </View>
          <View style={styles.priceField}>
            <Text style={[styles.label, { color: tokens.text }]}>{copy.priceMax}</Text>
            <TextInput spellCheck={false}
              accessibilityLabel={copy.priceMax}
              keyboardType="number-pad"
              maxLength={12}
              onChangeText={(value) => dispatch({ type: 'patch', patch: { priceMaxText: value } })}
              placeholder="₫"
              placeholderTextColor={tokens.subtleText}
              style={withoutInputLineHeight([styles.priceInput, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }])}
              testID="worker-stage1-proposal-price-max"
              value={priceMaxText}
            />
          </View>
        </View>
      ) : null}
      {attempted && !validation.success ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.danger }]}>
          {validationMessage(validation.code, language)}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: busy || submitting, disabled }}
        disabled={disabled}
        onPress={() => void submit()}
        style={[styles.button, { backgroundColor: disabled ? tokens.disabled : tokens.primary }]}
        testID="worker-stage1-proposal-submit"
      >
        <Text style={[styles.buttonText, { color: disabled ? tokens.subtleText : tokens.primaryText }]}>
          {busy || submitting ? copy.submitting : copy.submit}
        </Text>
      </Pressable>
    </View>
  )
}

function proposalCopy(action: ProposalAction, language: AppLanguage) {
  const rfq = action === 'submit_rfq_proposal'
  return {
    title: rfq
      ? textByLanguage(language, 'Đề xuất báo giá', 'Quote proposal')
      : textByLanguage(language, 'Phạm vi khảo sát', 'Inspection scope'),
    body: rfq
      ? textByLanguage(language, 'Nhập phạm vi và khoảng giá thật bạn có thể thực hiện.', 'Enter the real scope and price range you can deliver.')
      : textByLanguage(language, 'Mô tả phạm vi bạn sẽ khảo sát. Bước này không gửi giá.', 'Describe what you will inspect. This step does not submit a price.'),
    scopeLabel: textByLanguage(language, 'Phạm vi đề xuất', 'Proposed scope'),
    scopePlaceholder: textByLanguage(language, 'Mô tả hạng mục và giới hạn công việc', 'Describe the work items and limits'),
    priceMin: textByLanguage(language, 'Giá tối thiểu', 'Minimum price'),
    priceMax: textByLanguage(language, 'Giá tối đa', 'Maximum price'),
    submit: rfq
      ? textByLanguage(language, 'Gửi đề xuất báo giá', 'Send quote proposal')
      : textByLanguage(language, 'Gửi phạm vi khảo sát', 'Send inspection scope'),
    submitting: textByLanguage(language, 'Đang gửi đề xuất', 'Sending proposal'),
    successTitle: textByLanguage(language, 'Đề xuất đã được ghi nhận', 'Proposal recorded'),
    successBody: textByLanguage(language, 'Đang chờ khách xem và lựa chọn.', 'Waiting for the customer to review and choose.'),
    alreadyApplied: textByLanguage(language, 'Đề xuất trước đó đã được giữ nguyên; không tạo bản trùng.', 'The previous proposal was preserved; no duplicate was created.'),
  }
}

function validationMessage(code: string, language: AppLanguage) {
  if (code === 'PROPOSAL_SCOPE_INVALID') {
    return textByLanguage(language, 'Phạm vi cần từ 3 đến 2.000 ký tự.', 'Scope must be between 3 and 2,000 characters.')
  }
  if (code === 'PROPOSAL_PRICE_RANGE_INVALID') {
    return textByLanguage(language, 'Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.', 'Maximum price must be at least the minimum price.')
  }
  return textByLanguage(language, 'Nhập đủ hai mức giá hợp lệ.', 'Enter both valid price bounds.')
}

const stylesLight = StyleSheet.create({
  body: { ...typography.subheadline },
  button: { alignItems: 'center', borderRadius: 16, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  buttonText: { ...typography.body, fontWeight: '700' },
  card: { borderRadius: 20, borderWidth: 1, gap: 10, padding: 16 },
  error: { ...typography.footnote },
  label: { ...typography.footnote, fontWeight: '700' },
  priceField: { flex: 1, gap: 6 },
  priceInput: { ...typography.subheadline, borderRadius: 12, borderWidth: 1, minHeight: 46, paddingHorizontal: 12 },
  priceRow: { flexDirection: 'row', gap: 10 },
  scopeInput: { ...typography.subheadline, borderRadius: 14, borderWidth: 1, minHeight: 104, padding: 12 },
  title: { ...typography.title3, fontWeight: '700' },
})
