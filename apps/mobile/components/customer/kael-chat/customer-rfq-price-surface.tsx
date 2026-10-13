import { StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { useRfqPrice } from '@/lib/frontend-workflow/use-rfq-price'

import type { CustomerThemeTokens } from '../customer-theme'
import { CASE_WORK_CONTENT_INSET, CASE_WORK_RAIL_PADDING, CASE_WORK_ROW_STYLE, caseWorkAccentLine } from './case-work-response'
import { formatVnd } from './case-work-money-display-model'
import { kaelActionPrimaryStyle } from './kael-next-action-chips'

const COPY = {
  vi: {
    title: 'Báo giá sau khảo sát',
    status: { empty: 'Đang chờ thợ', loading: 'Đang tải', pending: 'Chờ bạn xác nhận', approved: 'Bạn đã xác nhận', rejected: 'Bạn chưa đồng ý' },
    source: 'Thợ đề xuất sau khi khảo sát. Giá chỉ được khóa khi bạn đồng ý.',
    scope: 'Phạm vi công việc và vật tư đã bao gồm',
    total: 'Tổng tiền bạn thanh toán',
    empty: 'Thợ chưa gửi báo giá sau khảo sát. Công việc chưa được bắt đầu.',
    approve: 'Đồng ý báo giá này',
    reject: 'Chưa đồng ý',
    refresh: 'Đối soát báo giá',
    busy: 'Đang xử lý',
    notice: 'Chưa thu tiền ở bước này. Thợ không làm thêm phần việc ngoài phạm vi bạn đã đồng ý.',
  },
  en: {
    title: 'Post-inspection quote',
    status: { empty: 'Waiting for the worker', loading: 'Loading', pending: 'Needs your approval', approved: 'You approved', rejected: 'You did not agree' },
    source: 'Proposed by the worker after the inspection. The price locks only when you agree.',
    scope: 'Work scope and included materials',
    total: 'Total you pay',
    empty: 'The worker has not sent a post-inspection quote. Work cannot start yet.',
    approve: 'Approve this quote',
    reject: 'Not agreed',
    refresh: 'Reconcile quote',
    busy: 'Processing',
    notice: 'No payment is collected at this step. The worker does no work outside the scope you agreed to.',
  },
} as const

// The worker's post-inspection quote as the customer sees it: one step on the case rail, the exact total as
// the focal figure, and the decision as the primary button, like every other confirmation in the thread.
export function CustomerRfqPriceSurface({ language, state, tokens }: {
  language: AppLanguage
  state: ReturnType<typeof useRfqPrice>
  tokens: CustomerThemeTokens
}) {
  const c = COPY[language]
  const proposal = state.proposal
  const blocked = state.busy || state.pending || !state.loaded
  const status = !state.loaded && !state.error ? c.status.loading : proposal ? c.status[proposal.status] : c.status.empty
  return (
    <View style={styles.row} testID="rfq-price-panel">
      <View style={[styles.rail, { borderLeftColor: caseWorkAccentLine(tokens) }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.heading, { color: tokens.text }]}>{c.title}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.status, { color: tokens.primary }]}>{status}</Text>
        </View>
        {proposal ? (
          <>
            <View style={styles.block}>
              <Text style={[styles.label, { color: tokens.muted }]}>{c.scope}</Text>
              <Text selectable style={[styles.body, { color: tokens.text }]}>{proposal.scope_summary}</Text>
            </View>
            <View style={[styles.total, { borderTopColor: tokens.border }]}>
              <Text style={[styles.label, { color: tokens.muted }]}>{c.total}</Text>
              <Text style={[styles.price, { color: tokens.text }]} testID="rfq-exact-total">{formatVnd(proposal.customer_total, language)}</Text>
            </View>
            <Text style={[styles.note, { color: tokens.muted }]}>{c.source}</Text>
          </>
        ) : state.loaded ? <Text style={[styles.body, { color: tokens.muted }]}>{c.empty}</Text> : null}
        {state.error ? <Text accessibilityRole="alert" style={[styles.note, { color: tokens.text }]}>{state.error}</Text> : null}
        {state.busy ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: tokens.muted }]}>{c.busy}</Text> : null}
        <View style={styles.actions}>
          {proposal?.status === 'pending' ? (
            <KaelButton
              accessibilityState={{ busy: state.busy, disabled: blocked }}
              disabled={blocked}
              label={c.approve}
              onPress={() => void state.decide(true)}
              style={kaelActionPrimaryStyle}
              testID="rfq-price-approve"
            />
          ) : null}
          <View style={styles.secondaryRow}>
            {proposal?.status === 'pending' ? (
              <KaelButton
                disabled={blocked}
                label={c.reject}
                onPress={() => void state.decide(false)}
                size="small"
                style={styles.secondary}
                testID="rfq-price-reject"
                variant="secondary"
              />
            ) : null}
            <KaelButton
              disabled={state.busy}
              label={c.refresh}
              onPress={() => void state.refresh()}
              size="small"
              style={proposal?.status === 'pending' ? styles.secondary : styles.secondaryFull}
              testID="rfq-price-refresh"
              variant="secondary"
            />
          </View>
        </View>
        <Text style={[styles.note, { color: tokens.muted }]}>{c.notice}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { alignSelf: 'stretch', gap: 12 },
  block: { gap: 4 },
  body: { ...typography.body },
  header: { gap: 4 },
  heading: { ...typography.headline, fontWeight: '600' },
  label: { ...typography.footnote },
  note: { ...typography.footnote },
  price: { ...typography.title3, fontVariant: ['tabular-nums'], fontWeight: '600' },
  rail: { borderLeftWidth: 2, gap: 18, marginLeft: CASE_WORK_CONTENT_INSET, maxWidth: 608, paddingLeft: CASE_WORK_RAIL_PADDING },
  row: { ...CASE_WORK_ROW_STYLE, paddingVertical: 8 },
  secondary: { flexBasis: '48%', flexGrow: 0, flexShrink: 0, minHeight: 44, paddingHorizontal: 12 },
  secondaryFull: { flexBasis: '100%', flexGrow: 0, minHeight: 44, paddingHorizontal: 12 },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  status: { ...typography.subheadline, fontWeight: '600' },
  total: { borderTopWidth: StyleSheet.hairlineWidth, gap: 4, paddingTop: 16 },
})
