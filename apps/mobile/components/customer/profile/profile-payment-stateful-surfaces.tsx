import { useEffect, useReducer, useRef } from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerRefundAccountResponse } from '@/lib/api-types'
import { customerProfileService } from '@/lib/services'

import type { CustomerThemeTokens } from '../customer-theme'
import type { CustomerV21BankKey } from '../ui/assets'
import { formatNumber } from '../kael-chat/case-work-display-model'
import {
  normalizeBankAccountNumber,
  paymentBankKeyFromUnknown,
  paymentBankOptions,
} from './payment-bank-display-model'
import { profileUtilityTitle } from './profile-display-model'
import { ProfileUtilityPaymentView } from './profile-utility-stateful-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'

type RefundAccount = CustomerRefundAccountResponse['refund_account']

type PaymentUtilityState = {
  accountConfirmDraft: string
  accountNameDraft: string
  accountNumberDraft: string
  confirmedAccountMasked: string
  confirmedBankKey: CustomerV21BankKey | null
  confirmedBankName: string
  confirmedStatus: string | null
  hydrated: boolean
  message: string | null
  messageTone: 'error' | 'success' | null
  saving: boolean
  selectedBankKey: CustomerV21BankKey | null
}

type PaymentUtilityAction =
  | { field: 'accountConfirmDraft' | 'accountNameDraft' | 'accountNumberDraft'; type: 'change'; value: string }
  | { bankKey: CustomerV21BankKey; type: 'select-bank' }
  | { method: RefundAccount; type: 'hydrate' }
  | { type: 'save-started' }
  | { message: string; type: 'save-failed' }
  | {
      accountMasked: string
      bankKey: CustomerV21BankKey
      bankName: string
      message: string
      status: string
      type: 'save-succeeded'
    }

const initialPaymentUtilityState: PaymentUtilityState = {
  accountConfirmDraft: '',
  accountNameDraft: '',
  accountNumberDraft: '',
  confirmedAccountMasked: '',
  confirmedBankKey: null,
  confirmedBankName: '',
  confirmedStatus: null,
  hydrated: false,
  message: null,
  messageTone: null,
  saving: false,
  selectedBankKey: null,
}

function paymentUtilityReducer(state: PaymentUtilityState, action: PaymentUtilityAction): PaymentUtilityState {
  switch (action.type) {
    case 'change':
      return { ...state, [action.field]: action.value, message: null, messageTone: null }
    case 'select-bank':
      return { ...state, message: null, messageTone: null, selectedBankKey: action.bankKey }
    case 'hydrate': {
      const bankKey = paymentBankKeyFromUnknown(action.method?.bank_key)
      return {
        ...initialPaymentUtilityState,
        accountNameDraft: '',
        confirmedAccountMasked: action.method?.bank_account_masked ?? '',
        confirmedBankKey: bankKey,
        confirmedBankName: action.method?.bank_name ?? '',
        confirmedStatus: action.method?.status ?? null,
        hydrated: true,
        selectedBankKey: bankKey,
      }
    }
    case 'save-started':
      return { ...state, message: null, messageTone: null, saving: true }
    case 'save-failed':
      return { ...state, message: action.message, messageTone: 'error', saving: false }
    case 'save-succeeded':
      return {
        ...state,
        confirmedAccountMasked: action.accountMasked,
        confirmedBankKey: action.bankKey,
        confirmedBankName: action.bankName,
        confirmedStatus: action.status,
        message: action.message,
        messageTone: 'success',
        saving: false,
      }
  }
}

