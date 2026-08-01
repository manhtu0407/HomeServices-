import { useEffect, useRef, useState } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelButton, KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { NotificationListResponse } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import { customerAccountService } from '@/lib/services'

import type { CustomerThemeTokens, ThemeMode } from '../customer-theme'
import { customerV21Assets } from './assets'
import { customerV21ProfileFoundationUtilityStyles as styles } from './profile-foundation-utility-styles'
import { ProfilePreferenceOption, ProfilePreferencePanel } from './profile-preference-surfaces'
import { ProfileFormulaMintSurface } from './profile-utility-surfaces'

type CustomerNotification = NotificationListResponse['notifications'][number]

const ACCOUNT_DELETION_CONFIRMATION = 'XÓA TÀI KHOẢN'

export function ProfileAppearanceView({
  language,
  mode,
  onSelectMode,
  tokens,
}: {
  language: AppLanguage
  mode: ThemeMode
  onSelectMode: (mode: ThemeMode) => void
  tokens: CustomerThemeTokens
}) {
  const options: readonly {
    body: string
    mode: ThemeMode
    title: string
    visual: string
  }[] = [
    {
      body: language === 'vi' ? 'Nền sáng, rõ và thoáng.' : 'A bright, clear surface.',
      mode: 'light',
      title: language === 'vi' ? 'Sáng' : 'Light',
      visual: '☀️',
    },
    {
      body: language === 'vi' ? 'Giảm độ sáng trong môi trường tối.' : 'Lower brightness in dark environments.',
      mode: 'dark',
      title: language === 'vi' ? 'Tối' : 'Dark',
      visual: '🌙',
    },
  ]

  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-appearance-screen">
      <ProfilePreferencePanel
        body={language === 'vi'
          ? 'Lựa chọn được lưu trên thiết bị này và áp dụng ngay.'
          : 'Your choice is saved on this device and applied immediately.'}
        scope="Appearance"
        testID="customer-v21-profile-appearance-card"
        title={language === 'vi' ? 'Chọn giao diện dễ nhìn với bạn' : 'Choose the appearance that works for you'}
        tokens={tokens}
      >
        {options.map((option) => (
          <ProfilePreferenceOption
            body={option.body}
            key={option.mode}
            onPress={() => onSelectMode(option.mode)}
            selected={option.mode === mode}
            testID={`customer-v21-profile-appearance-${option.mode}`}
            title={option.title}
            tokens={tokens}
            visual={option.visual}
          />
        ))}
      </ProfilePreferencePanel>
    </View>
  )
}

export function ProfileNotificationsView({
  language,
  notifications,
  onMarkRead,
  onOpenRelatedWork,
  onRefresh,
  tokens,
  unreadCount,
}: {
  language: AppLanguage
  notifications: CustomerNotification[]
  onMarkRead: (notificationId: string) => Promise<boolean>
  onOpenRelatedWork: (jobId: string) => void
  onRefresh: () => Promise<boolean>
  tokens: CustomerThemeTokens
  unreadCount: number
}) {
  const initialRefreshRequested = useRef(false)

  useEffect(() => {
    if (initialRefreshRequested.current) return
    initialRefreshRequested.current = true
    void onRefresh()
  }, [onRefresh])

  const openNotification = async (notification: CustomerNotification) => {
    if (!notification.read_at) {
      await onMarkRead(notification.id)
    }
    if (notification.job_id) {
      onOpenRelatedWork(notification.job_id)
    }
  }

  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-notifications-screen">
      <ProfilePreferencePanel
        body={unreadCount > 0
          ? (language === 'vi' ? `${unreadCount} thông báo chưa đọc` : `${unreadCount} unread notifications`)
          : (language === 'vi' ? 'Không có thông báo chưa đọc' : 'No unread notifications')}
        image={customerV21Assets.notification}
        scope="NotificationsSummary"
        testID="customer-v21-profile-notifications-summary"
        title={language === 'vi' ? 'Cập nhật quan trọng của bạn' : 'Your important updates'}
        tokens={tokens}
      >
        <Text style={[styles.sectionLabel, { color: tokens.text }]}>
          {language === 'vi' ? 'Danh sách thông báo' : 'Notification list'}
        </Text>
        {notifications.length === 0 ? (
          <View
            style={[styles.emptyCard, { backgroundColor: tokens.base, borderColor: tokens.border }]}
            testID="customer-v21-profile-notifications-empty"
          >
            <Image
              accessibilityIgnoresInvertColors
              contentFit="contain"
              source={customerV21Assets.activityEmpty}
              style={styles.emptyIcon}
            />
            <Text style={[styles.title, { color: tokens.text }]}>
              {language === 'vi' ? 'Chưa có thông báo' : 'No notifications yet'}
            </Text>
            <Text style={[styles.body, styles.centerText, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Cập nhật thật về công việc và tài khoản sẽ xuất hiện tại đây.'
                : 'Real job and account updates will appear here.'}
            </Text>
          </View>
        ) : (
          <View style={[styles.listSurface, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            {notifications.map((notification, index) => {
              const unread = !notification.read_at
              return (
                <View key={notification.id}>
                  <Pressable
                    accessibilityHint={notification.job_id
                      ? (language === 'vi' ? 'Mở công việc liên quan' : 'Open the related job')
                      : undefined}
                    accessibilityLabel={`${notification.title}. ${unread
                      ? (language === 'vi' ? 'Chưa đọc' : 'Unread')
                      : (language === 'vi' ? 'Đã đọc' : 'Read')}`}
                    accessibilityRole="button"
                    onPress={() => void openNotification(notification)}
                    style={styles.notificationRow}
                    testID={`customer-v21-profile-notification-${notification.id}`}
                  >
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={[
                        styles.unreadDot,
                        { backgroundColor: unread ? tokens.primary : 'transparent', borderColor: tokens.border },
                      ]}
                    />
                    <View style={styles.notificationCopy}>
                      <View style={styles.notificationTitleRow}>
                        <Text numberOfLines={2} style={[styles.notificationTitle, { color: tokens.text }]}>
                          {notification.title}
                        </Text>
                        <Text style={[styles.notificationState, { color: unread ? tokens.primary : tokens.muted }]}>
                          {unread
                            ? (language === 'vi' ? 'Chưa đọc' : 'Unread')
                            : (language === 'vi' ? 'Đã đọc' : 'Read')}
                        </Text>
                      </View>
                      <Text numberOfLines={3} style={[styles.body, { color: tokens.muted }]}>
                        {notification.body}
                      </Text>
                      <Text style={[styles.notificationTime, { color: tokens.subtleText }]}>
                        {formatNotificationTimestamp(notification.created_at, language)}
                      </Text>
                    </View>
                    {notification.job_id ? (
                      <Svg height={18} viewBox="0 0 18 18" width={18}>
                        <Path
                          d="m7 4.5 4.5 4.5L7 13.5"
                          fill="none"
                          stroke={tokens.primary}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.7}
                        />
                      </Svg>
                    ) : null}
                  </Pressable>
                  {index < notifications.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                  ) : null}
                </View>
              )
            })}
          </View>
        )}
      </ProfilePreferencePanel>
    </View>
  )
}

