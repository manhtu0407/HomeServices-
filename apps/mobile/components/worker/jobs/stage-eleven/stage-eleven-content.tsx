import React from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { PrimaryCtaFill, primaryCtaFrame } from '@/components/ui/primary-cta-fill'
import { stageTypography } from '../stage-ratio'
import { StageElevenIcon, type StageElevenIconName } from './stage-eleven-icons'
import { StageElevenSuccess } from './stage-eleven-success'
import { formatStageElevenDate, formatStageElevenMoney, stageElevenServiceName, text11 } from './stage-eleven-model'
import { stageElevenTokens as tLight } from './stage-eleven.tokens'
import type { StageElevenActions, StageElevenImage, StageElevenLanguage, StageElevenModel, StageElevenSupplement } from './stage-eleven.types'
import { workerThemedStylesProxy, workerThemedTokensProxy } from '../../ui/worker-dark-styles'

const t = workerThemedTokensProxy(tLight)

export type StageElevenContentProps = {
  model: StageElevenModel
  actions: StageElevenActions
  language?: StageElevenLanguage
  supplement?: StageElevenSupplement
  photoSource?: StageElevenImage | null
  /** @deprecated Kept for existing callers only. Stage 11 no longer renders branding. */
  brandSource?: StageElevenImage | null
  reduceMotion?: boolean
  reduceTransparency?: boolean
  motionKey?: string | number
  showHeader?: boolean
}
type ContentState = { paymentExpanded: boolean; busy: boolean; notice: string | null; photoFailed: boolean; compact: boolean }

/** Content only: existing WorkerJobsZipPrototype owns safe area + ScrollView.
 * Never add a second same-direction ScrollView around this in the Jobs host.
 */
