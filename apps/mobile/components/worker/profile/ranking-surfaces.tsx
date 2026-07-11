import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { workerPerformanceAxisLabel } from '../ui/labels'
import { workerV5HasNumber, workerV5NumericInsight } from '../ui/performance'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './ranking-styles'

type WorkerV5RankingProfile = WorkerProfileResponse | null | undefined
type WorkerV5RankingInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5RankingAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5RankingStatsStrip({
  insights,
  language,
  listAura: _listAura,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5RankingInsights
  language: AppLanguage
  listAura: WorkerV5RankingAura
  profile: WorkerV5RankingProfile
  reduceTransparency: boolean
}) {
  const stats = [
    {
      label: textByLanguage(language, 'việc hoàn tất', 'completed'),
      value: workerV5NumericInsight(insights?.completed_job_count ?? profile?.total_jobs),
    },
    {
      label: textByLanguage(language, 'đánh giá', 'reviews'),
      value: workerV5NumericInsight(insights?.review_count),
    },
    {
      label: textByLanguage(language, 'đúng quy trình', 'on time'),
      value: `${workerV5NumericInsight(insights?.on_time_rate_percent)}%`,
    },
  ]
  return (
    <View style={styles.settlementStrip} testID="worker-v5-ranking-stat-strip">
      {stats.map((item, index) => (
        <View key={item.label} style={[styles.settlementCell, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-ranking-stat-${index}`}>
          <Text style={styles.settlementValue} numberOfLines={1} testID={`worker-v5-ranking-stat-value-${index}`}>{item.value}</Text>
          <Text style={styles.settlementLabel} numberOfLines={2} testID={`worker-v5-ranking-stat-label-${index}`}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5RankingLeaderboard({
  insights,
  language,
  listAura: _listAura,
  profile,
  profileIcon,
  reduceTransparency,
}: {
  insights: WorkerV5RankingInsights
  language: AppLanguage
  listAura: WorkerV5RankingAura
  profile: WorkerV5RankingProfile
  profileIcon: ImageSourcePropType
  reduceTransparency: boolean
}) {
  const score = workerV5NumericInsight(insights?.performance_score)
  const completed = workerV5NumericInsight(insights?.completed_job_count ?? profile?.total_jobs)
  const name = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-leaderboard">
      <View style={styles.approvalDecisionRow}>
        <WorkerV5IntegratedIcon
          bleed={12}
          image={profileIcon}
          reduceTransparency={reduceTransparency}
          testID="worker-v5-ranking-leaderboard-icon"
          tone="identity"
          variant="panel"
        />
        <View style={styles.approvalDecisionCopy}>
          <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID="worker-v5-ranking-leaderboard-title">{name}</Text>
          <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID="worker-v5-ranking-leaderboard-meta">
            {textByLanguage(language, `Hồ sơ hiện tại · ${completed} việc hoàn tất · nguồn Supabase`, `Current profile · ${completed} completed jobs · Supabase source`)}
          </Text>
          <WorkerV5DetailRail
            items={[
              { glyph: 'document', label: textByLanguage(language, `${completed} việc`, `${completed} jobs`) },
              { glyph: 'signal', label: `${score}/100` },
              { glyph: 'sync', label: textByLanguage(language, 'Nguồn thật', 'Real source') },
            ]}
            testID="worker-v5-ranking-leaderboard-detail"
          />
        </View>
        <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID="worker-v5-ranking-leaderboard-status">{score}</Text>
      </View>
    </View>
  )
}

export function WorkerV5RankingImprovementList({
  axisIcons,
  insights,
  language,
  listAura: _listAura,
  reduceTransparency,
}: {
  axisIcons: Record<string, ImageSourcePropType>
  insights: WorkerV5RankingInsights
  language: AppLanguage
  listAura: WorkerV5RankingAura
  reduceTransparency: boolean
}) {
  const fallbackAxes = ['arrival', 'completion', 'rating'] as const
  const axes = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .map((axis) => ({ id: axis.id, score: axis.score ?? 0 }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 3) ?? []
  const rows = (axes.length ? axes : fallbackAxes.map((id) => ({ id, score: 0 }))).slice(0, 3)
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-improvement-list">
      {rows.map((axis, index) => {
        const score = workerV5NumericInsight(axis.score)
        const gain = Math.max(0, 100 - score)
        return (
          <View key={axis.id} style={[styles.approvalDecisionRow, index > 0 && styles.offerDetailListDivider]}>
            <WorkerV5IntegratedIcon
              bleed={12}
              image={axisIcons[axis.id] ?? axisIcons.fallback}
              reduceTransparency={reduceTransparency}
              testID={`worker-v5-ranking-improvement-icon-${index}`}
              tone={axis.id === 'arrival' ? 'signal' : axis.id === 'completion' ? 'document' : 'identity'}
              variant="panel"
            />
            <View style={styles.approvalDecisionCopy}>
              <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-ranking-improvement-title-${index}`}>
                {workerPerformanceAxisLabel(axis.id, language)}
              </Text>
              <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-ranking-improvement-meta-${index}`}>
                {score > 0
                  ? textByLanguage(language, `${score}/100 từ dữ liệu hiệu suất thật`, `${score}/100 from real performance data`)
                  : textByLanguage(language, '0/100 khi chưa có dữ liệu thật', '0/100 until real data syncs')}
              </Text>
              <WorkerV5DetailRail
                items={score > 0
                  ? [
                    { glyph: 'signal', label: `${score}/100` },
                    { glyph: 'check', label: textByLanguage(language, 'Đã ghi nhận', 'Recorded') },
                  ]
                  : [
                    { glyph: 'sync', label: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data') },
                    { glyph: 'spark', label: textByLanguage(language, `Có thể tăng +${gain}`, `Up to +${gain}`) },
                  ]}
                testID={`worker-v5-ranking-improvement-detail-${index}`}
              />
              <View style={styles.rankingProgressTrack}>
                <View style={[styles.rankingProgressFill, { width: `${Math.max(0, Math.min(100, score))}%` as ViewStyle['width'] }]} />
              </View>
            </View>
            <Text style={styles.approvalDecisionStatus} numberOfLines={1} testID={`worker-v5-ranking-improvement-status-${index}`}>
              +{gain}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
