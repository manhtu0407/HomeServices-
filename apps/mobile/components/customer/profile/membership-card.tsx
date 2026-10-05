import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import {
  inviteCodeHasNeverIssuedCharacter,
  normalizeInviteCode,
  takeInviteClaimResult,
} from '@/lib/referral/pending-invite'
import {
  membershipService,
  REFERRAL_CLAIM_OUTCOMES,
  type CustomerMembership,
  type InviteClaimStatus,
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

function isReferralClaimOutcome(value: string | null): value is ReferralClaimOutcome {
  return value !== null && (REFERRAL_CLAIM_OUTCOMES as readonly string[]).includes(value)
}

export function inviteClaimClosedCopy(
  status: Exclude<InviteClaimStatus, 'open'>,
  claimDays: number | null,
  language: AppLanguage,
): string | null {
  const vi = language === 'vi'
  switch (status) {
    case 'window_closed':
      return claimDays
        ? vi
          ? `Mã mời chỉ nhập được trong ${claimDays} ngày đầu sau khi đăng ký.`
          : `Invite codes can be entered only in the first ${claimDays} days after signing up.`
        : claimOutcomeCopy('CLAIM_WINDOW_CLOSED', language)
    case 'transacted':
      return claimOutcomeCopy('ALREADY_TRANSACTED', language)
    case 'program_unavailable':
      return claimOutcomeCopy('PROGRAM_UNAVAILABLE', language)
    case 'linked':
      return null
  }
}

export function inviteLinkConfirmCopy(linkMonths: number | null, language: AppLanguage): string {
  if (language === 'vi') {
    return linkMonths
      ? `Mã này kết nối bạn với thợ đã mời trong ${linkMonths} tháng. Mỗi tài khoản chỉ dùng được một mã mời.`
      : 'Mã này kết nối bạn với thợ đã mời. Mỗi tài khoản chỉ dùng được một mã mời.'
  }
  return linkMonths
    ? `This code links you to the worker who invited you for ${linkMonths} months. Each account can use one invite code.`
    : 'This code links you to the worker who invited you. Each account can use one invite code.'
}

function inviteLinkResultCopy(outcome: ReferralClaimOutcome, language: AppLanguage): string {
  const prefix = language === 'vi' ? 'Mã từ link mời: ' : 'Code from your invite link: '
  return `${prefix}${claimOutcomeCopy(outcome, language)}`
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
  const [confirming, setConfirming] = useState(false)
  const [linkClaimOutcome, setLinkClaimOutcome] = useState<ReferralClaimOutcome | null>(null)

  useEffect(() => {
    let active = true
    void takeInviteClaimResult().then((outcome) => {
      if (active && isReferralClaimOutcome(outcome)) setLinkClaimOutcome(outcome)
    })
    return () => {
      active = false
    }
  }, [])

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
  const neverIssuedCharacter = inviteCodeHasNeverIssuedCharacter(code)
  // The first tap only explains the twelve-month link; the claim is sent on the second.
  const pressApply = () => {
    if (!normalized || claiming) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    void claim()
  }
  const claim = async () => {
    if (!normalized || claiming) return
    setClaiming(true)
    setMessage(null)
    setLinkClaimOutcome(null)
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
  const inviteClaim = membership.invite_claim ?? null
  const claimOpen = !linked && (inviteClaim === null || inviteClaim.status === 'open')
  const closedCopy = !linked && inviteClaim && inviteClaim.status !== 'open'
    ? inviteClaimClosedCopy(inviteClaim.status, inviteClaim.claim_days, language)
    : null
  const shownMessage = message ?? (linkClaimOutcome ? inviteLinkResultCopy(linkClaimOutcome, language) : null)
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
      ) : null}
      {claimOpen ? (
        <View style={styles.entry} testID="customer-membership-code-entry">
          <Text style={[styles.label, { color: tokens.text }]}>{language === 'vi' ? 'Có mã mời từ thợ?' : 'Have a code from a worker?'}</Text>
          {inviteClaim?.closes_at ? (
            <Text style={[styles.body, { color: tokens.muted }]} testID="customer-membership-claim-deadline">
              {language === 'vi'
                ? `Nhập mã trước ${formatDate(inviteClaim.closes_at, language)}, khi chưa có đơn thanh toán trong app.`
                : `Enter a code before ${formatDate(inviteClaim.closes_at, language)}, before any paid order in the app.`}
            </Text>
          ) : null}
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Mã mời gồm 8 ký tự' : '8-character invite code'}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            onChangeText={(value) => {
              setCode(value)
              setMessage(null)
              setConfirming(false)
            }}
            placeholder={language === 'vi' ? 'Nhập 8 ký tự' : 'Enter 8 characters'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.input, code.length > 0 && styles.inputFilled, { borderColor: neverIssuedCharacter ? tokens.danger : tokens.borderStrong, color: tokens.text }]}
            testID="customer-membership-code-input"
            value={code}
          />
          {neverIssuedCharacter ? (
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.danger }]} testID="customer-membership-code-hint">
              {language === 'vi'
                ? 'Mã mời không có số 0, số 1, chữ O và chữ I. Kiểm tra lại mã thợ gửi.'
                : 'Invite codes never contain 0, 1, O or I. Check the code your worker sent.'}
            </Text>
          ) : null}
          {confirming ? (
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.text }]} testID="customer-membership-code-confirm">
              {inviteLinkConfirmCopy(inviteClaim?.link_months ?? null, language)}
            </Text>
          ) : null}
          <Pressable
            accessibilityHint={confirming ? inviteLinkConfirmCopy(inviteClaim?.link_months ?? null, language) : undefined}
            accessibilityRole="button"
            accessibilityState={{ disabled: !normalized || claiming, busy: claiming }}
            disabled={!normalized || claiming}
            onPress={pressApply}
            style={({ pressed }) => [styles.button, { borderColor: confirming ? tokens.primary : tokens.borderStrong }, (!normalized || claiming) && styles.disabled, pressed && styles.pressed]}
            testID="customer-membership-code-submit"
          >
            <Text style={[styles.buttonLabel, { color: tokens.primary }]}>
              {claiming
                ? (language === 'vi' ? 'Đang kiểm tra' : 'Checking')
                : confirming
                  ? (language === 'vi' ? 'Xác nhận áp dụng mã' : 'Confirm code')
                  : (language === 'vi' ? 'Áp dụng mã' : 'Apply code')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {closedCopy ? (
        <Text style={[styles.body, { color: tokens.muted }]} testID="customer-membership-claim-closed">{closedCopy}</Text>
      ) : null}
      {shownMessage ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.text }]} testID="customer-membership-message">{shownMessage}</Text> : null}
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
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    letterSpacing: typography.body.letterSpacing,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  inputFilled: {
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
