import { useRef, useState } from 'react'
import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { WorkerV5SingleSourceActionButton } from '../jobs/advisory-surfaces'
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import { styles } from './payout-request-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function normalizedAmount(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

function formatAmount(value: number, language: AppLanguage) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  return `${value.toLocaleString(locale)} ${language === 'vi' ? 'đ' : 'VND'}`
}

function payoutMethodStatusCopy(
  status: NonNullable<WorkerV5Runtime['workerPayoutMethod']>['status'] | undefined,
  language: AppLanguage,
) {
  if (status === 'verified') {
    return textByLanguage(language, 'Tài khoản đã được xác nhận.', 'The receiving account is verified.')
  }
  if (status === 'pending_verification') {
    return textByLanguage(language, 'Tài khoản đang chờ quản trị viên xác nhận.', 'The receiving account is awaiting admin verification.')
  }
  if (status === 'rejected') {
    return textByLanguage(language, 'Tài khoản chưa được chấp nhận. Hãy cập nhật và gửi lại.', 'The receiving account was not accepted. Update and submit it again.')
  }
  return textByLanguage(language, 'Hãy thêm tài khoản nhận tiền trước khi tạo yêu cầu rút.', 'Add a receiving account before creating a withdrawal request.')
}

function withdrawalStatusCopy(
  status: WorkerV5Runtime['workerWithdrawalRequests'][number]['status'],
  language: AppLanguage,
) {
  if (status === 'pending') return textByLanguage(language, 'Đang chờ tiếp nhận', 'Awaiting review')
  if (status === 'processing') return textByLanguage(language, 'Đang chuyển thủ công', 'Manual transfer in progress')
  if (status === 'paid') return textByLanguage(language, 'Đã chi trả', 'Paid')
  if (status === 'rejected') return textByLanguage(language, 'Đã từ chối', 'Rejected')
  return textByLanguage(language, 'Chi trả chưa thành công', 'Payout failed')
}

export function WorkerV5PayoutRequest({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const [amountText, setAmountText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pendingRequestRef = useRef<PendingClientRequestId | null>(null)
  const payoutMethod = runtime.workerPayoutMethod
  const availableBalance = runtime.workerEarnings?.available_balance ?? null
  const reservedAmount = runtime.workerEarnings?.withdrawal_reserved_amount ?? null
  const latestRequest = runtime.workerWithdrawalRequests?.[0] ?? null
  const amount = Number(amountText)
  const accountVerified = payoutMethod?.status === 'verified'
  const validAmount = Number.isSafeInteger(amount) && amount > 0
  const enoughBalance = availableBalance !== null && validAmount && amount <= availableBalance
  const canSubmit = accountVerified && enoughBalance && !busy

  const submitRequest = async () => {
    if (!canSubmit || !payoutMethod || availableBalance === null) return
    const fingerprint = `${payoutMethod.id}:${amount}:${availableBalance}`
    const clientRequestId = stableClientRequestId(pendingRequestRef, fingerprint)
    setBusy(true)
    setMessage(null)
    const result = await runtime.actions.workerRequestWithdrawal({
      amount_vnd: amount,
      client_request_id: clientRequestId,
    })
    if (result === true) {
      clearStableClientRequestId(pendingRequestRef, fingerprint)
      setAmountText('')
      setMessage(textByLanguage(language, 'Yêu cầu rút tiền đã được ghi nhận. Số tiền này đang được giữ để chi trả.', 'The withdrawal request was recorded. This amount is now reserved for settlement.'))
    } else {
      if (result === false || !shouldRetainClientRequestId(result)) {
        clearStableClientRequestId(pendingRequestRef, fingerprint)
      }
      setMessage(textByLanguage(language, 'Chưa thể tạo yêu cầu rút tiền. Số dư của bạn chưa bị thay đổi.', 'The withdrawal request could not be created. Your balance was not changed.'))
    }
    setBusy(false)
  }

  return (
    <View style={[styles.card, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-request">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="PayoutRequest"
        testID="worker-v5-payout-request-formula-mint-aura"
      />
      <View style={styles.balanceBlock}>
        <Text style={styles.balanceLabel}>{textByLanguage(language, 'SỐ DƯ CÓ THỂ RÚT', 'WITHDRAWABLE BALANCE')}</Text>
        <Text style={styles.balanceValue} testID="worker-v5-payout-available-balance">
          {availableBalance === null
            ? textByLanguage(language, 'Đang tải', 'Loading')
            : formatAmount(availableBalance, language)}
        </Text>
        {reservedAmount !== null && reservedAmount > 0 ? (
          <Text style={styles.balanceNote}>
            {textByLanguage(language, `Đang giữ để chi trả: ${formatAmount(reservedAmount, language)}`, `Reserved for settlement: ${formatAmount(reservedAmount, language)}`)}
          </Text>
        ) : null}
      </View>

      <View style={styles.accountBlock}>
        <Text style={styles.sectionLabel}>{textByLanguage(language, 'TÀI KHOẢN NHẬN TIỀN', 'RECEIVING ACCOUNT')}</Text>
        {payoutMethod ? (
          <Text style={styles.accountValue}>{payoutMethod.bank_name} · {payoutMethod.bank_account_masked}</Text>
        ) : null}
        <Text style={styles.accountStatus}>{payoutMethodStatusCopy(payoutMethod?.status, language)}</Text>
      </View>

      <Text style={styles.fieldLabel}>{textByLanguage(language, 'Số tiền muốn rút', 'Withdrawal amount')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Số tiền muốn rút', 'Withdrawal amount')}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setAmountText(normalizedAmount(value))
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập số tiền bằng đồng Việt Nam', 'Enter an amount in Vietnamese dong')}
        placeholderTextColor="#78908E"
        style={styles.input}
        testID="worker-v5-payout-amount-input"
        value={amountText}
      />
      {amountText.length > 0 && !enoughBalance ? (
        <Text style={styles.validationText}>
          {availableBalance === null
            ? textByLanguage(language, 'Đang kiểm tra số dư có thể rút.', 'Checking the withdrawable balance.')
            : textByLanguage(language, 'Số tiền cần lớn hơn 0 và không vượt quá số dư có thể rút.', 'The amount must be greater than 0 and no more than the withdrawable balance.')}
        </Text>
      ) : null}

      <View style={styles.actionSpacing}>
        <WorkerV5SingleSourceActionButton
          disabled={!canSubmit}
          label={busy
            ? textByLanguage(language, 'Đang gửi yêu cầu', 'Submitting request')
            : textByLanguage(language, 'Gửi yêu cầu rút tiền', 'Submit withdrawal request')}
          onPress={() => void submitRequest()}
          primaryButtonFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          testID="worker-v5-payout-submit"
        />
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

      {latestRequest ? (
        <View style={styles.latestRequest} testID="worker-v5-payout-latest-request">
          <View>
            <Text style={styles.sectionLabel}>{textByLanguage(language, 'YÊU CẦU GẦN NHẤT', 'LATEST REQUEST')}</Text>
            <Text style={styles.latestAmount}>{formatAmount(latestRequest.amount_vnd, language)}</Text>
          </View>
          <Text style={styles.latestStatus}>{withdrawalStatusCopy(latestRequest.status, language)}</Text>
        </View>
      ) : null}

      <Text style={styles.note}>
        {textByLanguage(language, 'Quản trị viên sẽ chuyển tiền thủ công vào tài khoản đã xác nhận. Ứng dụng không tự động chuyển tiền.', 'An administrator will transfer funds manually to the verified account. The app does not transfer money automatically.')}
      </Text>
    </View>
  )
}
