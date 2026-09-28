import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useRfqPrice } from '@/lib/frontend-workflow/use-rfq-price'

const copy = {
  vi: { title: 'Báo giá sau khảo sát', source: 'Thợ đề xuất • Chỉ khóa giá khi khách đồng ý',
    total: 'Tổng tiền khách thanh toán (VND)', scope: 'Phạm vi công việc và vật tư đã bao gồm',
    send: 'Gửi báo giá cho khách', approve: 'Đồng ý báo giá này', reject: 'Chưa đồng ý',
    loading: 'Đang tải báo giá', refresh: 'Đối soát báo giá', pending: 'Chờ khách xem và xác nhận báo giá.',
    approved: 'Khách đã xác nhận phạm vi và tổng giá này.', rejected: 'Khách chưa đồng ý. Cần trao đổi và gửi báo giá mới.',
    empty: 'Thợ chưa gửi báo giá sau khảo sát. Công việc chưa được bắt đầu.',
    notice: 'Chưa thu tiền ở bước này. Không thực hiện thêm phần việc ngoài phạm vi đã được khách đồng ý.',
    busy: 'Đang xử lý', reference: 'Mã báo giá' },
  en: { title: 'Post-inspection quote', source: 'Proposed by the worker • Locked only after customer approval',
    total: 'Total payable by the customer (VND)', scope: 'Work scope and included materials',
    send: 'Send quote to customer', approve: 'Approve this quote', reject: 'Not agreed',
    loading: 'Loading quote', refresh: 'Reconcile quote', pending: 'Waiting for the customer to review and approve.',
    approved: 'The customer approved this scope and exact total.', rejected: 'The customer has not agreed. Discuss and submit a new quote.',
    empty: 'The worker has not submitted a post-inspection quote. Work cannot start yet.',
    notice: 'No payment is collected at this step. Do not perform additional work outside the customer-approved scope.',
    busy: 'Processing', reference: 'Quote ID' },
} as const

type PanelProps = { jobId: string; actorRole: 'customer' | 'worker'; language: AppLanguage;
  tokens: CustomerThemeTokens; onChanged: () => unknown }

export function RfqPricePanel(props: PanelProps) {
  const auth = useAuth()
  const ownerId = auth.session?.user.id
  const token = auth.session?.access_token
  if (auth.role !== props.actorRole || !ownerId || !token) return null
  return <RfqPriceSession key={ownerId + ':' + props.jobId} {...props} ownerId={ownerId} token={token} />
}
function RfqPriceSession(props: PanelProps & { ownerId: string; token: string }) {
  const state = useRfqPrice({ ...props, role: props.actorRole })
  return <RfqPricePanelView {...props} state={state} />
}
export function RfqPricePanelView({ actorRole, language, tokens, state }: {
  actorRole: 'customer' | 'worker'; language: AppLanguage; tokens: CustomerThemeTokens;
  state: ReturnType<typeof useRfqPrice>;
}) {
  const [price, setPrice] = useState('')
  const [scope, setScope] = useState('')
  const c = copy[language]
  const proposal = state.proposal
  const disabled = state.busy || state.pending || !state.loaded
  if (state.loaded && !['rfq', 'inspection_only'].includes(state.snapshot?.quote_mode ?? '')) return null
  const textStyle = [styles.text, { color: tokens.text }]
  const button = (label: string, action: () => unknown, testID: string, blocked = disabled) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: state.busy }} disabled={blocked}
      onPress={action} testID={testID} style={({ pressed }) => [styles.button,
        { borderColor: tokens.borderStrong, backgroundColor: pressed || blocked ? tokens.disabled : tokens.base }]}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  )
  return (
    <View testID="rfq-price-panel" style={[styles.panel, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}>
      <Text accessibilityRole="header" style={[textStyle, styles.title]}>{c.title}</Text>
      <Text style={textStyle}>{c.source}</Text>
      {!state.loaded && !state.error ? <Text style={textStyle}>{c.loading}</Text> : null}
      {proposal ? <>
        <Text style={textStyle}>{c.scope}</Text>
        <Text selectable style={textStyle}>{proposal.scope_summary}</Text>
        <Text style={textStyle}>{c.total}</Text>
        <Text testID="rfq-exact-total" style={[textStyle, styles.price]}>
          {proposal.customer_total.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} VND
        </Text>
        <Text accessibilityLiveRegion="polite" style={textStyle}>{c[proposal.status]}</Text>
        <Text selectable style={[textStyle, styles.reference]}>{c.reference}: {proposal.id}</Text>
      </> : state.loaded ? <Text style={textStyle}>{c.empty}</Text> : null}
      {actorRole === 'worker' && state.loaded && (!proposal || proposal.status === 'rejected') ? <>
        <Text style={textStyle}>{c.total}</Text>
        <TextInput spellCheck={false} accessibilityLabel={c.total} testID="rfq-price-input" value={price} onChangeText={setPrice}
          editable={!disabled} keyboardType="number-pad" maxLength={10}
          style={[styles.input, { color: tokens.text, borderColor: tokens.borderStrong }]} />
        <Text style={textStyle}>{c.scope}</Text>
        <TextInput spellCheck={false} accessibilityLabel={c.scope} testID="rfq-scope-input" value={scope} onChangeText={setScope}
          editable={!disabled} multiline maxLength={2000} textAlignVertical="top"
          style={[styles.input, styles.scope, { color: tokens.text, borderColor: tokens.borderStrong }]} />
        {button(c.send, () => state.propose(/^[1-9][0-9]*$/.test(price) ? Number(price) : NaN, scope), 'rfq-price-send')}
      </> : null}
      {actorRole === 'customer' && proposal?.status === 'pending' ? <>
        {button(c.approve, () => state.decide(true), 'rfq-price-approve')}
        {button(c.reject, () => state.decide(false), 'rfq-price-reject')}
      </> : null}
      {state.error ? <Text accessibilityRole="alert" style={textStyle}>{state.error}</Text> : null}
      {state.busy ? <Text accessibilityLiveRegion="polite" style={textStyle}>{c.busy}</Text> : null}
      {button(c.refresh, state.refresh, 'rfq-price-refresh', state.busy)}
      <Text style={textStyle}>{c.notice}</Text>
    </View>
  )
}
const styles = StyleSheet.create({
  panel: { padding: 16, borderWidth: 1, borderRadius: 20, gap: 12, marginVertical: 12 },
  text: { fontSize: 16, lineHeight: 23, flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '600' },
  price: { fontSize: 24, lineHeight: 32, fontWeight: '600', fontVariant: ['tabular-nums'] },
  reference: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  scope: { minHeight: 96 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center' },
})
