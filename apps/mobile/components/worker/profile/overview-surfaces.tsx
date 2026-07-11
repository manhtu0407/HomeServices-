import type { ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'
import type { ServiceType } from '@nestscout/shared'

import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { workerV5NumericInsight, workerV5ReliabilityPercentValue } from '../ui/performance'
import { WorkerV5DetailRail, type WorkerV5DetailRailItem } from '../ui/worker-v5-detail-rail'
import { styles } from './overview-styles'

type WorkerV5ProfileOverviewProfile = WorkerProfileResponse | null | undefined
type WorkerV5ProfileOverviewInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5OverviewAura = ComponentType<{ scope: string; style?: StyleProp<ViewStyle>; testID?: string }>
type WorkerV5DossierIconName = 'reliability' | 'services' | 'settings'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function WorkerV5ServiceMicroGlyph({ service }: { service: ServiceType }) {
  if (service === 'electrical') {
    return (
      <Svg height={18} viewBox="0 0 18 18" width={18}>
        <Path d="M10.6 1.5 3.8 10h4L7.4 16.5l6.8-8.5h-4l.4-6.5Z" fill="#31B9A4" />
      </Svg>
    )
  }
  if (service === 'cleaning') {
    return (
      <Svg height={18} viewBox="0 0 18 18" width={18}>
        <Path d="m10.5 1.8 1.7 1.7-4.4 4.4-1.7-1.7 4.4-4.4Z" fill="#31B9A4" />
        <Path d="m4.7 7.7 5.6 5.6-2.6 2.6-5.6-5.6 2.6-2.6Z" fill="#7DD9C8" />
        <Path d="m1.7 12.2 3.2 3.2m-1.7-4.7 3.2 3.2m.7-5.3 3.2 3.2" stroke="#159E8C" strokeLinecap="round" strokeWidth={0.9} />
      </Svg>
    )
  }
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path d="M3 2.5h6v4H7.2v4.2H15V15H7.2v-4.2H3V2.5Z" fill="#31B9A4" />
      <Circle cx={4.5} cy={4.5} fill="#E8FBF7" r={1.1} />
      <Path d="M13.2 15.3c0-1.2.8-2.2 1.8-2.2s1.8 1 1.8 2.2-1.8 2.4-1.8 2.4-1.8-1.2-1.8-2.4Z" fill="#73D5C3" />
    </Svg>
  )
}

