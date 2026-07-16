import { useEffect, useReducer, useRef } from 'react'
import type { StyleProp, TextStyle } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerPaymentMethodResponse } from '@/lib/api-types'
import { customerProfileService } from '@/lib/services'

import type { CustomerThemeTokens } from '../customer-theme'
import type { CustomerV21BankKey } from './assets'
import { formatNumber } from './case-work-display-model'
import {
  maskBankAccountNumber,
  normalizeBankAccountNumber,
  paymentBankKeyFromUnknown,
  paymentBankOptions,
} from './payment-bank-display-model'
import { profileUtilityTitle } from './profile-display-model'
import { ProfileUtilityPaymentView } from './profile-utility-stateful-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'

type PaymentMethod = CustomerPaymentMethodResponse['payment_method']

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
  saving: boolean
  selectedBankKey: CustomerV21BankKey | null
}

type PaymentUtilityAction =
  | { field: 'accountConfirmDraft' | 'accountNameDraft' | 'accountNumberDraft'; type: 'change'; value: string }
  | { bankKey: CustomerV21BankKey; type: 'select-bank' }
  | { method: PaymentMethod; type: 'hydrate' }
  | { type: 'save-started' }
  | { type: 'save-failed' }
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
  saving: false,
  selectedBankKey: null,
}

function paymentUtilityReducer(state: PaymentUtilityState, action: PaymentUtilityAction): PaymentUtilityState {
  switch (action.type) {
    case 'change':
      return { ...state, [action.field]: action.value, message: null }
    case 'select-bank':
      return { ...state, message: null, selectedBankKey: action.bankKey }
    case 'hydrate': {
      const bankKey = paymentBankKeyFromUnknown(action.method?.bank_key)
      return {
        ...initialPaymentUtilityState,
        accountNameDraft: action.method?.account_holder_name ?? '',
        confirmedAccountMasked: action.method?.bank_account_masked ?? '',
        confirmedBankKey: bankKey,
        confirmedBankName: action.method?.bank_name ?? '',
        confirmedStatus: action.method?.status ?? null,
        hydrated: true,
        selectedBankKey: bankKey,
      }
    }
    case 'save-started':
      return { ...state, message: null, saving: true }
    case 'save-failed':
      return { ...state, message: null, saving: false }
    case 'save-succeeded':
      return {
        ...state,
        confirmedAccountMasked: action.accountMasked,
        confirmedBankKey: action.bankKey,
        confirmedBankName: action.bankName,
        confirmedStatus: action.status,
        message: action.message,
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

  useEffect(() => {
    let cancelled = false
    void customerProfileService.getPaymentMethod()
      .then((result) => {
        if (cancelled) return
        dispatch({ method: result.success ? result.data.payment_method : null, type: 'hydrate' })
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
      : confirmedReady
        ? (language === 'vi' ? 'Chưa xác minh' : 'Unverified')
        : (language === 'vi' ? 'Chưa có dữ liệu' : 'Data pending')

  const savePaymentMethod = async () => {
    if (!selectedBank || !canSave || savingRef.current) return
    savingRef.current = true
    dispatch({ type: 'save-started' })
    const masked = maskBankAccountNumber(accountNumber)
    try {
      const result = await customerProfileService.savePaymentMethod({
        account_holder_name: accountName,
        bank_account: accountNumber,
        bank_key: selectedBank.key,
        bank_name: selectedBank.name,
      })
      if (!result.success) {
        dispatch({ type: 'save-failed' })
        return
      }
      const method = result.data.payment_method
      dispatch({
        accountMasked: method?.bank_account_masked ?? masked,
        bankKey: selectedBank.key,
        bankName: method?.bank_name ?? selectedBank.name,
        message: language === 'vi' ? 'Đã lưu' : 'Saved',
        status: method?.status ?? 'pending_verification',
        type: 'save-succeeded',
      })
    } catch {
      dispatch({ type: 'save-failed' })
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
      dataPendingLabel={language === 'vi' ? 'Chưa có' : 'Not available'}
      language={language}
      onAccountConfirmChange={(value) => dispatch({ field: 'accountConfirmDraft', type: 'change', value })}
      onAccountNameChange={(value) => dispatch({ field: 'accountNameDraft', type: 'change', value })}
      onAccountNumberChange={(value) => dispatch({ field: 'accountNumberDraft', type: 'change', value })}
      onBankSelect={(bank) => dispatch({ bankKey: bank.key, type: 'select-bank' })}
      onSave={() => void savePaymentMethod()}
      paymentAccountConfirm={accountConfirm}
      paymentAccountMatches={accountMatches}
      paymentBankOptions={paymentBankOptions}
      paymentCanSave={canSave}
      paymentMessage={state.message}
      paymentMessageColor={tokens.primary}
      paymentSaving={state.saving}
      rootStyles={profileUtilityStyles}
      selectedBankKey={state.selectedBankKey}
      textInputNoOutlineStyle={textInputNoOutlineStyle}
      title={profileUtilityTitle('payment', language)}
      tokens={tokens}
    />
  )
}