export class StageElevenContent extends React.PureComponent<StageElevenContentProps, ContentState> {
  state: ContentState = { paymentExpanded: true, busy: false, notice: null, photoFailed: false, compact: false }
  private mounted = false
  private actionVersion = 0
  componentDidMount() { this.mounted = true }
  componentWillUnmount() { this.mounted = false; this.actionVersion += 1 }
  componentDidUpdate(previous: StageElevenContentProps) {
    if (previous.model.jobId !== this.props.model.jobId || previous.model.state !== this.props.model.state) {
      this.actionVersion += 1
      if (this.state.notice || this.state.busy) this.setState({ notice: null, busy: false })
    }
    if (previous.model.jobId !== this.props.model.jobId || previous.photoSource !== this.props.photoSource) {
      if (this.state.photoFailed) this.setState({ photoFailed: false })
    }
  }
  private run = async (action: () => Promise<void | boolean>, success?: string) => {
    if (this.state.busy) return
    const version = ++this.actionVersion
    this.setState({ busy: true, notice: null })
    try {
      const result = await action()
      if (this.mounted && version === this.actionVersion) this.setState({ notice: result === false
        ? text11(this.props.language ?? 'vi', 'Chưa cập nhật được. Vui lòng thử lại.', 'Unable to update. Please retry.')
        : success ?? null })
    } catch {
      if (this.mounted && version === this.actionVersion) this.setState({ notice: text11(this.props.language ?? 'vi', 'Không thực hiện được. Vui lòng thử lại.', 'Action failed. Please retry.') })
    } finally { if (this.mounted && version === this.actionVersion) this.setState({ busy: false }) }
  }
  render() {
    const { model, actions, supplement = {}, photoSource, reduceMotion, reduceTransparency, motionKey, showHeader = true } = this.props
    const language = this.props.language ?? 'vi'
    // The reference design never resolved text against the window at all (a real bug, not a
    // style nit — this screen was frozen at whatever size it first measured); it now goes
    // through the same canonical scale every other stage uses.
    const windowWidth = Dimensions.get('window').width
    const tx = (vi: string, en: string) => text11(language, vi, en)
    const confirmed = model.state === 'confirmed'
    const payout = confirmed && supplement.bankPayoutConfirmed === true
    const receipt = confirmed && supplement.receiptAvailable === true && !!actions.onOpenReceipt
    const titles = {
      confirmed: tx('Thanh toán thành công', 'Payment confirmed'),
      pending: tx('Đang chờ thanh toán', 'Payment pending'),
      held: tx('Thanh toán đang đối soát', 'Payment under review'),
      failed: tx('Thanh toán cần kiểm tra', 'Payment needs attention'),
      missing: tx('Chưa có dữ liệu thanh toán', 'No payment data'),
    }
    const unknown = tx('Chưa có thông tin', 'Not available')
    const money = (amount: number) => formatStageElevenMoney(amount, language)
    const hasRating = typeof supplement.jobRating === 'number' && Number.isFinite(supplement.jobRating)
      && supplement.jobRating >= 1 && supplement.jobRating <= 5
    const amountDescription = !confirmed
      ? tx('Chỉ xác nhận khi hệ thống ghi nhận thanh toán.', 'Confirmation requires a recorded payment.')
      : payout
        ? tx('Thu nhập đã được chuyển vào tài khoản của bạn', 'Your payout has reached your account')
        : model.amountKind === 'worker-net'
          ? tx('Thu nhập thực nhận đã được ghi vào sổ thu nhập', 'Net earnings recorded in your earnings ledger')
          : model.amountKind === 'direct-total'
            ? tx('Tiền khách trả trực tiếp; chưa trừ phí nền tảng', 'Customer paid you directly; platform fees may apply')
            : tx('Khoản thanh toán của khách đã được ghi nhận', 'The customer payment has been recorded')
    return <View style={s.content} testID="worker-v5-stage-eleven-payment-confirmed"
      onLayout={(event) => { const compact = event.nativeEvent.layout.width < 335; if (compact !== this.state.compact) this.setState({ compact }) }}>
      {showHeader && <View style={s.header} testID="stage11-header">
        <Pressable style={s.back} onPress={actions.onBack ?? actions.onEarnings} accessibilityRole="button" accessibilityLabel={tx('Về thu nhập', 'Back to earnings')} testID="stage11-back">
          <StageElevenIcon name="back" size={20} color={t.greenDeep}/>
        </Pressable>
      </View>}

      <View style={s.hero} testID="worker-v5-stage-eleven-hero">
        <StageElevenSuccess state={model.state} reduceMotion={reduceMotion} motionKey={motionKey ?? `${model.jobId}:${model.recordedAt}:${model.state}`}/>
        <View style={[s.successPill, !confirmed && s.pendingPill]}>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[stageTypography('headline', windowWidth), s.successTitle, !confirmed && { color: t.warning }]}>{titles[model.state]}</Text>
        </View>
        <Text selectable style={[
          model.amount === null ? { ...stageTypography('title2', windowWidth), fontWeight: '700' } : stageTypography('largeTitle', windowWidth, 47 / 34),
          s.amount,
        ]} testID="worker-v5-stage-eleven-amount">
          {model.amount === null ? (confirmed ? tx('Số tiền đang cập nhật', 'Amount unavailable') : '—') : money(model.amount)}
        </Text>
        <Text style={[stageTypography('footnote', windowWidth), s.heroSubtitle]}>{amountDescription}</Text>
      </View>

      <View style={s.summary}>
        <Summary icon="wallet" title={payout ? tx('Đã chuyển khoản', 'Transferred') : tx('Thu nhập', 'Earnings')}
          value={confirmed ? (model.amountKind === 'worker-net' ? tx('Đã ghi nhận', 'Recorded') : tx('Xem đối soát', 'View ledger')) : tx('Đang chờ', 'Pending')}
          onPress={actions.onEarnings} testID="worker-v5-stage-eleven-earnings-action" windowWidth={windowWidth}/>
        <Summary icon={confirmed ? 'check' : 'clock'} title={tx('Trạng thái', 'Status')}
          value={confirmed ? tx('Đã xác nhận', 'Confirmed') : tx('Chưa xác nhận', 'Not confirmed')} windowWidth={windowWidth}/>
        <Summary icon="receipt" title={receipt ? tx('Có biên lai', 'Receipt ready') : tx('Biên lai', 'Receipt')}
          value={receipt ? tx('Đã lưu hệ thống', 'Stored') : tx('Chưa có tệp', 'Not available')} windowWidth={windowWidth}/>
      </View>

