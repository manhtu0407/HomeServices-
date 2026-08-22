import { useEffect, useState } from 'react'
import { Pressable, Text as RNText, View, type TextProps } from 'react-native'

import { PublicPrivacyPolicyLink } from '@/components/ui/public-privacy-policy-link'
import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { textByLanguage } from '../ui/format'
import { useWorkerThemeMode } from '../worker-theme'
import { WorkerV5ProfileGroup, WorkerV5ProfileGroupDivider, WorkerV5ProfileGroupRow } from './grouped-list-surfaces'
import { styles } from './settings-utility-styles'
import { WorkerV5UtilityGlyph } from './utility-glyphs'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  const isDark = useWorkerThemeMode() === 'dark'
  return <RNText {...props} style={[styles.workerCustomerFontText, style, isDark ? styles.darkText : null]} />
}

function notificationTime(value: string, language: AppLanguage) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

export function WorkerV5NotificationsBody({
  language,
  navigateToJob,
  runtime,
}: {
  language: AppLanguage
  navigateToJob: (jobId: string) => void
  runtime: WorkerV5Runtime
}) {
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null)
  const refreshNotifications = runtime.actions.refreshNotifications

  useEffect(() => {
    void refreshNotifications()
  }, [refreshNotifications])

  const openNotification = async (notification: WorkerV5Runtime['notifications'][number]) => {
    if (openingNotificationId) return
    setOpeningNotificationId(notification.id)
    try {
      if (notification.status !== 'read') await runtime.actions.markNotificationRead(notification.id)
      if (notification.job_id) navigateToJob(notification.job_id)
    } finally {
      setOpeningNotificationId(null)
    }
  }

  return (
    <View style={styles.stack} testID="worker-v5-notifications-screen">
      <WorkerV5ProfileGroup testID="worker-v5-notifications-summary" title={textByLanguage(language, 'Tổng quan', 'Overview')}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{runtime.notificationUnreadCount > 0
            ? textByLanguage(language, `${runtime.notificationUnreadCount} thông báo chưa đọc`, `${runtime.notificationUnreadCount} unread notifications`)
            : textByLanguage(language, 'Không có thông báo chưa đọc', 'No unread notifications')}</Text>
          <Text style={styles.summaryBody}>{textByLanguage(language, 'Chỉ hiển thị cập nhật đã ghi nhận.', 'Only recorded updates are shown.')}</Text>
        </View>
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-notifications-list" title={textByLanguage(language, 'Cập nhật gần đây', 'Recent updates')}>
        {runtime.notifications.length === 0 ? (
          <View style={styles.emptyState} testID="worker-v5-notifications-empty">
            <Text style={styles.emptyTitle}>{textByLanguage(language, 'Chưa có thông báo', 'No notifications yet')}</Text>
            <Text style={styles.emptyBody}>{textByLanguage(language, 'Cập nhật về công việc hoặc tài khoản sẽ xuất hiện ở đây.', 'Work or account updates will appear here.')}</Text>
          </View>
        ) : runtime.notifications.map((notification, index) => (
          <View key={notification.id}>
            {index > 0 ? <WorkerV5ProfileGroupDivider /> : null}
            <Pressable
              accessibilityHint={notification.job_id ? textByLanguage(language, 'Mở công việc liên quan', 'Open the related job') : textByLanguage(language, 'Đánh dấu đã đọc', 'Mark as read')}
              accessibilityLabel={notification.title}
              accessibilityRole="button"
              accessibilityState={{ busy: openingNotificationId === notification.id }}
              disabled={openingNotificationId !== null}
              onPress={() => void openNotification(notification)}
              style={({ pressed }) => [styles.notificationRow, pressed ? styles.pressed : null]}
              testID={`worker-v5-notification-${notification.id}`}
            >
              <View style={[styles.notificationUnreadDot, notification.status === 'read' ? styles.notificationReadDot : null]} />
              <View style={styles.notificationCopy}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationBody}>{notification.body}</Text>
                <Text style={styles.notificationTime}>{notificationTime(notification.created_at, language)}</Text>
              </View>
              <Text style={styles.notificationStatus}>{notification.status === 'read' ? textByLanguage(language, 'Đã đọc', 'Read') : textByLanguage(language, 'Chưa đọc', 'Unread')}</Text>
            </Pressable>
          </View>
        ))}
      </WorkerV5ProfileGroup>
    </View>
  )
}

export function WorkerV5SupportBody({
  language,
  navigateToJobs,
  navigateToKael,
}: {
  language: AppLanguage
  navigateToJobs: () => void
  navigateToKael: () => void
}) {
  return (
    <View style={styles.stack} testID="worker-v5-support-screen">
      <WorkerV5ProfileGroup testID="worker-v5-support-options" title={textByLanguage(language, 'Bạn đang cần trợ giúp việc gì?', 'What do you need help with?')}>
        <WorkerV5ProfileGroupRow
          description={textByLanguage(language, 'Xem công việc, giao dịch hoặc tiến độ đang có.', 'Review existing jobs, transactions, or progress.')}
          iconElement={<WorkerV5UtilityGlyph name="briefcase" size={24} testID="worker-v5-support-jobs-icon-glyph" />}
          iconFrame="outlined"
          onPress={navigateToJobs}
          testID="worker-v5-support-jobs"
          title={textByLanguage(language, 'Hỗ trợ theo công việc', 'Work support')}
        />
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          description={textByLanguage(language, 'Hỏi Kael để được hướng dẫn cách dùng ứng dụng.', 'Ask Kael for guidance on using the app.')}
          iconElement={<WorkerV5UtilityGlyph name="chat" size={24} testID="worker-v5-support-kael-icon-glyph" />}
          iconFrame="outlined"
          onPress={navigateToKael}
          testID="worker-v5-support-kael"
          title={textByLanguage(language, 'Hỏi Kael cách sử dụng', 'Ask Kael for help')}
        />
      </WorkerV5ProfileGroup>
    </View>
  )
}