export function ProfileSupportView({
  language,
  onOpenHistory,
  onOpenKael,
  tokens,
}: {
  language: AppLanguage
  onOpenHistory: () => void
  onOpenKael: () => void
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-support-screen">
      <ProfilePreferencePanel
        body={language === 'vi'
          ? 'Chọn đúng nơi để xem công việc hoặc hỏi cách sử dụng ứng dụng.'
          : 'Choose where to review a job or ask how to use the app.'}
        framelessCenteredImage
        image={customerV21Assets.feedback}
        scope="SupportSummary"
        testID="customer-v21-profile-support-summary"
        title={language === 'vi' ? 'Bạn đang cần trợ giúp việc gì?' : 'What do you need help with?'}
        tokens={tokens}
      >
        <View style={[styles.listSurface, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
          <FoundationActionRow
            body={language === 'vi' ? 'Xem công việc, giao dịch hoặc gửi yêu cầu sau dịch vụ.' : 'Review jobs, transactions, or request after-service help.'}
            image={customerV21Assets.activity}
            onPress={onOpenHistory}
            testID="customer-v21-profile-support-history"
            title={language === 'vi' ? 'Hỗ trợ theo công việc' : 'Job-specific help'}
            tokens={tokens}
          />
          <View style={[styles.divider, { backgroundColor: tokens.border }]} />
          <FoundationActionRow
            body={language === 'vi' ? 'Hỏi Kael về cách dùng ứng dụng; Kael không thay người hỗ trợ xử lý tranh chấp.' : 'Ask Kael how to use the app; Kael does not replace dispute support.'}
            image={customerV21Assets.tools}
            onPress={onOpenKael}
            testID="customer-v21-profile-support-kael"
            title={language === 'vi' ? 'Hỏi Kael cách sử dụng' : 'Ask Kael how to use the app'}
            tokens={tokens}
          />
        </View>
      </ProfilePreferencePanel>
    </View>
  )
}

export function ProfileDeleteAccountView({
  accessToken,
  language,
  onDeleted,
  textInputNoOutlineStyle,
  tokens,
}: {
  accessToken: string | null
  language: AppLanguage
  onDeleted: () => Promise<void> | void
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const requestIdRef = useRef(generateClientRequestId())
  const canDelete = acknowledged && confirmation.trim() === ACCOUNT_DELETION_CONFIRMATION && !deleting

  const deleteAccount = async () => {
    if (!canDelete || !accessToken) {
      if (!accessToken) {
        setMessage(language === 'vi' ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.' : 'Your session expired. Sign in again and retry.')
      }
      return
    }

    setDeleting(true)
    setMessage(null)
    try {
      const result = await customerAccountService.deleteAccount({
        acknowledge_data_loss: true,
        client_request_id: requestIdRef.current,
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      }, accessToken)
      if (!result.success) {
        setMessage(result.error)
        return
      }
      await onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-delete-account-screen">
      <View
        style={[styles.dangerCard, { backgroundColor: tokens.raised, borderColor: tokens.danger }]}
        testID="customer-v21-profile-delete-account-warning"
      >
        <View
          style={styles.summaryIconFrame}
          testID="customer-v21-profile-delete-account-icon-frame"
        >
          <Image
            accessibilityIgnoresInvertColors
            contentFit="contain"
            source={customerV21Assets.deleteAccount}
            style={styles.summaryIcon}
            testID="customer-v21-profile-delete-account-icon"
          />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={[styles.title, { color: tokens.danger }]}>
            {language === 'vi' ? 'Xóa tài khoản là thao tác không thể hoàn tác' : 'Account deletion cannot be undone'}
          </Text>
          <Text style={[styles.body, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'Thông tin liên hệ, địa chỉ, tài khoản hoàn tiền và thông báo của bạn sẽ bị xóa. Hồ sơ giao dịch cần thiết có thể được giữ lại nhưng không còn dùng để đăng nhập.'
              : 'Your contact details, addresses, refund account, and notifications will be removed. Required transaction records may be retained without login access.'}
          </Text>
        </View>
      </View>

      <ProfileFormulaMintSurface
        scope="DeleteAccountConfirmation"
        style={[styles.confirmationCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-delete-account-confirmation-card"
      >
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Tôi hiểu dữ liệu cá nhân sẽ bị xóa' : 'I understand my personal data will be deleted'}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged, disabled: deleting }}
          disabled={deleting}
          onPress={() => setAcknowledged((current) => !current)}
          style={styles.checkboxRow}
          testID="customer-v21-profile-delete-account-acknowledgement"
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: acknowledged ? tokens.primary : 'transparent',
                borderColor: acknowledged ? tokens.primary : tokens.borderStrong,
              },
            ]}
          >
            {acknowledged ? <Text style={[styles.checkboxMark, { color: tokens.primaryText }]}>✓</Text> : null}
          </View>
          <Text style={[styles.checkboxLabel, { color: tokens.text }]}>
            {language === 'vi'
              ? 'Tôi hiểu dữ liệu cá nhân của mình sẽ bị xóa và không thể khôi phục.'
              : 'I understand that my personal data will be deleted and cannot be restored.'}
          </Text>
        </Pressable>

        <View
          style={styles.confirmationCopy}
          testID="customer-v21-profile-delete-account-confirmation-copy"
        >
          <Text style={[styles.body, { color: tokens.muted }]}>
            {language === 'vi' ? 'Nhập đúng cụm từ sau để xác nhận:' : 'Enter this exact phrase to confirm:'}
          </Text>
          <Text selectable style={[styles.confirmationPhrase, { color: tokens.text }]}>
            {ACCOUNT_DELETION_CONFIRMATION}
          </Text>
        </View>
        <KaelTextInput
          accessibilityLabel={language === 'vi' ? 'Cụm từ xác nhận xóa tài khoản' : 'Account deletion confirmation phrase'}
          autoCapitalize="characters"
          editable={!deleting}
          onChangeText={setConfirmation}
          placeholder={ACCOUNT_DELETION_CONFIRMATION}
          placeholderTextColor={tokens.subtleText}
          style={[
            styles.confirmationInput,
            textInputNoOutlineStyle,
            { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text },
          ]}
          testID="customer-v21-profile-delete-account-confirmation"
          value={confirmation}
        />
        <KaelButton
          disabled={!canDelete}
          label={deleting
            ? (language === 'vi' ? 'Đang xóa tài khoản' : 'Deleting account')
            : (language === 'vi' ? 'Xóa tài khoản của tôi' : 'Delete my account')}
          onPress={() => void deleteAccount()}
          showPrimaryGradient={false}
          style={[styles.deleteButton, canDelete ? { backgroundColor: tokens.danger } : null]}
          testID="customer-v21-profile-delete-account-submit"
        />
        {message ? (
          <Text accessibilityRole="alert" style={[styles.message, { color: tokens.danger }]} testID="customer-v21-profile-delete-account-message">
            {message}
          </Text>
        ) : null}
      </ProfileFormulaMintSurface>
    </View>
  )
}

function FoundationActionRow({
  body,
  image,
  onPress,
  testID,
  title,
  tokens,
}: {
  body: string
  image: ImageSourcePropType
  onPress: () => void
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <Pressable
      accessibilityHint={body}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.actionRow}
      testID={testID}
    >
      <View
        style={[styles.actionIconFrame, { backgroundColor: 'transparent' }]}
        testID={`${testID}-icon`}
      >
        <Image accessibilityIgnoresInvertColors contentFit="contain" source={image} style={styles.actionIcon} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text>
      </View>
      <Svg height={18} viewBox="0 0 18 18" width={18}>
        <Path
          d="m7 4.5 4.5 4.5L7 13.5"
          fill="none"
          stroke={tokens.primary}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.7}
        />
      </Svg>
    </Pressable>
  )
}

function formatNotificationTimestamp(value: string, language: AppLanguage) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return language === 'vi' ? 'Thời gian chưa xác định' : 'Time unavailable'
  }
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(date)
}