      <Card reduceTransparency={reduceTransparency} testID="stage11-job-card">
        <View style={s.cardHeading}>
          <View style={s.headingLabel}><StageElevenIcon name="briefcase" color={t.green} size={22} filled/><Text style={[stageTypography('subheadline', windowWidth), s.cardTitle]}>{tx('Thông tin công việc', 'Job details')}</Text></View>
          <Text style={[stageTypography('caption2', windowWidth), s.chip]}>{model.job.completed ? tx('Đã hoàn tất', 'Completed') : tx('Đang cập nhật', 'Updating')}</Text>
        </View>
        <View style={s.jobRow}>
          <View style={[s.photo, this.state.compact && s.photoCompact]}>
            {photoSource && !this.state.photoFailed
              ? <Image source={photoSource} contentFit="cover" style={s.photoImage} onError={() => this.setState({ photoFailed: true })}
                  accessibilityLabel={tx('Ảnh của công việc', 'Job photograph')}/>
              : <View style={s.photoFallback}><StageElevenIcon name="home" size={32} color="#9CB9AD"/><Text style={[stageTypography('caption2', windowWidth), s.photoFallbackText]}>{tx('Chưa có ảnh', 'No photo')}</Text></View>}
          </View>
          <View style={s.jobDetails}>
            <Text style={[stageTypography('callout', windowWidth), s.jobName]}>{stageElevenServiceName(model.job.serviceType, language)}</Text>
            <Meta icon="pin" value={model.job.district ?? unknown} windowWidth={windowWidth}/>
            <Meta icon="user" value={supplement.customerMaskedName ? tx(`Khách: ${supplement.customerMaskedName}`, `Customer: ${supplement.customerMaskedName}`) : tx('Thông tin khách được bảo vệ', 'Customer details protected')} windowWidth={windowWidth}/>
            <Meta icon="calendar" value={formatStageElevenDate(model.job.completedAt, language)} windowWidth={windowWidth}/>
            {hasRating ? <View style={s.rating} accessibilityLabel={tx(`Đánh giá đơn: ${supplement.jobRating} trên 5`, `Job rating: ${supplement.jobRating} out of 5`)}>
              {[0, 1, 2, 3, 4].map((i) => <StageElevenIcon key={i} name="star" size={17} color={t.gold} filled={i < Math.floor(supplement.jobRating!)}/>)}
              <Text style={[stageTypography('subheadline', windowWidth), s.ratingValue]}>{supplement.jobRating!.toFixed(1)}</Text>
            </View> : <Text style={[stageTypography('caption2', windowWidth), s.noRating]}>{tx('Chưa có đánh giá cho đơn này', 'No review for this job yet')}</Text>}
          </View>
        </View>
      </Card>

