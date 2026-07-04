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

import type { WorkerV5IconName } from '../dock/types'
import { formatNullablePercent, formatNullableRating, textByLanguage } from '../ui/format'
import { workerPerformanceAxisLabel, workerPerformanceAxisShortLabel } from '../ui/labels'
import { styles } from './reviews-styles'

type WorkerV5ReviewsProfile = WorkerProfileResponse | null | undefined
type WorkerV5ReviewsInsights = WorkerPerformanceInsightsResponse | null | undefined
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
  const reviewCount = insights?.review_count ?? 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reviews-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-reviews-mint-aura" /> : null}
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reviews-rating">{hasRating ? rating.toFixed(rating % 1 === 0 ? 0 : 1) : '—'}</Text>
        <Text style={styles.completionLensLabel} numberOfLines={1}>{textByLanguage(language, 'điểm', 'rating')}</Text>
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-reviews-count">{reviewCount > 0 ? textByLanguage(language, `${reviewCount} phản hồi`, `${reviewCount} reviews`) : textByLanguage(language, 'Chưa có phản hồi', 'No feedback yet')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-reviews-title">
          {hasRating ? textByLanguage(language, 'Tín hiệu chất lượng thật', 'Real quality signal') : textByLanguage(language, 'Chờ phản hồi thật', 'Waiting for real feedback')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Chỉ hiển thị điểm, lượt đánh giá và tín hiệu đã đồng bộ.', 'Only synced rating, counts, and signals are shown.')}
        </Text>
      </View>
    </View>
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
  chatIcon,
  insights,
  language,
  reduceTransparency,
}: {
  chatIcon: ImageSourcePropType
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  reduceTransparency: boolean
}) {
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
        meta: insights?.review_count && insights.review_count > 0
          ? textByLanguage(language, 'Có số lượt dánh giá nhưng chua đồng bộ nội dung chi tiết', 'Review count exists but detailed content is not synced')
          : textByLanguage(language, 'Chưa có phản hồi thật để hiển thị', 'No real feedback to show yet'),
        status: insights?.review_count && insights.review_count > 0 ? `${insights.review_count}` : textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback'),
      },
    ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-recent-feedback-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={chatIcon} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-feedback-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-feedback-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-feedback-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
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
  const weakestAxis = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0]
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