export function WorkerV5ProfileDossierCard({
  caseWideAura: _caseWideAura,
  icons,
  insights,
  language,
  onOpenReliability,
  onOpenSettings,
  onOpenSkills,
  profile,
  reduceTransparency,
  zipAura: _zipAura,
}: {
  caseWideAura: WorkerV5OverviewAura
  icons: Record<WorkerV5DossierIconName, ImageSourcePropType>
  insights: WorkerV5ProfileOverviewInsights
  language: AppLanguage
  onOpenReliability: () => void
  onOpenSettings: () => void
  onOpenSkills: () => void
  profile: WorkerV5ProfileOverviewProfile
  reduceTransparency: boolean
  zipAura: WorkerV5OverviewAura
}) {
  const trustScore = workerV5NumericInsight(insights?.performance_score)
  const services = profile?.service_types?.length
    ? profile.service_types.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có dịch vụ đã duyệt', 'No approved services')
  const reliabilityMeta = insights?.performance_score != null
    ? textByLanguage(language, `${trustScore}/100 · ${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} đúng hẹn`, `${trustScore}/100 · ${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} on-time`)
    : textByLanguage(language, 'Chưa có dữ liệu hiệu suất thật', 'No real performance data')
  const approvedServices = profile?.service_types ?? []
  const reliabilityDetails: WorkerV5DetailRailItem[] = insights?.performance_score != null
    ? [
      { glyph: 'signal', label: `${trustScore}/100` },
      { glyph: 'arrival', label: textByLanguage(language, `${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} đúng hẹn`, `${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} on-time`) },
    ]
    : [
      { glyph: 'signal', label: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data') },
      { glyph: 'arrival', label: textByLanguage(language, 'Sau công việc', 'After a job') },
    ]
  const settingsDetails: WorkerV5DetailRailItem[] = [
    { glyph: 'identity', label: textByLanguage(language, 'Tài khoản', 'Account') },
    { glyph: 'shield', label: textByLanguage(language, 'Bảo mật', 'Security') },
    { glyph: 'memory', label: textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory') },
  ]
  const rows = [
    { icon: 'services' as const, meta: services, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Dịch vụ chuyên môn', 'Service dossier') },
    { icon: 'reliability' as const, meta: reliabilityMeta, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Độ tin cậy', 'Reliability') },
    { icon: 'settings' as const, meta: textByLanguage(language, 'Tài khoản, bảo mật và bộ nhớ Kael', 'Account, security, and Kael memory'), status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Cài đặt', 'Settings') },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-profile-dossier">
      {rows.map((row, index) => {
        const isServiceDossier = row.icon === 'services'
        const rowContent = (
          <>
            <WorkerV5IntegratedIcon
              bleed={12}
              image={icons[row.icon]}
              reduceTransparency={reduceTransparency}
              testID={`worker-v5-profile-dossier-icon-${index}`}
              tone={isServiceDossier ? 'service' : row.icon === 'reliability' ? 'signal' : 'identity'}
              variant="panel"
            />
            <View style={styles.approvalDecisionCopy} testID={`worker-v5-profile-dossier-copy-${index}`}>
              <Text style={[styles.approvalDecisionTitle, isServiceDossier && styles.approvalDecisionTitlePrimary]} numberOfLines={2} testID={`worker-v5-profile-dossier-title-${index}`}>{row.title}</Text>
              {isServiceDossier && approvedServices.length ? (
                <View style={styles.approvalServiceList} testID={`worker-v5-profile-dossier-meta-${index}`}>
                  {approvedServices.map((service, serviceIndex) => (
                    <View key={service} style={styles.approvalServiceDetail}>
                      <WorkerV5ServiceMicroGlyph service={service} />
                      <Text style={styles.approvalServiceMeta} numberOfLines={1}>{localizedServiceLabel(service, language)}</Text>
                      {serviceIndex < approvedServices.length - 1 ? <View style={styles.approvalServiceDivider} /> : null}
                    </View>
                  ))}
                </View>
              ) : row.icon === 'reliability' ? (
                <WorkerV5DetailRail items={reliabilityDetails} testID={`worker-v5-profile-dossier-detail-${index}`} />
              ) : row.icon === 'settings' ? (
                <WorkerV5DetailRail items={settingsDetails} testID={`worker-v5-profile-dossier-detail-${index}`} />
              ) : (
                <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-profile-dossier-meta-${index}`}>{row.meta}</Text>
              )}
            </View>
            <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-profile-dossier-status-${index}`}>{row.status}</Text>
          </>
        )
        if (index === 0 || index === 1 || index === 2) {
          const onPress = index === 0 ? onOpenSkills : index === 1 ? onOpenReliability : onOpenSettings
          const accessibilityLabel = index === 0
            ? textByLanguage(language, 'Mở kỹ năng và khu vực', 'Open skills and service area')
            : index === 1
              ? textByLanguage(language, 'Mở độ tin cậy', 'Open reliability insights')
              : textByLanguage(language, 'Mở cài đặt', 'Open settings')
          return (
            <Pressable
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              key={row.title}
              onPress={onPress}
              style={({ pressed }) => [styles.approvalDecisionRow, isServiceDossier && styles.approvalDecisionRowPrimary, pressed ? styles.pressed : null]}
              testID={`worker-v5-profile-dossier-row-${index}`}
            >
              {rowContent}
            </Pressable>
          )
        }
        return (
          <View key={row.title} style={[styles.approvalDecisionRow, isServiceDossier && styles.approvalDecisionRowPrimary]} testID={`worker-v5-profile-dossier-row-${index}`}>
            {rowContent}
          </View>
        )
      })}
    </View>
  )
}