      <Card reduceTransparency={reduceTransparency} testID="worker-v5-stage-eleven-payment-card">
        <Pressable style={s.disclosureHeading} onPress={() => this.setState((state) => ({ paymentExpanded: !state.paymentExpanded }))}
          accessibilityRole="button" accessibilityState={{ expanded: this.state.paymentExpanded }} accessibilityLabel={tx('Thông tin thanh toán', 'Payment information')} testID="stage11-payment-toggle">
          <View style={s.headingLabel}><StageElevenIcon name="bank"/><Text style={[stageTypography('subheadline', windowWidth), s.cardTitle]}>{tx('Thông tin thanh toán', 'Payment information')}</Text></View>
          <View style={{ transform: [{ rotate: this.state.paymentExpanded ? '180deg' : '0deg' }] }}><StageElevenIcon name="down" size={18}/></View>
        </Pressable>
        {this.state.paymentExpanded && <View style={s.detailRows} testID="stage11-payment-details">
          <Detail icon="bank" label={tx('Phương thức', 'Method')} value={model.method === 'bank' ? tx('Chuyển khoản ngân hàng', 'Bank transfer') : model.method === 'cash' ? tx('Thanh toán trực tiếp', 'Direct payment') : unknown} windowWidth={windowWidth}/>
          <Detail icon="clock" label={tx('Thời gian ghi nhận', 'Recorded at')} value={formatStageElevenDate(model.recordedAt, language)} windowWidth={windowWidth}/>
          <Detail icon="wallet" label={tx('Tài khoản nhận', 'Receiver account')} value={supplement.receiverAccountLabel ?? unknown} windowWidth={windowWidth}/>
          <View style={s.transactionRow}>
            <View style={s.transactionValue}><Detail icon="receipt" label={tx('Mã thanh toán', 'Payment reference')} value={model.transactionCode ?? unknown} windowWidth={windowWidth}/></View>
            {model.transactionCode && actions.onCopyTransaction && <Pressable style={s.copy} accessibilityRole="button"
              accessibilityLabel={tx('Sao chép mã thanh toán', 'Copy payment reference')}
              disabled={this.state.busy} onPress={() => void this.run(() => actions.onCopyTransaction!(model.transactionCode!), tx('Đã sao chép mã thanh toán', 'Payment reference copied'))}
              testID="stage11-copy"><StageElevenIcon name="copy" size={18}/></Pressable>}
          </View>
        </View>}
      </Card>

      <Card reduceTransparency={reduceTransparency} testID="stage11-income-card">
        <View style={s.cardHeading}><View style={s.headingLabel}><StageElevenIcon name="coins"/><Text style={[stageTypography('subheadline', windowWidth), s.cardTitle]}>{tx('Chi tiết thu nhập', 'Earnings breakdown')}</Text></View></View>
        {model.income ? <View style={s.detailRows}>
          <Detail icon="home" label={tx('Giá trị công việc', 'Job value')} value={money(model.income.gross)} windowWidth={windowWidth}/>
          <Detail icon="wallet" label={tx('Phí nền tảng', 'Platform fee')} value={`${model.income.fee > 0 ? '−' : ''}${money(model.income.fee)}`} windowWidth={windowWidth}/>
          <View style={s.totalRow}><Text style={[stageTypography('footnote', windowWidth), s.totalLabel]}>{tx('Thu nhập thực nhận', 'Net earnings')}</Text><Text selectable style={[stageTypography('title3', windowWidth), s.totalValue]}>{money(model.income.net)}</Text></View>
        </View> : <View><Text style={[stageTypography('caption1', windowWidth), s.emptyCopy]}>{tx('Chưa có chi tiết đối soát. Không dùng giá dịch vụ để thay cho thu nhập thực nhận.', 'Settlement breakdown is not available. The service price is not your net earnings.')}</Text>
          <Pressable onPress={actions.onHistory} accessibilityRole="button" style={s.inlineLink} testID="stage11-income-history-action"><Text style={[stageTypography('footnote', windowWidth), s.linkText]}>{tx('Xem sổ thu nhập', 'Open earnings ledger')}</Text></Pressable></View>}
      </Card>

