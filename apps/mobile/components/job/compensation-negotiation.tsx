import type { CompensationResponseInput } from '@nestscout/shared'
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { CompensationNegotiation, CompensationPolicy } from '@/lib/services/compensation-service'

export type CompensationPalette = { text: string; muted: string; border: string; accent: string }
type Side = 'customer' | 'worker'

export function formatCompensationVnd(value: number, language: AppLanguage) {
  return `${new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)}${language === 'vi' ? 'đ' : ' VND'}`
}

function formatDate(value: string, language: AppLanguage) {
  const date = new Date(value)
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  return `${date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}

// The server names each refusal in Vietnamese; English readers get the same meaning by code.
export function compensationFailureCopy(failure: { code?: string; error?: string }, language: AppLanguage): string {
  if (language === 'vi' && failure.error) return failure.error
  switch (failure.code) {
    case 'INSUFFICIENT_BALANCE':
      return language === 'vi' ? 'Số dư của thợ không đủ cho mức bồi thường này.' : 'The worker balance cannot cover this amount.'
    case 'INVALID_STATUS':
      return language === 'vi' ? 'Đề nghị đã thay đổi. Tải lại để xem trạng thái mới.' : 'The offer has changed. Reload to see its current state.'
    case 'VALIDATION':
      return language === 'vi' ? 'Số tiền hoặc nội dung chưa hợp lệ.' : 'The amount or description is not valid.'
    default:
      return language === 'vi' ? 'Chưa gửi được. Kiểm tra kết nối rồi thử lại.' : 'Could not send. Check your connection and try again.'
  }
}

export function parseVndInput(value: string): number | null {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

function offerLine(offer: CompensationNegotiation['offers'][number], language: AppLanguage) {
  const vi = language === 'vi'
  const who = offer.actor_role === 'customer' ? (vi ? 'Khách' : 'Customer') : (vi ? 'Thợ' : 'Worker')
  const money = offer.amount_vnd === null ? '' : ` ${formatCompensationVnd(offer.amount_vnd, language)}`
  switch (offer.action) {
    case 'claim': return `${who} ${vi ? 'đề nghị' : 'asked for'}${money}`
    case 'counter': return `${who} ${vi ? 'đề xuất' : 'offered'}${money}`
    case 'accept': return `${who} ${vi ? 'đồng ý' : 'accepted'}`
    case 'decline': return `${who} ${vi ? 'từ chối' : 'declined'}`
  }
}

function statusLine(negotiation: CompensationNegotiation, side: Side, language: AppLanguage) {
  const vi = language === 'vi'
  const amount = formatCompensationVnd(negotiation.current_amount_vnd, language)
  switch (negotiation.status) {
    case 'agreed':
      if (negotiation.payout?.status === 'paid') {
        return side === 'customer'
          ? (vi ? `NestScout đã chuyển ${amount} cho bạn.` : `NestScout has transferred ${amount} to you.`)
          : (vi ? `Đã chuyển ${amount} cho khách từ số dư của bạn.` : `${amount} was paid to the customer from your balance.`)
      }
      return side === 'customer'
        ? (vi ? `Hai bên đã thống nhất ${amount}. NestScout sẽ chuyển khoản và báo khi hoàn tất.` : `Both sides agreed on ${amount}. NestScout will transfer it and let you know.`)
        : (vi ? `Hai bên đã thống nhất ${amount}. Khoản này được giữ từ số dư để chuyển cho khách.` : `Both sides agreed on ${amount}. It is held from your balance for the customer.`)
    case 'declined':
    case 'expired': {
      const ended = negotiation.status === 'declined' ? (vi ? 'Không thống nhất được.' : 'No agreement was reached.') : (vi ? 'Đã quá hạn trả lời.' : 'The reply deadline passed.')
      return side === 'customer'
        ? `${ended} ${vi ? 'Bạn có thể trình báo cơ quan có thẩm quyền; NestScout sẽ cung cấp hồ sơ khi được yêu cầu.' : 'You can report it to the authorities; NestScout will provide the record on request.'}`
        : `${ended} ${vi ? 'Vụ việc có thể được chuyển tới cơ quan có thẩm quyền.' : 'The matter may go to the authorities.'}`
    }
    default: {
      const mine = negotiation.status === (side === 'customer' ? 'awaiting_customer' : 'awaiting_worker')
      const deadline = formatDate(negotiation.respond_by, language)
      return mine
        ? (vi ? `Đến lượt bạn trả lời · hạn ${deadline}` : `Your turn to reply · by ${deadline}`)
        : (vi ? `Đang chờ bên kia trả lời · hạn ${deadline}` : `Waiting for a reply · by ${deadline}`)
    }
  }
}

export function CompensationNegotiationPanel({
  language,
  maxOfferVnd,
  negotiation,
  onRespond,
  palette,
  policy,
  side,
  testID,
}: {
  language: AppLanguage
  maxOfferVnd?: number
  negotiation: CompensationNegotiation
  onRespond: (input: CompensationResponseInput) => Promise<string | null>
  palette: CompensationPalette
  policy: CompensationPolicy
  side: Side
  testID: string
}) {
  const vi = language === 'vi'
  const [amountText, setAmountText] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const myTurn = negotiation.status === (side === 'customer' ? 'awaiting_customer' : 'awaiting_worker')
  const counter = parseVndInput(amountText)
  const upper = Math.min(policy.max_vnd, maxOfferVnd ?? policy.max_vnd)
  const counterValid = counter !== null && counter >= policy.min_vnd && counter <= upper && counter !== negotiation.current_amount_vnd
  const acceptBlocked = side === 'worker' && maxOfferVnd !== undefined && negotiation.current_amount_vnd > maxOfferVnd

  const respond = async (input: CompensationResponseInput) => {
    if (pending) return
    setPending(true)
    setMessage(null)
    const failure = await onRespond(input)
    setPending(false)
    if (failure) setMessage(failure)
    else setAmountText('')
  }

  return (
    <View style={styles.panel} testID={testID}>
      {negotiation.evidence.length > 0 ? (
        <View style={styles.photos} testID={`${testID}-photos`}>
          {negotiation.evidence.map((item, index) => item.signed_url ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={vi ? `Ảnh bằng chứng ${index + 1}` : `Evidence photo ${index + 1}`}
              contentFit="cover"
              key={item.path}
              source={{ uri: item.signed_url }}
              style={[styles.photo, { borderColor: palette.border }]}
            />
          ) : null)}
        </View>
      ) : null}
      {negotiation.offers.map((offer, index) => (
        <View key={`${offer.created_at}-${index}`} style={[styles.offerRow, index > 0 ? [styles.offerDivider, { borderTopColor: palette.border }] : null]}>
          <Text style={[styles.offerTitle, { color: palette.text }]}>{offerLine(offer, language)}</Text>
          {offer.note ? <Text style={[styles.offerNote, { color: palette.muted }]}>{offer.note}</Text> : null}
        </View>
      ))}
      <Text accessibilityRole="text" style={[styles.status, { color: palette.accent }]} testID={`${testID}-status`}>
        {statusLine(negotiation, side, language)}
      </Text>
      {myTurn ? (
        <View style={styles.actions}>
          {acceptBlocked ? (
            <Text style={[styles.offerNote, { color: palette.muted }]}>
              {vi
                ? 'Số dư chưa đủ để đồng ý mức này.'
                : 'Your balance cannot cover this amount.'}
            </Text>
          ) : (
            <KaelButton
              disabled={pending}
              label={vi ? `Đồng ý ${formatCompensationVnd(negotiation.current_amount_vnd, language)}` : `Accept ${formatCompensationVnd(negotiation.current_amount_vnd, language)}`}
              onPress={() => { void respond({ action: 'accept' }) }}
              testID={`${testID}-accept`}
              variant="primary"
            />
          )}
          {negotiation.offers_left > 0 ? (
            <>
              <KaelTextField
                accessibilityLabel={vi ? 'Mức bồi thường đề xuất (VND)' : 'Proposed amount (VND)'}
                keyboardType="number-pad"
                onChangeText={setAmountText}
                placeholder={vi
                  ? `Mức khác (tối đa ${formatCompensationVnd(upper, language)})`
                  : `Another amount (up to ${formatCompensationVnd(upper, language)})`}
                testID={`${testID}-amount`}
                value={amountText}
              />
              <KaelButton
                disabled={pending || !counterValid}
                label={vi ? `Đề xuất mức khác · còn ${negotiation.offers_left} lượt` : `Offer another amount · ${negotiation.offers_left} left`}
                onPress={() => { if (counter !== null) void respond({ action: 'counter', amount_vnd: counter }) }}
                testID={`${testID}-counter`}
                variant="secondary"
              />
            </>
          ) : null}
          <KaelButton
            disabled={pending}
            label={vi ? 'Từ chối' : 'Decline'}
            onPress={() => { void respond({ action: 'decline' }) }}
            testID={`${testID}-decline`}
            variant="ghost"
          />
        </View>
      ) : null}
      {message ? <Text accessibilityRole="alert" style={[styles.offerNote, { color: palette.text }]}>{message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: 8,
  },
  photos: {
    flexDirection: 'row',
    gap: 8,
  },
  photo: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    maxWidth: 110,
  },
  offerRow: {
    gap: 2,
  },
  offerDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  offerTitle: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  offerNote: {
    ...typography.footnote,
  },
  status: {
    ...typography.subheadline,
    marginTop: 4,
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
})
