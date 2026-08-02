import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { WorkerV5AvailabilityCard } from '../home/availability-surfaces'
import { textByLanguage } from '../ui/format'
import { useWorkerThemeMode } from '../worker-theme'
import { WorkerV5ProfileGroup } from './grouped-list-surfaces'
import { workerIsWaitingForReview, workerNeedsRegistration } from './registration-model'
import { styles } from './schedule-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  const isDark = useWorkerThemeMode() === 'dark'
  return <RNText {...props} style={[styles.workerCustomerFontText, style, isDark ? styles.darkText : null]} />
}

export function WorkerV5ScheduleBody({
  language,
  onOpenProfileSetup,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  onOpenProfileSetup?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const hasActiveJob = runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))
  const profileSyncPending = !profile && !runtime.workerJobsHydrated && !onOpenProfileSetup
  const status = profileSyncPending
    ? textByLanguage(language, 'Đang đồng bộ hồ sơ', 'Syncing profile')
    : profile?.is_suspended
      ? textByLanguage(language, 'Hồ sơ đang tạm khóa', 'Profile is suspended')
      : workerNeedsRegistration(profile)
        ? textByLanguage(language, 'Hoàn tất hồ sơ để nhận việc', 'Complete your profile to accept work')
      : workerIsWaitingForReview(profile)
        ? textByLanguage(language, 'Hồ sơ đang được kiểm tra', 'Profile is under review')
      : profile?.is_available && profile.is_approved
        ? textByLanguage(language, 'Bạn đang nhận yêu cầu mới', 'You are accepting new work')
        : profile?.is_approved
          ? textByLanguage(language, 'Bạn đang tắt nhận yêu cầu mới', 'You are not accepting new work')
          : textByLanguage(language, 'Hoàn tất hồ sơ để nhận yêu cầu mới', 'Complete your profile to accept new work')
  const detail = profileSyncPending
    ? textByLanguage(language, 'Trạng thái nhận việc sẽ hiện khi hồ sơ được đồng bộ.', 'Availability will appear once the profile is synced.')
    : profile?.is_suspended
      ? textByLanguage(language, 'Bạn chưa thể bật nhận việc khi hồ sơ đang bị tạm khóa.', 'Availability cannot be turned on while the profile is suspended.')
      : workerNeedsRegistration(profile)
        ? textByLanguage(language, 'Gửi thông tin và giấy tờ thật để bắt đầu bước kiểm tra hồ sơ.', 'Submit real details and documents to start profile review.')
      : workerIsWaitingForReview(profile)
        ? textByLanguage(language, 'Bạn có thể bật nhận việc sau khi hồ sơ được duyệt.', 'Availability will unlock after the profile is approved.')
      : textByLanguage(language, 'Bạn có thể thay đổi trạng thái bất cứ khi nào không có công việc đang thực hiện.', 'You can change this whenever there is no work currently in progress.')

  return (
    <View style={styles.stack} testID="worker-v5-schedule-screen">
      <WorkerV5ProfileGroup testID="worker-v5-schedule-summary" title={textByLanguage(language, 'Lịch nhận việc', 'Work availability')}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{status}</Text>
          <Text style={styles.summaryBody}>{detail}</Text>
        </View>
      </WorkerV5ProfileGroup>
      <WorkerV5AvailabilityCard
        availabilityGuardReady={runtime.workerJobsHydrated}
        hasActiveJob={hasActiveJob}
        language={language}
        onOpenProfileSetup={onOpenProfileSetup}
        onToggleAvailability={runtime.actions.workerUpdateAvailability}
        profile={profile}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}