      {confirmed && <View style={s.thanks} testID="stage11-thanks">
        <View style={s.thanksIcon} accessible={false}><StageElevenIcon name="sprout" size={23} color={t.green} filled/></View>
        <View style={s.thanksCopy}><Text style={[stageTypography('subheadline', windowWidth), s.thanksTitle]}>{tx('Cảm ơn bạn!', 'Thank you!')}</Text>
          <Text style={[stageTypography('caption1', windowWidth), s.thanksBody]}>{tx('Hẹn gặp lại ở những công việc tiếp theo.', 'See you on your next assignment.')}</Text></View>
      </View>}
      {!confirmed && actions.onRefresh && <Button label={this.state.busy ? tx('Đang cập nhật…', 'Updating…') : tx('Kiểm tra lại thanh toán', 'Refresh payment')}
        icon="refresh" disabled={this.state.busy} onPress={() => void this.run(actions.onRefresh!)} testID="stage11-refresh" windowWidth={windowWidth}/>}
      {this.state.notice && <Text selectable accessibilityLiveRegion="polite" style={[stageTypography('caption1', windowWidth), s.notice]} testID="stage11-notice">{this.state.notice}</Text>}
      <View style={s.actions}>
        <Button primary icon="home" label={actions.onHome ? tx('Về trang chủ', 'Back to home') : tx('Mở thu nhập', 'Open earnings')}
          onPress={actions.onHome ?? actions.onEarnings} testID="stage11-home" windowWidth={windowWidth}/>
      </View>
    </View>
  }
}

/** Standalone wrapper for an Expo route, not for the already-scrolling Jobs host.
 * Supply safe bottom padding from the app's safe-area provider when needed.
 */
