import { ActivityIndicator, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { KaelLiquidStatusTransition } from '../kael-chat/kael-liquid-status-transition'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'

type RefundAccountFeedbackProps = {
  confirmed: boolean
  language: AppLanguage
  message: string | null
  messageTone: 'error' | 'success' | null
  reduceMotion: boolean
  saving: boolean
  tokens: CustomerThemeTokens
  transitionKey: string
}

export function RefundAccountUsageNotice({
  language,
  tokens,
}: Pick<RefundAccountFeedbackProps, 'language' | 'tokens'>) {
  return (
    <Text
      accessibilityLabel={language === 'vi'
        ? 'Tài khoản này chỉ dùng cho hoàn tiền đã xác nhận, không dùng để thanh toán công việc hoặc chuyển tiền cho thợ.'
        : 'This account is only for confirmed refunds, not job payments or transfers to workers.'}
      style={[profileUtilityStyles.profileRefundAccountUsageNote, { color: tokens.muted }]}
      testID="customer-v21-profile-refund-account-usage"
    >
      {language === 'vi' ? 'Chỉ dùng cho hoàn tiền đã xác nhận.' : 'For confirmed refunds only.'}
    </Text>
  )
}

export function RefundAccountFeedback({
  confirmed,
  language,
  message,
  messageTone,
  reduceMotion,
  saving,
  tokens,
  transitionKey,
}: RefundAccountFeedbackProps) {
  const kind = saving
    ? 'saving'
    : message
      ? messageTone === 'error' ? 'error' : 'saved'
      : confirmed ? 'ready' : null
  if (!kind) return null

  const isError = kind === 'error'
  const isSaving = kind === 'saving'
  const title = isSaving
    ? (language === 'vi' ? 'Đang lưu tài khoản hoàn tiền' : 'Saving refund account')
    : message ?? (language === 'vi' ? 'Số tài khoản đã khớp' : 'Account numbers match')
  const body = isSaving
    ? (language === 'vi'
        ? 'Hệ thống đang kiểm tra dữ liệu trước khi ghi nhận.'
        : 'NestScout is checking the details before recording them.')
    : isError
      ? (language === 'vi'
          ? 'Bạn có thể kiểm tra lại và thử lưu sau.'
          : 'Review the details and try saving again later.')
      : kind === 'saved'
        ? (language === 'vi'
            ? 'Tài khoản chỉ được dùng khi hoàn tiền được xác nhận.'
            : 'This account will only be used after a refund is confirmed.')
        : (language === 'vi'
            ? 'Kiểm tra lại tên chủ tài khoản trước khi lưu.'
            : 'Review the account holder name before saving.')

  return (
    <KaelLiquidStatusTransition
      reduceMotion={reduceMotion}
      transitionKey={transitionKey}
    >
      <View
        aria-live="polite"
        accessibilityRole="alert"
        style={[profileUtilityStyles.profileRefundAccountFeedback, {
          backgroundColor: isError
            ? (tokens.mode === 'dark' ? 'rgba(99,31,38,0.74)' : 'rgba(255,241,242,0.94)')
            : (tokens.mode === 'dark' ? 'rgba(19,75,68,0.74)' : 'rgba(232,250,246,0.92)'),
          borderColor: isError ? tokens.danger : tokens.primary,
        }]}
        testID={isError
          ? 'customer-v21-profile-refund-account-error'
          : kind === 'saved'
            ? 'customer-v21-profile-refund-account-saved'
            : isSaving
              ? 'customer-v21-profile-refund-account-saving'
              : 'customer-v21-profile-refund-account-confirmed'}
      >
        {isSaving ? <ActivityIndicator color={tokens.primary} size="small" /> : null}
        <View style={profileUtilityStyles.profileRefundAccountFeedbackCopy}>
          <Text style={[profileUtilityStyles.profileRefundAccountFeedbackTitle, { color: isError ? tokens.danger : tokens.primary }]}>{title}</Text>
          <Text style={[profileUtilityStyles.profileRefundAccountFeedbackBody, { color: tokens.muted }]}>{body}</Text>
        </View>
      </View>
    </KaelLiquidStatusTransition>
  )
}
