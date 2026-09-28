import { useState } from 'react'
import { Linking, StyleSheet } from 'react-native'

import { formatCompensationVnd } from '@/components/job/compensation-negotiation'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AdminCompensationNegotiation, AdminCompensationPayee } from '@/lib/api-types/admin-program'
import type { AppLanguage } from '@/lib/app-language'
import { adminProgramService } from '@/lib/services/admin-program-service'

import { violationLabel } from '../worker/discipline/violation-copy'
import { AdminSystemDetailHeader, AdminSystemDetailScroll, AdminSystemField } from './admin-system-controls'
import { AdminText } from './admin-text'

const OFFER_ACTIONS = {
  claim: ['đề nghị', 'asked'],
  counter: ['đề xuất', 'offered'],
  accept: ['đồng ý', 'accepted'],
  decline: ['từ chối', 'declined'],
} as const

export function compensationStatusLabel(item: AdminCompensationNegotiation, vi: boolean) {
  if (item.payout?.status === 'paid') return vi ? 'Đã chuyển cho khách' : 'Paid to customer'
  switch (item.status) {
    case 'agreed': return vi ? 'Đã thống nhất · cần chuyển khoản' : 'Agreed · transfer due'
    case 'awaiting_worker': return vi ? 'Chờ thợ trả lời' : 'Waiting for worker'
    case 'awaiting_customer': return vi ? 'Chờ khách trả lời' : 'Waiting for customer'
    case 'declined': return vi ? 'Không thống nhất' : 'No agreement'
    case 'expired': return vi ? 'Quá hạn trả lời' : 'Reply deadline passed'
  }
}

// The admin never sets the amount: it is the one both sides accepted. The admin only records
// the transfer after sending it to the customer's own account.
export function AdminCompensationDetail({ item, language, onBack, onChanged }: {
  item: AdminCompensationNegotiation
  language: AppLanguage
  onBack: () => void
  onChanged: () => void
}) {
  const vi = language === 'vi'
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [payee, setPayee] = useState<AdminCompensationPayee | null>(null)
  const due = item.status === 'agreed' && item.payout?.status === 'reserved'

  const recordPaid = async () => {
    if (pending) return
    setPending(true)
    setNotice(null)
    const result = await adminProgramService.recordCompensationPaid(item.id, reference.trim())
    setPending(false)
    if (!result.success) {
      setNotice(result.error || (vi ? 'Chưa ghi nhận được' : 'Could not record the transfer'))
      return
    }
    setNotice(vi ? 'Đã ghi nhận chuyển khoản bồi thường' : 'Compensation transfer recorded')
    onChanged()
  }

  // The full account number is fetched only when the admin asks, because each read is logged.
  const showPayee = async () => {
    const result = await adminProgramService.getCompensationPayee(item.id)
    if (result.success) setPayee(result.data)
    else setNotice(result.error || (vi ? 'Chưa tải được tài khoản nhận tiền' : 'Could not load the payee account'))
  }

  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={compensationStatusLabel(item, vi)} title={violationLabel(item.violation_code, language)} />
    <AdminSystemField label={vi ? 'Khách' : 'Customer'} value={item.customer_name ?? '—'} />
    <AdminSystemField label={vi ? 'Thợ' : 'Worker'} value={item.worker_name ?? item.worker_id} />
    <AdminSystemField label={vi ? 'Mức hiện tại' : 'Current amount'} value={formatCompensationVnd(item.current_amount_vnd, language)} />
    {item.offers.map((offer, index) => <AdminSystemField
      key={`${offer.created_at}-${index}`}
      label={`${offer.actor_role === 'customer' ? (vi ? 'Khách' : 'Customer') : (vi ? 'Thợ' : 'Worker')} · ${OFFER_ACTIONS[offer.action][vi ? 0 : 1]}`}
      value={`${offer.amount_vnd === null ? '' : formatCompensationVnd(offer.amount_vnd, language)}${offer.note ? ` · ${offer.note}` : ''}`}
    />)}
    {item.evidence.map((photo, index) => photo.signed_url
      ? <KaelButton key={photo.path} label={`${vi ? 'Mở ảnh bằng chứng' : 'Open evidence photo'} ${index + 1}`} onPress={() => { void Linking.openURL(photo.signed_url as string) }} testID={`admin-compensation-photo-${index}`} variant="secondary" />
      : null)}
    {due ? <>
      {payee === null
        ? <KaelButton label={vi ? 'Hiện tài khoản nhận tiền của khách' : 'Show customer payee account'} onPress={() => { void showPayee() }} testID="admin-compensation-show-payee" variant="secondary" />
        : payee.account
          ? <>
            <AdminSystemField label={vi ? 'Ngân hàng' : 'Bank'} value={payee.account.bank_name} />
            <AdminSystemField label={vi ? 'Chủ tài khoản' : 'Account holder'} value={payee.account.account_holder_name} />
            <AdminSystemField label={vi ? 'Số tài khoản' : 'Account number'} value={payee.account.bank_account} />
            {!payee.account.verified ? <AdminText textRole="caption1" style={styles.meta}>{vi
              ? 'Tài khoản chưa được xác minh: đối chiếu tên chủ tài khoản với tên khách trước khi chuyển.'
              : 'Unverified account: match the holder name with the customer before transferring.'}</AdminText> : null}
          </>
          : <AdminText textRole="subheadline" testID="admin-compensation-no-payee">{vi
            ? 'Khách chưa thêm tài khoản hoàn tiền trong Hồ sơ. Chưa thể chuyển khoản.'
            : 'The customer has not added a refund account in Profile yet. The transfer cannot be made.'}</AdminText>}
      <AdminText textRole="caption1" style={styles.meta}>{vi
        ? 'Chuyển đúng số tiền này vào tài khoản của chính khách, rồi ghi mã giao dịch. Số tiền đã được giữ từ số dư của thợ khi hai bên đồng ý.'
        : 'Transfer exactly this amount to the customer\'s own account, then record the transaction reference. It was held from the worker balance when both sides agreed.'}</AdminText>
      <KaelTextField
        accessibilityLabel={vi ? 'Mã giao dịch chuyển khoản' : 'Transfer reference'}
        onChangeText={setReference}
        placeholder={vi ? 'Mã giao dịch ngân hàng' : 'Bank transaction reference'}
        placeholderTextColor={color.text.muted}
        testID="admin-compensation-reference"
        value={reference}
      />
      <KaelButton disabled={reference.trim().length < 3 || pending} label={vi ? 'Ghi nhận đã chuyển khoản' : 'Record transfer'} onPress={() => { void recordPaid() }} testID="admin-compensation-paid" variant="primary" />
    </> : null}
    {notice ? <AdminText accessibilityRole="alert" textRole="subheadline">{notice}</AdminText> : null}
  </AdminSystemDetailScroll>
}

const styles = StyleSheet.create({
  meta: {
    color: color.text.muted,
  },
})