export function StageElevenScreen(props: StageElevenContentProps & { bottomInset?: number }) {
  return <ScrollView style={s.page} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
    contentContainerStyle={[s.scrollContent, { paddingBottom: Math.max(28, props.bottomInset ?? 0) }]}>
    <StageElevenContent {...props}/>
  </ScrollView>
}
function Summary({ icon, title, value, onPress, testID, windowWidth }: { icon: StageElevenIconName; title: string; value: string; onPress?: () => void; testID?: string; windowWidth: number }) {
  const body = <><StageElevenIcon name={icon} color={t.green} size={25} filled/>
    <Text style={[stageTypography('caption1', windowWidth), s.summaryTitle]}>{title}</Text><Text style={[stageTypography('caption2', windowWidth), s.summaryValue]}>{value}</Text></>
  return onPress ? <Pressable style={s.summaryTile} onPress={onPress} accessibilityRole="button" testID={testID}>{body}</Pressable>
    : <View style={s.summaryTile}>{body}</View>
}
function Card({ children, reduceTransparency, testID }: { children: React.ReactNode; reduceTransparency?: boolean; testID?: string }) {
  return <View style={[s.card, reduceTransparency && { boxShadow: 'none' }]} testID={testID}>{children}</View>
}
function Meta({ icon, value, windowWidth }: { icon: StageElevenIconName; value: string; windowWidth: number }) {
  return <View style={s.meta}><StageElevenIcon name={icon} size={16}/><Text selectable style={[stageTypography('caption1', windowWidth), s.metaText]}>{value}</Text></View>
}
function Detail({ icon, label, value, windowWidth }: { icon: StageElevenIconName; label: string; value: string; windowWidth: number }) {
  return <View style={s.detail}><StageElevenIcon name={icon} size={17}/><Text style={[stageTypography('caption1', windowWidth), s.detailLabel]}>{label}</Text><Text selectable style={[stageTypography('caption1', windowWidth), s.detailValue]}>{value}</Text></View>
}
function Button({ label, icon, onPress, primary, disabled, testID, windowWidth }: { label: string; icon: StageElevenIconName; onPress: () => void; primary?: boolean; disabled?: boolean; testID?: string; windowWidth: number }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [s.button, primary && s.primaryButton, disabled && s.disabled, pressed && !disabled && s.pressed]} testID={testID}>
    {primary ? <PrimaryCtaFill radius={0}/> : null}
    <View style={s.buttonContent}>
      <StageElevenIcon name={icon} size={19} color={primary ? '#FFFFFF' : t.text} filled={!!primary}/>
      <Text style={[stageTypography('footnote', windowWidth), s.buttonText, primary && { color: '#FFFFFF' }]}>{label}</Text>
    </View>
  </Pressable>
}
const s = workerThemedStylesProxy(StyleSheet.create({
  page: { flex: 1, backgroundColor: tLight.canvas },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  content: { gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: tLight.canvas },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FCFB', boxShadow: tLight.shadow },
  hero: { alignItems: 'center', paddingTop: 0, paddingBottom: 5 },
  successPill: { borderRadius: 99, backgroundColor: tLight.mintStrong, paddingVertical: 7, paddingHorizontal: 18, maxWidth: '100%' },
  pendingPill: { backgroundColor: '#FFF6E8' }, successTitle: { fontWeight: '600', color: tLight.greenDark, textAlign: 'center' },
  amount: { fontWeight: '700', fontVariant: ['tabular-nums'], color: tLight.greenDeep, marginTop: 7 },
  heroSubtitle: { color: tLight.muted, textAlign: 'center', paddingHorizontal: 8, marginTop: 1 },
  summary: { flexDirection: 'row', gap: 9 },
  summaryTile: { flex: 1, backgroundColor: tLight.mint, borderRadius: 16, paddingHorizontal: 5, paddingVertical: 13, minHeight: 97, alignItems: 'center', justifyContent: 'center', gap: 5 },
  summaryTitle: { textAlign: 'center', fontWeight: '600', color: tLight.text },
  summaryValue: { textAlign: 'center', color: tLight.muted },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tLight.line, borderRadius: tLight.cardRadius, padding: 13, boxShadow: tLight.shadow },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginBottom: 12, minHeight: 28 },
  headingLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  cardTitle: { fontWeight: '600', color: tLight.text, flexShrink: 1 },
  chip: { borderRadius: 99, backgroundColor: tLight.mint, color: tLight.greenDark, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
  jobRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' }, photo: { width: 105, minHeight: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F7F5' },
  photoCompact: { width: 84 }, photoImage: { width: '100%', height: '100%', position: 'absolute' },
  photoFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 }, photoFallbackText: { color: tLight.muted },
  jobDetails: { flex: 1, gap: 5 }, jobName: { fontWeight: '600', color: tLight.text },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' }, metaText: { flex: 1, color: tLight.muted },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 }, ratingValue: { marginLeft: 6, fontWeight: '600', color: tLight.text },
  noRating: { color: tLight.muted },
  disclosureHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: -7, marginBottom: 3 },
  detailRows: { gap: 12 }, detail: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  detailLabel: { color: tLight.muted, flex: 1 },
  detailValue: { color: tLight.text, textAlign: 'right', flex: 1.15, fontVariant: ['tabular-nums'] },
  transactionRow: { flexDirection: 'row', alignItems: 'center' }, transactionValue: { flex: 1 }, copy: { width: 44, height: 44, marginVertical: -13, alignItems: 'flex-end', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: tLight.line, paddingTop: 12, gap: 10 },
  totalLabel: { flexShrink: 1, fontWeight: '600', color: tLight.text },
  totalValue: { fontWeight: '700', color: tLight.green, fontVariant: ['tabular-nums'] },
  emptyCopy: { color: tLight.muted }, inlineLink: { minHeight: 44, justifyContent: 'center' }, linkText: { color: tLight.greenDark, fontWeight: '600' },
  // Quiet, white closing note: same content inset and typography as the cards.
  // No mint banner, oversized icon bubble, or additional card inside the card stack.
  thanks: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: tLight.canvas, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 9 },
  thanksIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  thanksCopy: { flex: 1, gap: 3 }, thanksTitle: { fontWeight: '600', color: tLight.text }, thanksBody: { color: tLight.muted },
  actions: { gap: 9, marginTop: 1 },
  button: { minHeight: 47, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#DCE5EC', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 1 },
  primaryButton: { minHeight: 52, backgroundColor: '#24B3A1', overflow: 'hidden', ...primaryCtaFrame }, buttonText: { fontWeight: '600', color: tLight.text, flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: .45 }, pressed: { opacity: .76, transform: [{ scale: .985 }] },
  notice: { color: tLight.greenDark, paddingVertical: 6 },
}))