const POLICY_SECTIONS = {
  en: [
    {
      body: 'Check the job information before accepting. Update progress and submit only notes or evidence that reflect the work you actually performed. If the scope changes, use the available work flow before doing extra work.',
      id: 'work',
      title: 'Accepting and completing work',
    },
    {
      body: 'Income, platform fees, and recorded transactions appear after the app records the related work. Check the recorded information before changing your receiving account or asking for help with a payment.',
      id: 'money',
      title: 'Earnings and settlement',
    },
    {
      body: 'Use customer information only when it is necessary to complete the work. Do not share it, use it outside the work, or keep it longer than needed. Tell us when you notice a privacy concern.',
      id: 'privacy',
      title: 'Information and privacy',
    },
    {
      body: 'Follow building rules and work safely. Do not perform illegal work or work outside the accepted scope. Report an incident or a safety concern through the available support path as soon as you can.',
      id: 'safety',
      title: 'Safety and conduct',
    },
  ],
  vi: [
    {
      body: 'Kiểm tra thông tin công việc trước khi nhận. Chỉ cập nhật tiến độ và gửi ghi chú hoặc bằng chứng phản ánh đúng việc bạn đã thực hiện. Khi phạm vi thay đổi, hãy dùng luồng xử lý sẵn có trước khi làm thêm.',
      id: 'work',
      title: 'Nhận và hoàn tất công việc',
    },
    {
      body: 'Thu nhập, phí nền tảng và giao dịch chỉ hiện sau khi ứng dụng ghi nhận công việc liên quan. Hãy kiểm tra thông tin đã ghi nhận trước khi đổi tài khoản nhận tiền hoặc cần hỗ trợ về thanh toán.',
      id: 'money',
      title: 'Thu nhập và đối soát',
    },
    {
      body: 'Chỉ dùng thông tin của khách khi cần để hoàn thành công việc. Không chia sẻ, dùng ngoài công việc hoặc lưu lâu hơn mức cần thiết. Hãy báo cho chúng tôi khi bạn thấy có vấn đề về riêng tư.',
      id: 'privacy',
      title: 'Thông tin và quyền riêng tư',
    },
    {
      body: 'Tuân thủ quy định của tòa nhà và làm việc an toàn. Không thực hiện việc trái pháp luật hoặc ngoài phạm vi đã nhận. Hãy báo sự cố hoặc vấn đề an toàn qua mục hỗ trợ sớm nhất có thể.',
      id: 'safety',
      title: 'An toàn và ứng xử',
    },
  ],
} as const

export function WorkerV5PoliciesBody({ language, reduceTransparency }: { language: AppLanguage; reduceTransparency: boolean }) {
  const [expandedId, setExpandedId] = useState<(typeof POLICY_SECTIONS)[AppLanguage][number]['id'] | null>('work')
  const sections = POLICY_SECTIONS[language]
  const isDark = useWorkerThemeMode() === 'dark'
  void reduceTransparency

  return (
    <View style={styles.stack} testID="worker-v5-policies-screen">
      <WorkerV5ProfileGroup
        testID="worker-v5-policies-list"
        title={textByLanguage(language, 'Tóm tắt chính sách', 'Policy summary')}
      >
        <View style={styles.policyIntro}>
          <Text style={styles.summaryTitle}>{textByLanguage(language, 'Hiểu rõ trước khi thực hiện', 'Understand before you work')}</Text>
          <Text style={styles.summaryBody}>{textByLanguage(language, 'Các hướng dẫn ngắn dưới đây giúp bạn dùng ứng dụng an toàn và rõ ràng.', 'These short guidelines help you use the app clearly and safely.')}</Text>
          <PublicPrivacyPolicyLink language={language} testID="worker-v5-public-privacy-policy" />
        </View>
        {sections.map((section, index) => {
          const expanded = expandedId === section.id
          return (
            <View key={section.id}>
              {index > 0 ? <WorkerV5ProfileGroupDivider /> : null}
              <Pressable
                accessibilityLabel={section.title}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpandedId((current) => current === section.id ? null : section.id)}
                style={({ pressed }) => [styles.policyRow, pressed ? styles.pressed : null]}
                testID={`worker-v5-policy-${section.id}`}
              >
                <View style={[styles.policyIconFrame, isDark ? styles.policyIconFrameDark : null]} testID={`worker-v5-policy-${section.id}-icon-frame`}>
                  <WorkerV5UtilityGlyph name={section.id === 'work' ? 'tools' : section.id === 'money' ? 'document' : section.id === 'privacy' ? 'shield' : 'check'} size={24} testID={`worker-v5-policy-${section.id}-icon`} />
                </View>
                <Text style={styles.policyTitle}>{section.title}</Text>
                <Text style={styles.policyChevron}>{expanded ? '⌃' : '›'}</Text>
              </Pressable>
              {expanded ? <Text style={styles.policyBody} testID={`worker-v5-policy-${section.id}-body`}>{section.body}</Text> : null}
            </View>
          )
        })}
      </WorkerV5ProfileGroup>
    </View>
  )
}