export function ProfilePaymentUtilitySection({
  language,
  textInputNoOutlineStyle,
  tokens,
}: {
  language: AppLanguage
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [state, dispatch] = useReducer(paymentUtilityReducer, initialPaymentUtilityState)
  const savingRef = useRef(false)
  const { reduceMotion } = useGlassAccessibility()

  useEffect(() => {
    let cancelled = false
    void customerProfileService.getRefundAccount()
      .then((result) => {
        if (cancelled) return
        dispatch({ method: result.success ? result.data.refund_account : null, type: 'hydrate' })
      })
      .catch(() => {
        if (!cancelled) dispatch({ method: null, type: 'hydrate' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedBank = state.selectedBankKey
    ? paymentBankOptions.find((bank) => bank.key === state.selectedBankKey) ?? null
    : null
  const accountNumber = normalizeBankAccountNumber(state.accountNumberDraft)
  const accountConfirm = normalizeBankAccountNumber(state.accountConfirmDraft)
  const accountMatches = accountNumber.length > 0 && accountNumber === accountConfirm
  const accountName = state.accountNameDraft.trim()
  const canSave = Boolean(
    selectedBank &&
    accountName.length >= 2 &&
    accountNumber.length >= 6 &&
    accountMatches,
  )
  const confirmedReady = Boolean(state.confirmedBankKey && state.confirmedAccountMasked)
  const confirmedStatus = !state.hydrated
    ? (language === 'vi' ? 'Đang tải' : 'Loading')
    : state.confirmedStatus === 'verified'
      ? (language === 'vi' ? 'Đã xác minh' : 'Verified')
      : state.confirmedStatus === 'rejected'
        ? (language === 'vi' ? 'Cần cập nhật' : 'Needs update')
      : confirmedReady
        ? (language === 'vi' ? 'Đã lưu' : 'Saved')
        : (language === 'vi' ? 'Chưa lưu' : 'Not saved')

  const saveRefundAccount = async () => {
    if (!selectedBank || !canSave || savingRef.current) return
    savingRef.current = true
    dispatch({ type: 'save-started' })
    try {
      const result = await customerProfileService.saveRefundAccount({
        account_holder_name: accountName,
        bank_account: accountNumber,
        bank_key: selectedBank.key,
      })
      const persisted = result.success ? result.data.refund_account : null
      const persistedBankKey = paymentBankKeyFromUnknown(persisted?.bank_key)
      if (!persisted || !persistedBankKey) {
        dispatch({
          message: language === 'vi'
            ? 'Chưa thể lưu tài khoản hoàn tiền. Thông tin chưa được thay đổi.'
            : 'The refund account could not be saved. Your details were not changed.',
          type: 'save-failed',
        })
        return
      }
      dispatch({
        accountMasked: persisted.bank_account_masked,
        bankKey: persistedBankKey,
        bankName: persisted.bank_name,
        message: language === 'vi' ? 'Đã lưu tài khoản hoàn tiền' : 'Refund account saved',
        status: persisted.status,
        type: 'save-succeeded',
      })
    } catch {
      dispatch({
        message: language === 'vi'
          ? 'Chưa thể lưu tài khoản hoàn tiền. Thông tin chưa được thay đổi.'
          : 'The refund account could not be saved. Your details were not changed.',
        type: 'save-failed',
      })
    } finally {
      savingRef.current = false
    }
  }

  return (
    <ProfileUtilityPaymentView
      accountConfirmBorderColor={accountConfirm.length > 0 && !accountMatches ? tokens.danger : tokens.border}
      accountNameDraft={state.accountNameDraft}
      accountNumberConfirmDraft={state.accountConfirmDraft}
      accountNumberDraft={state.accountNumberDraft}
      bankCountLabel={language === 'vi'
        ? `${formatNumber(paymentBankOptions.length, language)} ngân hàng`
        : `${formatNumber(paymentBankOptions.length, language)} banks`}
      confirmedPaymentAccountMasked={state.confirmedAccountMasked}
      confirmedPaymentBankKey={state.confirmedBankKey}
      confirmedPaymentBankName={state.confirmedBankName}
      confirmedPaymentReady={confirmedReady}
      confirmedPaymentStatus={confirmedStatus}
      dataPendingLabel={language === 'vi' ? 'Chưa lưu' : 'Not saved'}
      language={language}
      onAccountConfirmChange={(value) => dispatch({ field: 'accountConfirmDraft', type: 'change', value })}
      onAccountNameChange={(value) => dispatch({ field: 'accountNameDraft', type: 'change', value })}
      onAccountNumberChange={(value) => dispatch({ field: 'accountNumberDraft', type: 'change', value })}
      onBankSelect={(bank) => dispatch({ bankKey: bank.key, type: 'select-bank' })}
      onSave={() => void saveRefundAccount()}
      paymentAccountConfirm={accountConfirm}
      paymentAccountMatches={accountMatches}
      paymentBankOptions={paymentBankOptions}
      paymentCanSave={canSave}
      paymentConfirmationReady={accountMatches && !state.message && !state.saving}
      paymentMessage={state.message}
      paymentMessageTone={state.messageTone}
      paymentSaving={state.saving}
      reduceMotion={reduceMotion}
      rootStyles={profileUtilityStyles}
      selectedBankKey={state.selectedBankKey}
      textInputNoOutlineStyle={textInputNoOutlineStyle}
      title={profileUtilityTitle('payment', language)}
      tokens={tokens}
    />
  )
}
