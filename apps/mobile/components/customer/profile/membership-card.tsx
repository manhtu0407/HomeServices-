import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { normalizeInviteCode } from '@/lib/referral/pending-invite'
import {
  membershipService,
  type CustomerMembership,
  type ReferralClaimOutcome,
} from '@/lib/services/membership-service'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '../customer-theme'
import { V21Card } from '../ui/shared-surfaces'

function formatVnd(value: number, language: AppLanguage) {
  return `${new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)}${language === 'vi' ? 'đ' : ' VND'}`
}

function formatDate(value: string, language: AppLanguage) {
  return new Date(value).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function claimOutcomeCopy(outcome: ReferralClaimOutcome, language: AppLanguage): string {
  const vi = language === 'vi'
  switch (outcome) {
    case 'LINKED':
      return vi ? 'Đã kết nối với thợ đã mời bạn.' : 'You are now linked to the worker who invited you.'
    case 'ALREADY_LINKED':
      return vi ? 'Bạn đã được kết nối với thợ này.' : 'You are already linked to this worker.'
    case 'CODE_NOT_FOUND':
      return vi ? 'Không tìm thấy mã này. Kiểm tra lại 8 ký tự.' : 'This code was not found. Check the 8 characters.'
    case 'LINKED_TO_OTHER_WORKER':
      return vi ? 'Tài khoản đã được kết nối với một thợ khác.' : 'Your account is already linked to another worker.'
    case 'CLAIM_WINDOW_CLOSED':
      return vi ? 'Đã quá thời hạn nhập mã mời cho tài khoản này.' : 'The invite code window for this account has closed.'
    case 'ALREADY_TRANSACTED':
      return vi ? 'Mã mời chỉ áp dụng trước đơn thanh toán đầu tiên.' : 'Invite codes apply only before your first paid order.'
    case 'RATE_LIMITED':
      return vi ? 'Bạn đã thử quá nhiều lần hôm nay. Vui lòng thử lại vào ngày mai.' : 'Too many attempts today. Please try again tomorrow.'
    case 'PROGRAM_UNAVAILABLE':
      return vi ? 'Chương trình mời đang tạm dừng.' : 'The invite program is paused.'
  }
}

export function CustomerMembershipCard() {
  const language = useAppLanguage()
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const base = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency ? getReducedTransparencyCustomerTokens(base) : base
  const [membership, setMembership] = useState<CustomerMembership | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [code, setCode] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await membershipService.getMembership(accessToken)
    if (result.success) {
      setMembership(result.data)
      setLoadFailed(false)
    } else {
      setLoadFailed(true)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const normalized = normalizeInviteCode(code)
  const claim = async () => {
    if (!normalized || claiming) return
    setClaiming(true)
    setMessage(null)
    const result = await membershipService.claimReferralCode(normalized, accessToken)
    setClaiming(false)
    if (!result.success) {
      setMessage(language === 'vi' ? 'Chưa gửi được mã. Kiểm tra kết nối rồi thử lại.' : 'Could not send the code. Check your connection and try again.')
      return
    }
    setMessage(claimOutcomeCopy(result.data.outcome, language))
    if (result.data.outcome === 'LINKED' || result.data.outcome === 'ALREADY_LINKED') {
      setCode('')
      await load()
    }
  }

  if (!membership) {
    if (!loadFailed) return null
    return (
      <V21Card style={styles.card} testID="customer-membership-card">
        <Text style={[styles.body, { color: tokens.muted }]}>
          {language === 'vi' ? 'Chưa tải được điểm thành viên.' : 'Membership points are unavailable.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} style={({ pressed }) => [styles.button, { borderColor: tokens.borderStrong }, pressed && styles.pressed]} testID="customer-membership-retry">
          <Text style={[styles.buttonLabel, { color: tokens.primary }]}>{language === 'vi' ? 'Thử lại' : 'Try again'}</Text>
        </Pressable>
      </V21Card>
    )
  }

  const linked = membership.linked_worker
  return (
    <V21Card style={styles.card} testID="customer-membership-card">
      <Text style={[styles.title, { color: tokens.text }]}>{language === 'vi' ? 'Cách tích điểm' : 'How points are earned'}</Text>
      <Text style={[styles.body, { color: tokens.muted }]} testID="customer-membership-rule">
        {membership.customer_vnd_per_point
          ? language === 'vi'
            ? `1 điểm cho mỗi ${formatVnd(membership.customer_vnd_per_point, language)} thanh toán trong app. Chỉ đơn đã thanh toán qua NestScout mới được tính.`
            : `1 point for every ${formatVnd(membership.customer_vnd_per_point, language)} paid in the app. Only orders paid through NestScout count.`
          : language === 'vi'
            ? 'Chỉ đơn đã thanh toán qua NestScout mới được tính điểm.'
            : 'Only orders paid through NestScout earn points.'}
      </Text>
      {linked ? (
        <Text style={[styles.body, { color: tokens.muted }]} testID="customer-membership-linked">
          {language === 'vi'
            ? `Thợ quen của bạn: ${linked.display_name ?? 'Thợ NestScout'} · đến ${formatDate(linked.expires_at, language)}`
            : `Your regular worker: ${linked.display_name ?? 'NestScout worker'} · until ${formatDate(linked.expires_at, language)}`}
        </Text>
      ) : (
        <View style={styles.entry} testID="customer-membership-code-entry">
          <Text style={[styles.label, { color: tokens.text }]}>{language === 'vi' ? 'Có mã mời từ thợ?' : 'Have a code from a worker?'}</Text>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Mã mời gồm 8 ký tự' : '8-character invite code'}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            onChangeText={(value) => {
              setCode(value)
              setMessage(null)
            }}
            placeholder={language === 'vi' ? 'Nhập 8 ký tự' : 'Enter 8 characters'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.input, { borderColor: tokens.borderStrong, color: tokens.text }]}
            testID="customer-membership-code-input"
            value={code}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !normalized || claiming, busy: claiming }}
            disabled={!normalized || claiming}
            onPress={() => void claim()}
            style={({ pressed }) => [styles.button, { borderColor: tokens.borderStrong }, (!normalized || claiming) && styles.disabled, pressed && styles.pressed]}
            testID="customer-membership-code-submit"
          >
            <Text style={[styles.buttonLabel, { color: tokens.primary }]}>
              {claiming ? (language === 'vi' ? 'Đang kiểm tra' : 'Checking') : (language === 'vi' ? 'Nhập mã' : 'Apply code')}
            </Text>
          </Pressable>
        </View>
      )}
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.text }]} testID="customer-membership-message">{message}</Text> : null}
    </V21Card>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    marginTop: 14,
    padding: 16,
  },
  title: {
    ...typography.headline,
  },
  body: {
    ...typography.footnote,
  },
  entry: {
    gap: 8,
    marginTop: 4,
  },
  label: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    ...typography.body,
    letterSpacing: 2,
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonLabel: {
    ...typography.footnote,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
})
