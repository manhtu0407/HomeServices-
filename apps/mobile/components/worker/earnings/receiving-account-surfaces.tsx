import { useState } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { WorkerV5SingleSourceActionButton } from '../jobs/advisory-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import {
  WORKER_V5_BANK_OPTIONS,
  resolveWorkerV5BankLogoName,
  workerV5BankLogos,
  type WorkerV5BankLogoName,
} from './banks'
import { styles } from './receiving-account-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerReceivingTokens = ReturnType<typeof getWorkerThemeTokens>

function Text({ color, style, ...props }: TextProps & { color?: string }) {
  return <RNText {...props} style={[styles.workerCustomerFontText, color ? { color } : null, style]} />
}

function surface(tokens: WorkerReceivingTokens) {
  return {
    backgroundColor: tokens.base,
    borderColor: tokens.border,
  }
}

function normalizedAccount(value: string) {
  return value.replace(/\D/g, '').slice(0, 24)
}

function statusCopy(status: 'pending_verification' | 'verified' | 'rejected' | undefined, language: AppLanguage) {
  if (status === 'verified') return textByLanguage(language, 'Đã xác nhận', 'Verified')
  if (status === 'pending_verification') return textByLanguage(language, 'Đang chờ xác nhận', 'Awaiting verification')
  if (status === 'rejected') return textByLanguage(language, 'Cần cập nhật lại', 'Needs an update')
  return null
}

