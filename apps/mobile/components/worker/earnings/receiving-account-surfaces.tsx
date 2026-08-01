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
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import {
  WORKER_V5_BANK_OPTIONS,
  resolveWorkerV5BankLogoName,
  workerV5BankLogos,
  type WorkerV5BankLogoName,
} from './banks'
import { styles } from './receiving-account-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function normalizedAccount(value: string) {
  return value.replace(/\D/g, '').slice(0, 24)
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
  const profile = runtime.workerProfile
  const recordedBank = resolveWorkerV5BankLogoName(profile?.bank_name)
  const [selectedBank, setSelectedBank] = useState<WorkerV5BankLogoName | null>(recordedBank)
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
      bank_name: selectedBankOption.label,
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
      style={[styles.accountCard, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-bank-account-form"
    >
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="ReceivingAccount"
        testID="worker-v5-receiving-account-formula-mint-aura"
      />
      {profile?.bank_account_masked ? (
        <View style={styles.recordedAccount}>
          <Text style={styles.recordedLabel}>{textByLanguage(language, 'TÀI KHOẢN ĐANG DÙNG', 'CURRENT ACCOUNT')}</Text>
          <Text style={styles.recordedValue}>
            {profile.bank_name || textByLanguage(language, 'Ngân hàng', 'Bank')} · {profile.bank_account_masked}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{textByLanguage(language, 'Chọn ngân hàng', 'Choose a bank')}</Text>
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
                setSelectedBank(bank.code)
                setMessage(null)
                setMessageTone(null)
              }}
              style={({ pressed }) => [
                styles.bankOption,
                selected && styles.bankOptionSelected,
                pressed && styles.bankOptionPressed,
              ]}
              testID={`worker-v5-bank-option-${bank.code}`}
            >
              <Image contentFit="contain" source={workerV5BankLogos[bank.code]} style={styles.bankLogo} />
              <Text style={[styles.bankName, selected && styles.bankNameSelected]}>{bank.label}</Text>
              {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.sectionTitle}>{textByLanguage(language, 'Thông tin tài khoản', 'Account details')}</Text>
      <Text style={styles.fieldLabel}>{textByLanguage(language, 'Tên chủ tài khoản', 'Account holder name')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Tên chủ tài khoản', 'Account holder name')}
        autoCapitalize="characters"
        onChangeText={(value) => {
          setHolderName(value)
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập đúng tên trên tài khoản', 'Enter the name on the account')}
        placeholderTextColor="#78908E"
        style={styles.input}
        testID="worker-v5-bank-holder-input"
        value={holderName}
      />

      <Text style={styles.fieldLabel}>{textByLanguage(language, 'Số tài khoản', 'Account number')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Số tài khoản', 'Account number')}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setAccountNumber(normalizedAccount(value))
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập số tài khoản', 'Enter the account number')}
        placeholderTextColor="#78908E"
        style={styles.input}
        testID="worker-v5-bank-account-input"
        value={accountNumber}
      />

      <Text style={styles.fieldLabel}>{textByLanguage(language, 'Nhập lại số tài khoản', 'Confirm account number')}</Text>
      <KaelTextInput
        accessibilityLabel={textByLanguage(language, 'Nhập lại số tài khoản', 'Confirm account number')}
        keyboardType="number-pad"
        onChangeText={(value) => {
          setAccountConfirmation(normalizedAccount(value))
          setMessage(null)
        }}
        placeholder={textByLanguage(language, 'Nhập lại để kiểm tra', 'Enter it again to confirm')}
        placeholderTextColor="#78908E"
        style={[
          styles.input,
          accountConfirmation.length > 0 && !accountMatches && styles.inputMismatch,
        ]}
        testID="worker-v5-bank-account-confirm-input"
        value={accountConfirmation}
      />
      {accountConfirmation.length > 0 && !accountMatches ? (
        <Text style={styles.validationText}>
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
          style={[styles.message, messageTone === 'error' ? styles.messageError : styles.messageSuccess]}
          testID="worker-v5-bank-save-message"
        >
          {message}
        </Text>
      ) : null}
      <Text style={styles.privacyNote}>
        {textByLanguage(
          language,
          'Hãy kiểm tra kỹ trước khi xác nhận. Ứng dụng chỉ hiển thị lại số tài khoản ở dạng đã che.',
          'Check carefully before confirming. The app only shows the account number in masked form afterward.',
        )}
      </Text>
    </View>
  )
}
