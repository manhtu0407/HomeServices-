import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { workerV5NumericInsight, workerV5ReliabilityPercentValue } from '../ui/performance'
import { styles } from './overview-styles'

type WorkerV5ProfileOverviewProfile = WorkerProfileResponse | null | undefined
type WorkerV5ProfileOverviewInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5OverviewAura = ComponentType<{ scope: string; style?: StyleProp<ViewStyle>; testID?: string }>
type WorkerV5DossierIconName = 'clock' | 'shield' | 'tools'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ProfileDossierCard({
  caseWideAura: CaseWideAura,
  icons,
  insights,
  language,
  onOpenReliability,
  onOpenSettings,
  onOpenSkills,
  profile,
  reduceTransparency,
  zipAura: ZipAura,
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
  const rows = [
    { icon: 'tools' as const, meta: services, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Dịch vụ chuyên môn', 'Service dossier') },
    { icon: 'clock' as const, meta: reliabilityMeta, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Độ tin cậy', 'Reliability') },
    { icon: 'shield' as const, meta: textByLanguage(language, 'Tài khoản, bảo mật và bộ nhớ Kael', 'Account, security, and Kael memory'), status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Cài đặt', 'Settings') },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-profile-dossier">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="ProfileDossierWide" testID="worker-v5-profile-dossier-wide-mint-aura" />
          <ZipAura scope="ProfileDossierFine" testID="worker-v5-profile-dossier-mint-aura" />
        </>
      ) : null}
      {rows.map((row, index) => {
        const rowContent = (
          <>
            {!reduceTransparency ? (
              <ZipAura
                scope={`ProfileDossierRow${index}`}
                style={styles.profileDossierRowAura}
                testID={`worker-v5-profile-dossier-row-${index}-mint-aura`}
              />
            ) : null}
            <View style={styles.approvalDecisionIconShell} testID="worker-v5-profile-dossier-icon-shell">
              {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Image resizeMode="contain" source={icons[row.icon]} style={styles.approvalDecisionIcon} testID="worker-v5-profile-dossier-icon" />
            </View>
            <View style={styles.approvalDecisionCopy}>
              <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-profile-dossier-title-${index}`}>{row.title}</Text>
              <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-profile-dossier-meta-${index}`}>{row.meta}</Text>
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
              style={({ pressed }) => [styles.approvalDecisionRow, pressed ? styles.pressed : null]}
              testID={`worker-v5-profile-dossier-row-${index}`}
            >
              {rowContent}
            </Pressable>
          )
        }
        return (
          <View key={row.title} style={styles.approvalDecisionRow} testID={`worker-v5-profile-dossier-row-${index}`}>
            {rowContent}
          </View>
        )
      })}
    </View>
  )
}
