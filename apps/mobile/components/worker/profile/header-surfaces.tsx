import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { formatNullableRating, textByLanguage } from '../ui/format'
import { workerAvailabilityLabel, workerVerificationLabel } from '../ui/labels'
import { workerV5ProfileBackendSyncPercent } from '../ui/performance'
import { styles } from './header-styles'

type WorkerV5ProfileHeaderProfile = WorkerProfileResponse | null | undefined
type WorkerV5ProfileHeaderInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5HeaderAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ProfileHeader({
  avatarIcon,
  heroAura: HeroAura,
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  avatarIcon: ImageSourcePropType
  heroAura: WorkerV5HeaderAura
  insights: WorkerV5ProfileHeaderInsights
  language: AppLanguage
  profile: WorkerV5ProfileHeaderProfile
  reduceTransparency: boolean
}) {
  const legalName = profile?.legal_name?.trim() || ''
  const name = legalName || textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')
  const syncPercent = workerV5ProfileBackendSyncPercent(insights)
  return (
    <View style={[styles.profileHeader, reduceTransparency && styles.opaqueCard]} testID="worker-v5-worker-avatar">
      {!reduceTransparency ? <HeroAura testID="worker-v5-profile-mint-aura" /> : null}
      <View style={styles.profileAvatar}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={avatarIcon} style={styles.profileAvatarImage} testID="worker-v5-profile-avatar-image" />
      </View>
      <View style={styles.profileHeaderText}>
        <Text style={styles.profileHeaderName} numberOfLines={2} testID="worker-v5-profile-header-name">{name}</Text>
        <View style={styles.profileHeaderChipRow}>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>{workerVerificationLabel(profile?.verification_status, language)}</Text>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>{formatNullableRating(profile?.rating, language)}</Text>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>
            {profile?.total_jobs && profile.total_jobs > 0
              ? textByLanguage(language, `${profile.total_jobs} việc`, `${profile.total_jobs} jobs`)
              : textByLanguage(language, 'Chưa có việc', 'No jobs')}
          </Text>
        </View>
        <View style={styles.profileProgressTrack}>
          <View style={[styles.profileProgressFill, { width: `${syncPercent}%` }]} testID="worker-v5-profile-sync-progress-fill" />
        </View>
        <Text style={styles.profileHeaderMeta} numberOfLines={1} testID="worker-v5-profile-sync-progress-label">{textByLanguage(language, `Hồ sơ đã đồng bộ ${syncPercent}%`, `Profile synced ${syncPercent}%`)}</Text>
      </View>
      <View style={styles.profileHeaderChip}>
        <Text style={styles.profileHeaderChipText} numberOfLines={2} testID="worker-v5-profile-header-availability">{workerAvailabilityLabel(profile, language)}</Text>
      </View>
    </View>
  )
}

export function WorkerV5ProfileDashboardCards({
  insights,
  language,
  listAura: ListAura,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5ProfileHeaderInsights
  language: AppLanguage
  listAura: WorkerV5HeaderAura
  profile: WorkerV5ProfileHeaderProfile
  reduceTransparency: boolean
}) {
  const score = insights?.performance_score ?? null
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasScore = score != null && Number.isFinite(score)
  const hasRating = rating != null && rating > 0
  const cards = [
    {
      icon: 'profile' as const,
      score: hasScore ? `${score}` : '0',
      scoreLabel: textByLanguage(language, 'xếp hạng', 'ranking'),
      title: hasScore ? textByLanguage(language, 'Điểm xếp hạng', 'Ranking score') : textByLanguage(language, 'Chưa có xếp hạng thật', 'No real ranking yet'),
    },
    {
      icon: 'shield' as const,
      score: hasRating ? `${rating}` : '0',
      scoreLabel: textByLanguage(language, 'đánh giá', 'rating'),
      title: hasRating ? textByLanguage(language, 'Độ tin cậy có nguồn', 'Sourced reliability') : textByLanguage(language, 'Chưa có đánh giá thật', 'No real rating yet'),
    },
  ]
  return (
    <View style={styles.profileDashboard} testID="worker-v5-profile-dashboard">
      {cards.map((card, index) => (
        <View key={card.title} style={[styles.profileDashboardCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-profile-dashboard-card-${index}`}>
          {!reduceTransparency ? <ListAura testID={`worker-v5-profile-dashboard-mint-aura-${index}`} /> : null}
          <View style={styles.profileDashboardScore}>
            <Text style={styles.profileDashboardScoreValue} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-${index}`}>{card.score}</Text>
            <Text style={styles.profileDashboardScoreLabel} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-label-${index}`}>{card.scoreLabel}</Text>
          </View>
          <View style={styles.profileDashboardCopy}>
            <Text style={styles.profileDashboardTitle} numberOfLines={2} testID={`worker-v5-profile-dashboard-title-${index}`}>{card.title}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
