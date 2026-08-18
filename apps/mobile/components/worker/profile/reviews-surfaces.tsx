import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { formatNullablePercent, formatNullableRating, textByLanguage } from '../ui/format'
import { workerPerformanceAxisLabel, workerPerformanceAxisShortLabel } from '../ui/labels'
import { WorkerV5ProfileFormulaCard } from './worker-profile-formula-surfaces'
import { styles as formulaStyles } from './worker-profile-formula-styles'
import { WorkerReviewsGlyph } from './worker-profile-sections-surfaces'
import { styles } from './reviews-styles'

type WorkerV5ReviewsProfile = WorkerProfileResponse | null | undefined
type WorkerV5ReviewsInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5PerformanceAxis = WorkerPerformanceInsightsResponse['performance_axes'][number]
type WorkerV5MetricTile = ComponentType<{ label: string; value: string }>
type WorkerV5KaelBriefCard = ComponentType<{
  body?: string
  icon: WorkerV5IconName
  reduceTransparency: boolean
  title: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function findWeakestPerformanceAxis(
  axes: WorkerPerformanceInsightsResponse['performance_axes'] | undefined,
): WorkerV5PerformanceAxis | undefined {
  let weakest: WorkerV5PerformanceAxis | undefined
  for (const axis of axes ?? []) {
    if (typeof axis.score !== 'number' || !Number.isFinite(axis.score)) continue
    if (!weakest || axis.score < (weakest.score ?? Number.POSITIVE_INFINITY)) weakest = axis
  }
  return weakest
}

export function WorkerV5ReviewsHero({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  profile: WorkerV5ReviewsProfile
  reduceTransparency: boolean
}) {
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasRating = typeof rating === 'number' && rating > 0
  const reviewCount = typeof insights?.review_count === 'number' && Number.isFinite(insights.review_count)
    ? insights.review_count
    : null
  return (
    <WorkerV5ProfileFormulaCard
      auraTestID="worker-v5-reviews-mint-aura"
      contentStyle={[formulaStyles.heroContent, styles.formulaHeroContent]}
      reduceTransparency={reduceTransparency}
      scope="WorkerReviewsHero"
      style={styles.formulaHeroCard}
      testID="worker-v5-reviews-hero"
    >
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reviews-rating">{hasRating ? rating.toFixed(rating % 1 === 0 ? 0 : 1) : '—'}</Text>
        <Text style={styles.completionLensLabel} numberOfLines={1}>{textByLanguage(language, 'điểm', 'rating')}</Text>
      </View>
      <View style={styles.earningsHeroCopy}>
        {reviewCount !== null && reviewCount > 0 ? (
          <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-reviews-count">
            {textByLanguage(language, `${reviewCount} phản hồi`, `${reviewCount} reviews`)}
          </Text>
        ) : null}
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-reviews-title">
          {hasRating ? textByLanguage(language, 'Tín hiệu chất lượng thật', 'Real quality signal') : textByLanguage(language, 'Chờ phản hồi thật', 'Waiting for real feedback')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Chỉ hiển thị dữ liệu đánh giá đã đồng bộ.', 'Only synced review data is shown.')}
        </Text>
      </View>
    </WorkerV5ProfileFormulaCard>
  )
}

export function WorkerV5ReviewSignalGrid({
  insights,
  language,
  metricTile: MetricTile,
  profile,
}: {
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  metricTile: WorkerV5MetricTile
  profile: WorkerV5ReviewsProfile
}) {
  const axisCells = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .slice(0, 3)
    .map((axis) => ({
      label: workerPerformanceAxisShortLabel(axis.id, language),
      value: `${axis.score}/100`,
    })) ?? []
  const cells = axisCells.length
    ? axisCells
    : [
      { label: textByLanguage(language, 'Đánh giá', 'Rating'), value: formatNullableRating(insights?.average_rating ?? profile?.rating, language) },
      { label: textByLanguage(language, 'Phản hồi', 'Response'), value: formatNullablePercent(insights?.response_rate_percent, language) },
      { label: textByLanguage(language, 'Đúng hẹn', 'On-time'), value: formatNullablePercent(insights?.on_time_rate_percent, language) },
    ]
  return (
    <View style={styles.metricsGrid} testID="worker-v5-review-signal-grid">
      {cells.map((cell) => (
        <MetricTile key={`${cell.label}-${cell.value}`} label={cell.label} value={cell.value} />
      ))}
    </View>
  )
}

export function WorkerV5RecentFeedbackList({
  insights,
  language,
  reduceTransparency,
}: {
  chatIcon?: ImageSourcePropType
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const reviewCount = typeof insights?.review_count === 'number' && Number.isFinite(insights.review_count)
    ? insights.review_count
    : null
  const axes = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .slice(0, 3) ?? []
  const rows = axes.length
    ? axes.map((axis) => ({
      meta: textByLanguage(language, 'Tín hiệu tổng hợp, không phải lời khách nguyên văn', 'Aggregate signal, not a fabricated customer quote'),
      status: `${axis.score}/100`,
      title: workerPerformanceAxisLabel(axis.id, language),
    }))
    : [
      {
        meta: reviewCount === null
          ? textByLanguage(language, 'Chưa có dữ liệu đánh giá thật để hiển thị', 'No real review data is available yet')
          : reviewCount > 0
            ? textByLanguage(language, 'Có số lượt đánh giá nhưng chưa đồng bộ nội dung chi tiết', 'Review count exists but detailed content is not synced')
            : textByLanguage(language, 'Chưa có phản hồi thật để hiển thị', 'No real feedback to show yet'),
        status: reviewCount !== null && reviewCount > 0 ? `${reviewCount}` : undefined,
        title: textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback'),
      },
    ]
  return (
    <WorkerV5ProfileFormulaCard
      contentStyle={styles.feedbackListContent}
      reduceTransparency={reduceTransparency}
      scope="WorkerReviewsRecentFeedback"
      style={styles.approvalDecisionList}
      testID="worker-v5-recent-feedback-list"
    >
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            <WorkerReviewsGlyph name={index % 2 === 0 ? 'feedback' : 'pulse'} testID={`worker-v5-feedback-icon-${index}`} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-feedback-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-feedback-meta-${index}`}>{row.meta}</Text>
          </View>
          {row.status ? <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-feedback-status-${index}`}>{row.status}</Text> : null}
        </View>
      ))}
    </WorkerV5ProfileFormulaCard>
  )
}

export function WorkerV5ReviewImprovementPlan({
  insights,
  kaelBriefCard: KaelBriefCard,
  language,
  reduceTransparency,
}: {
  insights: WorkerV5ReviewsInsights
  kaelBriefCard: WorkerV5KaelBriefCard
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const weakestAxis = findWeakestPerformanceAxis(insights?.performance_axes)
  const body = weakestAxis
    ? textByLanguage(
      language,
      `Kael có thể huấn luyện dựa trên ${workerPerformanceAxisLabel(weakestAxis.id, language).toLowerCase()} (${weakestAxis.score}/100).`,
      `Kael can coach from ${workerPerformanceAxisLabel(weakestAxis.id, language).toLowerCase()} (${weakestAxis.score}/100).`,
    )
    : textByLanguage(language, 'Cần thêm dữ liệu đánh giá thật trước khi tạo kế hoạch cải thiện.', 'More real review data is needed before making an improvement plan.')
  return (
    <View testID="worker-v5-review-improvement-plan">
      <KaelBriefCard
        body={body}
        icon="chat"
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Kế hoạch cải thiện', 'Improvement plan')}
      />
    </View>
  )
}