export function WorkerV5ReceivingAccount({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const payoutMethod = runtime.workerPayoutMethod
  const profile = runtime.workerProfile
  const recordedBank = resolveWorkerV5BankLogoName(payoutMethod?.bank_name)
  const [selectedBankOverride, setSelectedBankOverride] = useState<WorkerV5BankLogoName | null>(null)
  const selectedBank = selectedBankOverride ?? recordedBank
  const [holderName, setHolderName] = useState(profile?.legal_name?.trim() ?? '')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountConfirmation, setAccountConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'error' | 'success' | null>(null)

  const selectedBankOption = selectedBank
    ? WORKER_V5_BANK_OPTIONS.find((bank) => bank.code === selectedBank) ?? null
    : null
  const accountMatches = accountNumber.length >= 6 && accountNumber === accountConfirmation
  const canConfirm = Boolean(
    selectedBankOption &&
    holderName.trim().length >= 2 &&
    accountMatches &&
    !saving,
  )

  const confirmAccount = async () => {
    if (!selectedBankOption || !canConfirm) return
    setSaving(true)
    setMessage(null)
    setMessageTone(null)
    const result = await runtime.actions.workerSavePayoutMethod({
      account_holder_name: holderName.trim(),
      bank_account: accountNumber,
      bank_key: selectedBankOption.code,
    })
    if (result === true) {
      setMessage(textByLanguage(language, 'Đã gửi tài khoản để kiểm tra.', 'The account was sent for review.'))
      setMessageTone('success')
    } else {
      setMessage(textByLanguage(
        language,
        'Hiện chưa thể lưu tài khoản. Thông tin của bạn chưa bị thay đổi.',
        'The account cannot be saved yet. Your information was not changed.',
      ))
      setMessageTone('error')
    }
    setSaving(false)
  }

  return (
    <View
      style={[styles.accountCard, surface(tokens)]}
      testID="worker-v5-bank-account-form"
    >
      {payoutMethod ? (
        <View style={[styles.recordedAccount, surface(tokens)]}>
          <Text color={tokens.muted} style={styles.recordedLabel}>{textByLanguage(language, 'Tài khoản hiện tại', 'Current account')}</Text>
          <Text color={tokens.text} style={styles.recordedValue}>
            {payoutMethod.bank_name || textByLanguage(language, 'Ngân hàng', 'Bank')} · {payoutMethod.bank_account_masked}
          </Text>
          {statusCopy(payoutMethod.status, language) ? (
            <Text color={tokens.primary} style={styles.recordedStatus}>{statusCopy(payoutMethod.status, language)}</Text>
          ) : null}
        </View>
      ) : null}

      <Text color={tokens.text} style={styles.sectionTitle}>{textByLanguage(language, 'Chọn ngân hàng', 'Choose a bank')}</Text>
      <View style={styles.bankGrid}>
        {WORKER_V5_BANK_OPTIONS.map((bank) => {
          const selected = bank.code === selectedBank
          return (
            <Pressable
              accessibilityLabel={bank.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={bank.code}
              onPress={() => {
                setSelectedBankOverride(bank.code)
                setMessage(null)
                setMessageTone(null)
              }}
              style={({ pressed }) => [
                styles.bankOption,
                surface(tokens),
                selected && [styles.bankOptionSelected, { backgroundColor: tokens.service, borderColor: tokens.primary }],
                pressed && styles.bankOptionPressed,
              ]}
              testID={`worker-v5-bank-option-${bank.code}`}
            >
              <View style={[styles.bankLogoFrame, surface(tokens)]} testID={`worker-v5-bank-logo-frame-${bank.code}`}>
                <Image contentFit="contain" source={workerV5BankLogos[bank.code]} style={styles.bankLogo} />
              </View>
              <Text color={selected ? tokens.primary : tokens.muted} style={styles.bankName}>{bank.label}</Text>
              {selected ? <Text color={tokens.primaryText} style={[styles.selectedMark, { backgroundColor: tokens.primary }]}>✓</Text> : null}
            </Pressable>
          )
        })}
      </View>

      <Text color={tokens.text} style={styles.sectionTitle}>{textByLanguage(language, 'Thông tin tài khoản', 'Account details')}</Text>
      <Text color={tokens.muted} style={styles.fieldLabel}>{textByLanguage(language, 'Tên chủ tài khoản', 'Account holder name')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Tên chủ tài khoản', 'Account holder name')}
        autoCapitalize="characters"
        onChangeText={(value) => {
          setHolderName(value)
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập đúng tên trên tài khoản', 'Enter the name on the account')}
        placeholderTextColor={tokens.subtleText}
        style={[styles.input, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
        testID="worker-v5-bank-holder-input"
        value={holderName}
      />

      <Text color={tokens.muted} style={styles.fieldLabel}>{textByLanguage(language, 'Số tài khoản', 'Account number')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Số tài khoản', 'Account number')}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setAccountNumber(normalizedAccount(value))
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập số tài khoản', 'Enter the account number')}
        placeholderTextColor={tokens.subtleText}
        style={[styles.input, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
        testID="worker-v5-bank-account-input"
        value={accountNumber}
      />

      <Text color={tokens.muted} style={styles.fieldLabel}>{textByLanguage(language, 'Nhập lại số tài khoản', 'Confirm account number')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Nhập lại số tài khoản', 'Confirm account number')}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setAccountConfirmation(normalizedAccount(value))
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập lại để kiểm tra', 'Enter it again to confirm')}
        placeholderTextColor={tokens.subtleText}
        style={[
          styles.input,
          { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text },
          accountConfirmation.length > 0 && !accountMatches && { borderColor: tokens.danger },
        ]}
        testID="worker-v5-bank-account-confirm-input"
        value={accountConfirmation}
      />
      {accountConfirmation.length > 0 && !accountMatches ? (
        <Text color={tokens.danger} style={styles.validationText}>
          {textByLanguage(language, 'Hai số tài khoản chưa giống nhau.', 'The account numbers do not match.')}
        </Text>
      ) : null}

      <View style={styles.confirmActionSpacing} testID="worker-v5-bank-confirm-spacing">
        <WorkerV5SingleSourceActionButton
          disabled={!canConfirm}
          label={saving
            ? textByLanguage(language, 'Đang xác nhận', 'Confirming')
            : textByLanguage(language, 'Xác nhận tài khoản', 'Confirm account')}
          onPress={() => void confirmAccount()}
          primaryButtonFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          testID="worker-v5-bank-confirm-action"
        />
      </View>
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          color={messageTone === 'error' ? tokens.danger : tokens.primary}
          style={styles.message}
          testID="worker-v5-bank-save-message"
        >
          {message}
        </Text>
      ) : null}
      <Text color={tokens.muted} style={styles.privacyNote}>
        {textByLanguage(
          language,
          'Hãy kiểm tra kỹ trước khi xác nhận. Ứng dụng chỉ hiển thị lại số tài khoản ở dạng đã che.',
          'Check carefully before confirming. The app only shows the account number in masked form afterward.',
        )}
      </Text>
    </View>
  )
}
