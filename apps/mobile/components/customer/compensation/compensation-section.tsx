import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
  CompensationNegotiationPanel,
  compensationFailureCopy,
  formatCompensationVnd,
  parseVndInput,
} from '@/components/job/compensation-negotiation'
import { EvidencePhotoSlots } from '@/components/job/evidence-photo-slots'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { MAX_COMPENSATION_PHOTOS, uploadCompensationPhotos, type CompensationPhotoDraft } from '@/lib/frontend-workflow/compensation-evidence'
import {
  compensationService,
  type CompensationPolicy,
  type CustomerCompensation,
} from '@/lib/services/compensation-service'

import { violationLabel } from '../../worker/discipline/violation-copy'
import type { CustomerThemeTokens } from '../customer-theme'

const MIN_NOTE = 10

// Shown in history only while the customer has a confirmed damage case; renders nothing
// otherwise, so a customer without a problem never sees the word "compensation". A failed load
// shows a retry row instead of nothing, so an open case is never hidden by a network error.
export function CustomerCompensationSection({ language, tokens }: { language: AppLanguage; tokens: CustomerThemeTokens }) {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const [data, setData] = useState<CustomerCompensation | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    const result = await compensationService.listForCustomer(accessToken)
    if (result.success) {
      setData(result.data)
      setLoadFailed(false)
    } else {
      setLoadFailed(true)
      console.warn('customer compensation load failed', { code: result.code, status: result.status })
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  if (!data && loadFailed) {
    return (
      <View style={[styles.card, styles.retryRow, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-compensation-unavailable">
        <Text style={[styles.meta, styles.retryText, { color: tokens.muted }]}>
          {language === 'vi' ? 'Chưa tải được mục bồi thường' : 'Compensation did not load'}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void load()} testID="customer-compensation-retry">
          <Text style={[styles.meta, styles.retryAction, { color: tokens.primary }]}>{language === 'vi' ? 'Thử lại' : 'Try again'}</Text>
        </Pressable>
      </View>
    )
  }
  if (!data || data.items.length === 0) return null
  const palette = { text: tokens.text, muted: tokens.muted, border: tokens.border, accent: tokens.primary }
  return (
    <View style={styles.stack} testID="customer-compensation-section">
      {data.items.map((item) => (
        <View key={item.case_id} style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={`customer-compensation-${item.case_id}`}>
          <Text style={[styles.eyebrow, { color: tokens.muted }]}>{language === 'vi' ? 'Bồi thường' : 'Compensation'}</Text>
          <Text style={[styles.title, { color: tokens.text }]}>{violationLabel(item.violation_code, language)}</Text>
          {item.worker_name ? <Text style={[styles.meta, { color: tokens.muted }]}>{item.worker_name}</Text> : null}
          {!data.refund_account_ready && item.negotiation?.status !== 'declined' && item.negotiation?.status !== 'expired' && item.negotiation?.payout?.status !== 'paid' ? (
            <Text style={[styles.meta, { color: tokens.primary }]} testID={`customer-compensation-${item.case_id}-refund-hint`}>
              {language === 'vi'
                ? 'Thêm tài khoản hoàn tiền (Hồ sơ → Tài khoản hoàn tiền) để nhận bồi thường.'
                : 'Add a refund account (Profile → Refund account) to receive compensation.'}
            </Text>
          ) : null}
          {item.negotiation ? (
            <CompensationNegotiationPanel
              language={language}
              negotiation={item.negotiation}
              onRespond={async (input) => {
                const result = await compensationService.respondAsCustomer(item.negotiation!.id, input, accessToken)
                if (!result.success) return compensationFailureCopy(result, language)
                await load()
                return null
              }}
              palette={palette}
              policy={data.policy}
              side="customer"
              testID={`customer-compensation-${item.case_id}-negotiation`}
            />
          ) : (
            <CompensationClaimForm
              caseId={item.case_id}
              language={language}
              onOpened={load}
              policy={data.policy}
              tokens={tokens}
            />
          )}
        </View>
      ))}
    </View>
  )
}

export function CompensationClaimForm({ caseId, language, onOpened, policy, tokens }: {
  caseId: string
  language: AppLanguage
  onOpened: () => Promise<void>
  policy: CompensationPolicy
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const { session } = useAuth()
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<CompensationPhotoDraft[]>([])
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const amount = parseVndInput(amountText)
  const ready = amount !== null && amount >= policy.min_vnd && amount <= policy.max_vnd && note.trim().length >= MIN_NOTE

  const submit = async () => {
    if (!ready || pending || amount === null) return
    setPending(true)
    setMessage(null)
    const accessToken = session?.access_token ?? ''
    const uploaded = await uploadCompensationPhotos(caseId, photos, accessToken)
    if (!uploaded.success) {
      setPending(false)
      setMessage(vi ? 'Chưa tải được ảnh. Kiểm tra kết nối rồi thử lại, hoặc bỏ ảnh đó.' : 'Could not upload a photo. Check your connection and try again, or remove it.')
      return
    }
    const result = await compensationService.openClaim(caseId, { amount_vnd: amount, note: note.trim(), evidence_paths: uploaded.paths }, accessToken)
    setPending(false)
    if (!result.success) {
      setMessage(compensationFailureCopy(result, language))
      return
    }
    await onOpened()
  }

  return (
    <View style={styles.form}>
      <Text style={[styles.meta, { color: tokens.muted }]}>
        {vi
          ? `Báo cáo đã được xác nhận. Nêu số tiền và bằng chứng thiệt hại; thợ có ${policy.response_days} ngày để trả lời, tối đa ${policy.max_offers} lượt đề xuất.`
          : `Report confirmed. State the loss and its evidence; the worker has ${policy.response_days} days to reply, at most ${policy.max_offers} offers.`}
      </Text>
      <KaelTextField
        accessibilityLabel={vi ? 'Số tiền đề nghị bồi thường (VND)' : 'Amount requested (VND)'}
        keyboardType="number-pad"
        onChangeText={setAmountText}
        placeholder={vi
          ? `Số tiền, từ ${formatCompensationVnd(policy.min_vnd, language)} đến ${formatCompensationVnd(policy.max_vnd, language)}`
          : `Amount, ${formatCompensationVnd(policy.min_vnd, language)} to ${formatCompensationVnd(policy.max_vnd, language)}`}
        testID={`customer-compensation-${caseId}-amount`}
        value={amountText}
      />
      <KaelTextField
        multiline
        accessibilityLabel={vi ? 'Mô tả thiệt hại' : 'Describe the loss'}
        onChangeText={setNote}
        placeholder={vi ? 'Mô tả thiệt hại và căn cứ số tiền' : 'Describe the loss and how you reached the amount'}
        testID={`customer-compensation-${caseId}-note`}
        value={note}
      />
      <EvidencePhotoSlots
        label={vi ? `Ảnh thiệt hại hoặc hóa đơn (tối đa ${MAX_COMPENSATION_PHOTOS})` : `Photos of the damage or receipt (up to ${MAX_COMPENSATION_PHOTOS})`}
        language={language}
        max={MAX_COMPENSATION_PHOTOS}
        onChange={setPhotos}
        palette={{ text: tokens.text, muted: tokens.muted, border: tokens.border, tile: tokens.service, raised: tokens.raised }}
        photos={photos}
        testID={`customer-compensation-${caseId}-photos`}
      />
      <KaelButton
        disabled={!ready || pending}
        label={vi ? 'Gửi đề nghị bồi thường' : 'Send compensation request'}
        onPress={() => { void submit() }}
        testID={`customer-compensation-${caseId}-submit`}
        variant="primary"
      />
      {message ? <Text accessibilityRole="alert" style={[styles.meta, { color: tokens.text }]}>{message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    marginTop: 14,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  eyebrow: {
    ...typography.caption1,
    fontWeight: '600',
  },
  title: {
    ...typography.headline,
  },
  meta: {
    ...typography.footnote,
  },
  form: {
    gap: 8,
    marginTop: 4,
  },
  retryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  retryText: {
    flex: 1,
  },
  retryAction: {
    fontWeight: '600',
  },
})
