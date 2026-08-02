import type { ImageSourcePropType } from 'react-native'
import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { workerV5HasNumber, workerV5NumericInsight } from '../ui/performance'
import {
  WorkerV5ProfileGroup,
  WorkerV5ProfileGroupDivider,
  WorkerV5ProfileGroupRow,
} from './grouped-list-surfaces'
import { styles } from './overview-styles'

type WorkerV5ProfileOverviewProfile = WorkerProfileResponse | null | undefined
type WorkerV5ProfileOverviewInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5DossierIconName = 'logout' | 'reliability' | 'schedule' | 'services' | 'settings'

export function WorkerV5ProfileDossierCard({
  icons,
  insights,
  language,
  onOpenReliability,
  onOpenSchedule,
  onOpenSettings,
  onOpenSkills,
  onSignOut,
  profile,
}: {
  icons: Record<WorkerV5DossierIconName, ImageSourcePropType>
  insights: WorkerV5ProfileOverviewInsights
  language: AppLanguage
  onOpenReliability: () => void
  onOpenSchedule: () => void
  onOpenSettings: () => void
  onOpenSkills: () => void
  onSignOut: () => void
  profile: WorkerV5ProfileOverviewProfile
}) {
  const selectedServices = profile?.selected_service_types
    ?? profile?.active_service_types
    ?? profile?.service_types
    ?? []
  const hasTrustScore = workerV5HasNumber(insights?.performance_score)
  const schedule = profile?.is_suspended
    ? {
        status: textByLanguage(language, 'Đang khóa', 'Suspended'),
        tone: 'danger' as const,
      }
    : profile?.is_available && profile.is_approved
      ? {
          status: textByLanguage(language, 'Đang nhận', 'Accepting'),
          tone: 'active' as const,
        }
      : profile?.is_approved
        ? {
            status: textByLanguage(language, 'Đang tắt', 'Paused'),
            tone: 'muted' as const,
          }
        : {
            status: textByLanguage(language, 'Cần hồ sơ', 'Profile needed'),
            tone: 'muted' as const,
          }
  const serviceStatus = !profile
    ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting')
    : selectedServices.length
      ? textByLanguage(language, `${selectedServices.length} dịch vụ`, `${selectedServices.length} services`)
      : textByLanguage(language, 'Chưa chọn', 'Not selected')
  const reliabilityStatus = hasTrustScore
    ? `${workerV5NumericInsight(insights?.performance_score)}/100`
    : textByLanguage(language, 'Chưa có dữ liệu', 'No data')

  return (
    <View style={styles.profileDossierStack} testID="worker-v5-profile-dossier">
      <WorkerV5ProfileGroup testID="worker-v5-profile-group-professional" title={textByLanguage(language, 'Hồ sơ nghiệp vụ', 'Work profile')}>
        <WorkerV5ProfileGroupRow
          description={textByLanguage(language, 'Quản lý dịch vụ, khu vực làm việc và hồ sơ xác minh.', 'Manage services, work area, and verification.')}
          icon={icons.services}
          onPress={onOpenSkills}
          status={serviceStatus}
          testID="worker-v5-profile-row-services"
          title={textByLanguage(language, 'Dịch vụ chuyên môn', 'Professional services')}
        />
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          description={textByLanguage(language, 'Theo dõi hiệu suất và phản hồi từ công việc thật.', 'Review performance and feedback from real work.')}
          icon={icons.reliability}
          onPress={onOpenReliability}
          status={reliabilityStatus}
          statusTone={hasTrustScore ? 'active' : 'muted'}
          testID="worker-v5-profile-row-reliability"
          title={textByLanguage(language, 'Độ tin cậy', 'Reliability')}
        />
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-profile-group-schedule" title={textByLanguage(language, 'Lịch nhận việc', 'Work availability')}>
        <WorkerV5ProfileGroupRow
          icon={icons.schedule}
          onPress={onOpenSchedule}
          status={schedule.status}
          statusTone={schedule.tone}
          testID="worker-v5-profile-row-schedule"
          title={textByLanguage(language, 'Trạng thái nhận việc', 'Availability status')}
        />
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-profile-group-settings" title={textByLanguage(language, 'Tài khoản & ứng dụng', 'Account & app')}>
        <WorkerV5ProfileGroupRow
          icon={icons.settings}
          onPress={onOpenSettings}
          status={textByLanguage(language, 'Mở', 'Open')}
          statusTone="active"
          testID="worker-v5-profile-row-settings"
          title={textByLanguage(language, 'Cài đặt', 'Settings')}
        />
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-profile-group-account" title={textByLanguage(language, 'Quản lý tài khoản', 'Account management')}>
        <WorkerV5ProfileGroupRow
          description={textByLanguage(language, 'Kết thúc phiên trên thiết bị này.', 'End this session on this device.')}
          icon={icons.logout}
          onPress={onSignOut}
          statusTone="danger"
          testID="worker-v5-profile-sign-out"
          title={textByLanguage(language, 'Đăng xuất', 'Sign out')}
        />
      </WorkerV5ProfileGroup>
    </View>
  )
}
