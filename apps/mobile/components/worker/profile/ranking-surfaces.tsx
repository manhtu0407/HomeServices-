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
const rankingImprovementAxisOrder = ['arrival', 'completion', 'rating', 'work_response', 'incident_handling'] as const

function rankingAxisTone(axisId: string) {
  if (axisId === 'arrival') return 'signal' as const
  if (axisId === 'completion' || axisId === 'incident_handling') return 'document' as const
  return 'identity' as const
}

function rankingAxisMeta(axisId: string, score: number | null, insights: WorkerV5RankingInsights, language: AppLanguage) {
  if (axisId === 'work_response') {
    const reviewCount = insights?.work_response_review_count ?? 0
    return reviewCount > 0
      ? textByLanguage(language, `Kael tổng hợp từ ${reviewCount} đánh giá của khách`, `Kael aggregates ${reviewCount} customer reviews`)
      : textByLanguage(language, 'Chờ khách đánh giá sau khi công việc hoàn tất', 'Waiting for customer feedback after completion')
  }
  if (axisId === 'incident_handling') {
    const incidentCount = insights?.resolved_incident_case_count ?? 0
    return incidentCount > 0
      ? textByLanguage(language, `${Math.min(4, incidentCount)}/4 ca đã được Kael và khách chốt`, `${Math.min(4, incidentCount)}/4 cases closed by Kael and customer`)
      : textByLanguage(language, 'Mỗi phát sinh chỉ tính khi Kael và khách đã chốt', 'Each incident counts only after Kael and customer close it')
  }
  return score === null
    ? textByLanguage(language, 'Chờ dữ liệu hiệu suất thật', 'Waiting for real performance data')
    : textByLanguage(language, `${score}/100 từ dữ liệu hiệu suất thật`, `${score}/100 from real performance data`)
}

function rankingAxisStatus(axisId: string, score: number | null, insights: WorkerV5RankingInsights, language: AppLanguage) {
  if (axisId === 'incident_handling') {
    const bonus = insights?.incident_rank_bonus ?? 0
    return bonus > 0
      ? textByLanguage(language, `+${bonus} điểm`, `+${bonus} points`)
      : textByLanguage(language, '+5/ca', '+5/case')
  }
  if (score === null) return textByLanguage(language, 'Chờ', 'Waiting')
  return `+${Math.max(0, 100 - score)}`
}

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
  const scoreByAxis = new Map(insights?.performance_axes.map((axis) => [axis.id, axis.score] as const) ?? [])
  const rows = rankingImprovementAxisOrder.map((id) => ({ id, score: scoreByAxis.get(id) ?? null }))
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-improvement-list">
      {rows.map((axis, index) => {
        const score = typeof axis.score === 'number' && Number.isFinite(axis.score) ? workerV5NumericInsight(axis.score) : null
        const progress = score ?? 0
        const gain = Math.max(0, 100 - progress)
        const incidentCount = insights?.resolved_incident_case_count ?? 0
        const workResponseReviewCount = insights?.work_response_review_count ?? 0
        return (
          <View key={axis.id} style={[styles.approvalDecisionRow, index > 0 && styles.offerDetailListDivider]}>
            <WorkerV5IntegratedIcon
              bleed={12}
              image={axisIcons[axis.id] ?? axisIcons.fallback}
              imageScale={axis.id === 'completion' ? 1.18 : 1}
              imageTranslationX={axis.id === 'completion' ? 12 : 0}
              reduceTransparency={reduceTransparency}
              testID={`worker-v5-ranking-improvement-icon-${index}`}
              tone={rankingAxisTone(axis.id)}
              variant="panel"
            />
            <View style={styles.approvalDecisionCopy}>
              <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-ranking-improvement-title-${index}`}>
                {workerPerformanceAxisLabel(axis.id, language)}
              </Text>
              <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-ranking-improvement-meta-${index}`}>
                {rankingAxisMeta(axis.id, score, insights, language)}
              </Text>
              <WorkerV5DetailRail
                items={axis.id === 'incident_handling'
                  ? incidentCount > 0
                    ? [
                      { glyph: 'document', label: textByLanguage(language, `${Math.min(4, incidentCount)}/4 ca đã chốt`, `${Math.min(4, incidentCount)}/4 cases closed`) },
                      { glyph: 'spark', label: textByLanguage(language, `+${insights?.incident_rank_bonus ?? 0} điểm hạng`, `+${insights?.incident_rank_bonus ?? 0} rank points`) },
                    ]
                    : [
                      { glyph: 'sync', label: textByLanguage(language, 'Chưa có phát sinh thật', 'No real incidents yet') },
                      { glyph: 'spark', label: textByLanguage(language, 'Mỗi ca +5 điểm hạng', 'Each case +5 rank points') },
                    ]
                  : axis.id === 'work_response'
                    ? score !== null
                      ? [
                        { glyph: 'signal', label: `${score}/100` },
                        { glyph: 'check', label: textByLanguage(language, `${workResponseReviewCount} đánh giá khách`, `${workResponseReviewCount} customer reviews`) },
                      ]
                      : [
                        { glyph: 'sync', label: textByLanguage(language, 'Chờ khách đánh giá', 'Waiting for customer review') },
                        { glyph: 'spark', label: textByLanguage(language, 'Kael tính sau đánh giá', 'Kael scores after review') },
                      ]
                  : score !== null
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
                <View style={[styles.rankingProgressFill, { width: `${Math.max(0, Math.min(100, progress))}%` as ViewStyle['width'] }]} />
              </View>
            </View>
            <Text style={styles.approvalDecisionStatus} numberOfLines={1} testID={`worker-v5-ranking-improvement-status-${index}`}>
              {rankingAxisStatus(axis.id, score, insights, language)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
