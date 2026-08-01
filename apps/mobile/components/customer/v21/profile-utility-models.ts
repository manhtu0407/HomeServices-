import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

import type { CustomerV21BankKey } from './assets'

export type PaymentBankOption = {
  key: CustomerV21BankKey
  name: string
  vietQrCode: string
}

export type RootProfileUtilityStyles = {
  bodyText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  profileInsightTitle: StyleProp<TextStyle>
}

export type ProfileUtilitySettingsAccountModel = {
  canSave: boolean
  emailDraft: string
  fullNameDraft: string
  message: string | null
  messageColor: string
  onEmailChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSave: () => void
  phoneDraft: string
  saving: boolean
}

export type ProfileUtilitySettingsPasswordModel = {
  canSave: boolean
  confirmDraft: string
  currentDraft: string
  message: string | null
  messageColor: string
  newDraft: string
  onConfirmChange: (value: string) => void
  onCurrentChange: (value: string) => void
  onNewChange: (value: string) => void
  onSave: () => void
  passwordMatches: boolean
  saving: boolean
}

export type ProfileUtilitySettingsMemoryModel = {
  allowed: boolean
  onToggle: () => void
  pending: boolean
}
