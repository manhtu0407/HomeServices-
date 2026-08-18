import {
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import type { ReactNode } from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage, formatNullablePercent, formatNullableRating } from '../ui/format'
import { workerPerformanceAxisLabel } from '../ui/labels'
import {
  workerV5HasNumber,
  workerV5NumericInsight,
  workerV5ReliabilityAxes,
  workerV5ReliabilityAxisMeta,
  workerV5ReliabilityAxisScore,
  workerV5ReliabilityAxisTitle,
  workerV5ReliabilityPercentValue,
  workerV5ReliabilityRatingValue,
} from '../ui/performance'
import { workerV5VerificationChecks } from './verification-model'
import { styles } from './worker-profile-sections-styles'

type WorkerV5ReviewsInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5Profile = WorkerProfileResponse | null | undefined
type WorkerProfileSectionIconName = 'badge' | 'calendar' | 'chat' | 'check' | 'document' | 'medal' | 'shield' | 'tools' | 'worker'
type WorkerReliabilityIconName = 'cadence' | 'proof' | 'quality' | 'stability'
export type WorkerReviewsIconName = 'feedback' | 'pulse'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.rowMeta, style]} />
}

function SectionHeading({ action, title }: { action?: string; title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <RNText style={styles.sectionHeadingTitle}>{title}</RNText>
      {action ? <RNText style={styles.sectionHeadingAction}>{action}</RNText> : null}
    </View>
  )
}

function SectionGlyph({ name, testID }: { name: WorkerProfileSectionIconName; testID?: string }) {
  const common = {
    fill: 'none' as const,
    stroke: color.brand.primary,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.55,
  }

  switch (name) {
    case 'badge':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={7.8} r={4.2} />
          <Path {...common} d="m7.8 11.2-1 5 3.2-1.8 3.2 1.8-1-5M8.6 8.1l1 .9 1.8-1.8" />
        </Svg>
      )
    case 'calendar':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Rect {...common} height={13.2} rx={2} width={14} x={3} y={4.2} />
          <Path {...common} d="M6.5 2.8v3M13.5 2.8v3M3 8h14" />
        </Svg>
      )
    case 'medal':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={7.7} r={4.1} />
          <Path {...common} d="m7.5 11.1-.8 5.1 3.3-1.9 3.3 1.9-.8-5.1M8.5 7.8 10 9l1.5-1.2" />
        </Svg>
      )
    case 'chat':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="M4.4 4.1h11.2a2 2 0 0 1 2 2v6.1a2 2 0 0 1-2 2H9.4l-3.6 2.1v-2.1h-1.4a2 2 0 0 1-2-2V6.1a2 2 0 0 1 2-2Z" />
          <Path {...common} d="M6.3 9.2h.1M9.9 9.2h.1M13.5 9.2h.1" />
        </Svg>
      )
    case 'check':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={10} r={7.2} />
          <Path {...common} d="m6.6 10 2.2 2.2 4.7-4.7" />
        </Svg>
      )
    case 'document':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="M5.2 2.8h6l3.6 3.6v10.8H5.2V2.8Z" />
          <Path {...common} d="M11.2 2.8v3.6h3.6M7.7 10h4.6M7.7 13h4.6" />
        </Svg>
      )
    case 'shield':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="m10 2.7 6 2.2v4.7c0 3.5-2.4 6.3-6 7.7-3.6-1.4-6-4.2-6-7.7V4.9l6-2.2Z" />
          <Path {...common} d="m7.3 10 1.8 1.8 3.7-3.7" />
        </Svg>
      )
    case 'tools':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="M11.7 4a3.3 3.3 0 0 0-3.8 4.3l-4.1 4.1a1.6 1.6 0 0 0 2.3 2.3l4.1-4.1A3.3 3.3 0 0 0 14.5 7l-2 2-2-.6-.6-2 1.8-2.4Z" />
        </Svg>
      )
    case 'worker':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={6.3} r={2.7} />
          <Path {...common} d="M4.6 16.7a5.4 5.4 0 0 1 10.8 0" />
        </Svg>
      )
  }
}

function ReliabilityGlyph({ name, testID }: { name: WorkerReliabilityIconName; testID?: string }) {
  const common = {
    fill: 'none' as const,
    stroke: color.brand.primary,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.55,
  }

  switch (name) {
    case 'cadence':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="m3.2 12.8 4-4 3 2.2 6.6-5.5" />
          <Path {...common} d="M14.2 5.5h2.6v2.6" />
          <Circle {...common} cx={3.2} cy={12.8} r={1.2} />
          <Circle {...common} cx={7.2} cy={8.8} r={1.2} />
          <Circle {...common} cx={10.2} cy={11} r={1.2} />
        </Svg>
      )
    case 'proof':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="M4 5.2h1.4M8.2 5.2H16M4 10h1.4M8.2 10H16M4 14.8h1.4M8.2 14.8H16" />
          <Path {...common} d="m4.1 4.9.6.6 1.1-1.1M4.1 9.7l.6.6 1.1-1.1M4.1 14.5l.6.6 1.1-1.1" />
        </Svg>
      )
    case 'quality':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Path {...common} d="M3.1 13.8a7 7 0 0 1 13.8 0" />
          <Path {...common} d="M10 13.8 13.6 8.7" />
          <Circle {...common} cx={10} cy={13.8} r={1.3} />
        </Svg>
      )
    case 'stability':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={10} r={7.1} />
          <Circle {...common} cx={10} cy={10} r={3.1} />
          <Path {...common} d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2" />
        </Svg>
      )
  }
}

export function WorkerReviewsGlyph({ name, testID }: { name: WorkerReviewsIconName; testID?: string }) {
  const common = {
    fill: 'none' as const,
    stroke: color.brand.primary,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.55,
  }

  switch (name) {
    case 'feedback':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={10} r={7.1} />
          <Path {...common} d="M6.4 8.4h2.1M6.4 11.6h2.1M11.5 8.4h2.1M11.5 11.6h2.1" />
          <Path {...common} d="M9.7 14.2h.6" />
        </Svg>
      )
    case 'pulse':
      return (
        <Svg height={22} testID={testID} viewBox="0 0 20 20" width={22}>
          <Circle {...common} cx={10} cy={10} r={7.1} />
          <Path {...common} d="M4.3 10h2l1.4-2.8 2.2 5.6 1.7-3.6h4.1" />
        </Svg>
      )
  }
}

function IconFrame({ icon, testID }: { icon: WorkerProfileSectionIconName; testID: string }) {
  return (
    <View style={styles.rowIconFrame} testID={`${testID}-frame`}>
      <SectionGlyph name={icon} testID={testID} />
    </View>
  )
}

function SummaryIconFrame({ icon, testID }: { icon: WorkerProfileSectionIconName; testID: string }) {
  return (
    <View style={styles.summaryIconFrame}>
      <SectionGlyph name={icon} testID={testID} />
    </View>
  )
}

function ReviewsIconFrame({ icon, testID }: { icon: WorkerReviewsIconName; testID: string }) {
  return (
    <View style={styles.rowIconFrame} testID={`${testID}-frame`}>
      <WorkerReviewsGlyph name={icon} testID={testID} />
    </View>
  )
}

function ReviewsSummaryIconFrame({ icon, testID }: { icon: WorkerReviewsIconName; testID: string }) {
  return (
    <View style={styles.summaryIconFrame}>
      <WorkerReviewsGlyph name={icon} testID={testID} />
    </View>
  )
}

function ReliabilityIconFrame({ icon, testID }: { icon: WorkerReliabilityIconName; testID: string }) {
  return (
    <View style={styles.rowIconFrame} testID={`${testID}-frame`}>
      <ReliabilityGlyph name={icon} testID={testID} />
    </View>
  )
}

function ReliabilitySummaryIconFrame({ icon, testID }: { icon: WorkerReliabilityIconName; testID: string }) {
  return (
    <View style={styles.summaryIconFrame}>
      <ReliabilityGlyph name={icon} testID={testID} />
    </View>
  )
}

function ProgressBar({ score, testID }: { score: number | null; testID: string }) {
  return (
    <View style={styles.progressTrack} testID={testID}>
      <View style={[styles.progressFill, { width: `${score == null ? 0 : Math.max(0, Math.min(100, score))}%` }]} />
    </View>
  )
}

function Divider() {
  return <View style={styles.divider} />
}

function numericOrNull(value: number | null | undefined) {
  return workerV5HasNumber(value) ? workerV5NumericInsight(value) : null
}

function pendingOrValue(value: number | null, language: AppLanguage, formatter?: (item: number) => string) {
  return value == null
    ? textByLanguage(language, 'Chờ', 'Pending')
    : formatter
      ? formatter(value)
      : `${value}`
}

export function WorkerV5RankingSection({
  insights,
  language,
  profile,
}: {
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  profile: WorkerV5Profile
}) {
  const score = numericOrNull(insights?.performance_score)
  const completed = numericOrNull(insights?.completed_job_count ?? profile?.total_jobs)
  const reviewCount = numericOrNull(insights?.review_count)
  const onTime = numericOrNull(insights?.on_time_rate_percent)
  const axisOrder = ['arrival', 'completion', 'rating', 'work_response', 'incident_handling'] as const
  const scoreByAxis = new Map(insights?.performance_axes.map((axis) => [axis.id, axis.score] as const) ?? [])
  const name = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')

  return (
    <View style={styles.sectionStack} testID="worker-v5-ranking-sections">
      <View style={styles.summaryCard} testID="worker-v5-ranking-hero">
        <View style={styles.summaryRow}>
          <SummaryIconFrame icon="medal" testID="worker-v5-ranking-score-orb" />
          <View style={styles.summaryCopy}>
            <RNText style={styles.summaryEyebrow}>{textByLanguage(language, 'Xếp hạng thợ', 'Worker ranking')}</RNText>
            <RNText style={styles.summaryTitle} numberOfLines={2} testID="worker-v5-ranking-title">
              {score == null ? textByLanguage(language, 'Chưa có điểm xếp hạng', 'No ranking score yet') : textByLanguage(language, `${score}/100 điểm xếp hạng`, `${score}/100 ranking points`)}
            </RNText>
            <Text numberOfLines={2} testID="worker-v5-ranking-name">
              {name} · {completed == null ? textByLanguage(language, 'chờ việc hoàn tất', 'completed jobs pending') : textByLanguage(language, `${completed} việc hoàn tất`, `${completed} completed jobs`)}
            </Text>
          </View>
          <RNText style={styles.summaryValue} numberOfLines={1} testID="worker-v5-ranking-score">
            {score == null ? textByLanguage(language, 'Chờ', 'Pending') : `${score}`}
          </RNText>
        </View>
        <ProgressBar score={score} testID="worker-v5-ranking-progress" />
      </View>

      <SectionHeading title={textByLanguage(language, 'Tóm tắt hiệu suất', 'Performance summary')} action={textByLanguage(language, 'Dữ liệu thật', 'Real data')} />
      <View style={[styles.listCard, styles.compactMetricList]} testID="worker-v5-ranking-stat-strip">
        <CompactMetric label={textByLanguage(language, 'Việc hoàn tất', 'Completed')} testID="worker-v5-ranking-stat-value-0" value={pendingOrValue(completed, language)} />
        <CompactMetric border label={textByLanguage(language, 'Đánh giá', 'Reviews')} testID="worker-v5-ranking-stat-value-1" value={pendingOrValue(reviewCount, language)} />
        <CompactMetric border label={textByLanguage(language, 'Đúng hẹn', 'On time')} testID="worker-v5-ranking-stat-value-2" value={pendingOrValue(onTime, language, (item) => `${item}%`)} />
      </View>

      <SectionHeading title={textByLanguage(language, 'Hồ sơ xếp hạng', 'Ranking profile')} />
      <View style={styles.listCard} testID="worker-v5-ranking-leaderboard">
        <DetailRow
          icon="worker"
          meta={completed == null
            ? textByLanguage(language, 'Chờ dữ liệu việc hoàn tất thật', 'Waiting for real completed-job data')
            : textByLanguage(language, `${completed} việc hoàn tất · nguồn Supabase`, `${completed} completed jobs · Supabase source`)}
          status={score == null ? textByLanguage(language, 'Chờ', 'Pending') : `${score}`}
          metaTestID="worker-v5-ranking-leaderboard-meta"
          statusTestID="worker-v5-ranking-leaderboard-status"
          testID="worker-v5-ranking-leaderboard-row"
          titleTestID="worker-v5-ranking-leaderboard-title"
          title={name}
          detail={
            <>
              <RNText style={styles.inlineDetailText}>{completed == null ? textByLanguage(language, 'Việc chờ đồng bộ', 'Jobs pending') : textByLanguage(language, `${completed} việc`, `${completed} jobs`)}</RNText>
              <RNText style={styles.inlineDetailText}>·</RNText>
              <RNText style={styles.inlineDetailText}>{score == null ? textByLanguage(language, 'Điểm chờ', 'Score pending') : `${score}/100`}</RNText>
              <RNText style={styles.inlineDetailText}>·</RNText>
              <RNText style={styles.inlineDetailText}>{textByLanguage(language, 'Nguồn thật', 'Real source')}</RNText>
            </>
          }
          detailTestID="worker-v5-ranking-leaderboard-detail"
        />
      </View>

      <SectionHeading title={textByLanguage(language, 'Điều giúp bạn thăng hạng', 'Ranking improvements')} action={textByLanguage(language, 'Có thể theo dõi', 'Trackable')} />
      <View style={styles.listCard} testID="worker-v5-ranking-improvement-list">
        {axisOrder.map((axisId, index) => {
          const axisScore = numericOrNull(scoreByAxis.get(axisId))
          return (
            <View key={axisId}>
              <DetailRow
                icon={rankingAxisIcon(axisId)}
                meta={rankingAxisMeta(axisId, axisScore, insights, language)}
                status={rankingAxisStatus(axisId, axisScore, insights, language)}
                metaTestID={`worker-v5-ranking-improvement-meta-${index}`}
                statusTestID={`worker-v5-ranking-improvement-status-${index}`}
                testID={`worker-v5-ranking-improvement-${index}`}
                title={workerPerformanceAxisLabel(axisId, language)}
                titleTestID={`worker-v5-ranking-improvement-title-${index}`}
                progress={axisScore}
                detailTestID={`worker-v5-ranking-improvement-detail-${index}`}
              />
              {index < axisOrder.length - 1 ? <Divider /> : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function WorkerV5ReliabilitySection({
  insights,
  language,
  profile,
}: {
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  profile: WorkerV5Profile
}) {
  const score = numericOrNull(insights?.performance_score)
  const axes = workerV5ReliabilityAxes(insights)
  return (
    <View style={styles.sectionStack} testID="worker-v5-reliability-sections">
      <View style={styles.summaryCard} testID="worker-v5-reliability-hero">
        <View style={styles.summaryRow}>
          <ReliabilitySummaryIconFrame icon="stability" testID="worker-v5-reliability-score-orb" />
          <View style={styles.summaryCopy}>
            <RNText style={styles.summaryEyebrow}>{textByLanguage(language, 'Độ tin cậy', 'Reliability')}</RNText>
            <RNText style={styles.summaryTitle} numberOfLines={2}>
              {score == null ? textByLanguage(language, 'Chưa có dữ liệu', 'No data yet') : `${score}/100`}
            </RNText>
            <Text numberOfLines={2}>{profile?.legal_name?.trim() || textByLanguage(language, 'Dữ liệu sẽ hiện khi có công việc thật', 'Data appears after real work is recorded')}</Text>
          </View>
          <RNText style={styles.summaryValue} numberOfLines={1} testID="worker-v5-reliability-score">
            {score == null ? textByLanguage(language, 'Chờ', 'Pending') : `${score}`}
          </RNText>
        </View>
        <ProgressBar score={score} testID="worker-v5-reliability-progress" />
      </View>

      <SectionHeading title={textByLanguage(language, 'Tóm tắt chỉ số', 'Metric summary')} />
      <View style={[styles.listCard, styles.compactMetricList]} testID="worker-v5-reliability-stat-grid">
        <CompactMetric label={textByLanguage(language, 'Hoàn tất', 'Completion')} testID="worker-v5-reliability-stat-completion-value" value={workerV5ReliabilityPercentValue(workerV5ReliabilityAxisScore(insights, 'completion'), language)} />
        <CompactMetric border label={textByLanguage(language, 'Đúng hẹn', 'On time')} testID="worker-v5-reliability-stat-arrival-value" value={workerV5ReliabilityPercentValue(insights?.on_time_rate_percent, language)} />
        <CompactMetric border label={textByLanguage(language, 'Đánh giá', 'Rating')} testID="worker-v5-reliability-stat-rating-value" value={workerV5ReliabilityRatingValue(insights?.average_rating ?? profile?.rating, language)} />
      </View>

      <SectionHeading title={textByLanguage(language, 'Thành phần độ tin cậy', 'Reliability components')} action={textByLanguage(language, 'Nguồn thật', 'Real source')} />
      <View style={styles.listCard} testID="worker-v5-reliability-components">
        {axes.map((axis, index) => (
          <View key={axis.id}>
            <DetailRow
              reliabilityIcon={reliabilityAxisIcon(axis.id)}
              meta={workerV5ReliabilityAxisMeta(axis, language)}
              status={axis.hasData ? `${axis.score}/100` : textByLanguage(language, 'Chờ', 'Pending')}
              metaTestID={`worker-v5-reliability-axis-meta-${index}`}
              statusTestID={`worker-v5-reliability-axis-score-${index}`}
              testID={`worker-v5-reliability-axis-${index}`}
              title={workerV5ReliabilityAxisTitle(axis.id, language)}
              titleTestID={`worker-v5-reliability-axis-title-${index}`}
              progress={axis.hasData ? axis.score : null}
              detailTestID={`worker-v5-reliability-axis-detail-${index}`}
            />
            {index < axes.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>
    </View>
  )
}

export function WorkerV5ReviewsSection({
  insights,
  language,
  profile,
}: {
  insights: WorkerV5ReviewsInsights
  language: AppLanguage
  profile: WorkerV5Profile
}) {
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasRating = workerV5HasNumber(rating) && rating > 0
  const reviewCount = workerV5HasNumber(insights?.review_count) ? insights.review_count : null
  const axes = insights?.performance_axes.filter((axis) => workerV5HasNumber(axis.score)).slice(0, 3) ?? []
  const signals = axes.length
    ? axes.map((axis) => ({ label: workerPerformanceAxisLabel(axis.id, language), value: `${workerV5NumericInsight(axis.score)}/100` }))
    : [
      { label: textByLanguage(language, 'Đánh giá', 'Rating'), value: formatNullableRating(rating, language) },
      { label: textByLanguage(language, 'Phản hồi', 'Response'), value: formatNullablePercent(insights?.response_rate_percent, language) },
      { label: textByLanguage(language, 'Đúng hẹn', 'On time'), value: formatNullablePercent(insights?.on_time_rate_percent, language) },
    ]
  const weakest = axes.reduce<typeof axes[number] | null>((current, axis) => !current || (axis.score ?? Infinity) < (current.score ?? Infinity) ? axis : current, null)

  return (
    <View style={styles.sectionStack} testID="worker-v5-reviews-sections">
      <View style={[styles.summaryCard, styles.reviewsSummaryCard]} testID="worker-v5-reviews-hero">
        <View style={styles.summaryRow}>
          <ReviewsSummaryIconFrame icon="pulse" testID="worker-v5-reviews-rating-orb" />
          <View style={styles.summaryCopy}>
            <RNText style={styles.summaryEyebrow}>{textByLanguage(language, 'Đánh giá & phản hồi', 'Reviews & feedback')}</RNText>
            <RNText style={styles.summaryTitle} numberOfLines={2} testID="worker-v5-reviews-title">
              {hasRating ? textByLanguage(language, 'Tín hiệu chất lượng thật', 'Real quality signal') : textByLanguage(language, 'Chờ phản hồi thật', 'Waiting for real feedback')}
            </RNText>
            <Text numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị dữ liệu đánh giá đã đồng bộ.', 'Only synced review data is shown.')}</Text>
          </View>
          {hasRating ? (
            <RNText style={styles.summaryValue} numberOfLines={1} testID="worker-v5-reviews-rating">
              {rating?.toFixed(rating % 1 === 0 ? 0 : 1)}
            </RNText>
          ) : null}
        </View>
        {reviewCount != null && reviewCount > 0 ? (
          <RNText style={styles.summaryEyebrow} numberOfLines={2} testID="worker-v5-reviews-count">
            {textByLanguage(language, `${reviewCount} phản hồi`, `${reviewCount} reviews`)}
          </RNText>
        ) : null}
      </View>

      <SectionHeading title={textByLanguage(language, 'Tín hiệu đã ghi nhận', 'Recorded signals')} action={textByLanguage(language, 'Không có lời trích dẫn', 'No quotes')} />
      <View style={styles.listCard} testID="worker-v5-review-signal-grid">
        {signals.map((signal, index) => (
          <View key={signal.label}>
            <CompactRow label={signal.label} value={signal.value} />
            {index < signals.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>

      <SectionHeading title={textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback')} />
      <View style={styles.listCard} testID="worker-v5-recent-feedback-list">
        <DetailRow
          reviewsIcon="feedback"
          meta={reviewCount == null
            ? textByLanguage(language, 'Chưa có dữ liệu đánh giá thật để hiển thị', 'No real review data is available yet')
            : reviewCount > 0
              ? textByLanguage(language, 'Có số lượt đánh giá nhưng chưa đồng bộ nội dung chi tiết', 'Review count exists but detailed content is not synced')
              : textByLanguage(language, 'Chưa có phản hồi thật để hiển thị', 'No real feedback to show yet')}
          status={reviewCount != null && reviewCount > 0 ? `${reviewCount}` : undefined}
          metaTestID="worker-v5-feedback-meta-0"
          statusTestID="worker-v5-feedback-status-0"
          testID="worker-v5-feedback-0"
          titleTestID="worker-v5-feedback-title-0"
          title={textByLanguage(language, 'Tổng hợp phản hồi', 'Feedback summary')}
        />
      </View>

      <View style={styles.noteCard} testID="worker-v5-review-improvement-plan">
        <RNText style={styles.noteTitle}>{textByLanguage(language, 'Gợi ý cải thiện', 'Improvement signal')}</RNText>
        <RNText style={styles.noteBody}>
          {weakest
            ? textByLanguage(language, `Kael có thể giải thích thêm về ${workerPerformanceAxisLabel(weakest.id, language).toLowerCase()} (${workerV5NumericInsight(weakest.score)}/100).`, `Kael can explain ${workerPerformanceAxisLabel(weakest.id, language).toLowerCase()} (${workerV5NumericInsight(weakest.score)}/100).`)
            : textByLanguage(language, 'Cần thêm dữ liệu đánh giá thật trước khi tạo gợi ý.', 'More real review data is needed before creating a suggestion.')}
        </RNText>
      </View>
    </View>
  )
}

export function WorkerV5VerificationSection({
  language,
  profile,
}: {
  language: AppLanguage
  profile: WorkerV5Profile
}) {
  const checks = workerV5VerificationChecks(profile, language)
  const missingCount = checks.filter((check) => !check.done).length
  const completed = checks.length - missingCount
  return (
    <View style={styles.sectionStack} testID="worker-v5-verification-sections">
      <View style={styles.summaryCard} testID="worker-v5-verification-hero">
        <View style={styles.summaryRow}>
          <SummaryIconFrame icon="shield" testID="worker-v5-verification-hero-icon" />
          <View style={styles.summaryCopy}>
            <RNText style={styles.summaryEyebrow}>{textByLanguage(language, 'Giấy tờ & xác minh', 'Documents & verification')}</RNText>
            <RNText style={styles.summaryTitle} numberOfLines={2} testID="worker-v5-verification-title">
              {completed === checks.length ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work') : textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')}
            </RNText>
            <Text numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị giấy tờ, dịch vụ và trạng thái xét duyệt có trong hồ sơ.', 'Only recorded documents, services, and review status are shown.')}</Text>
          </View>
          <RNText style={styles.summaryValue} numberOfLines={1} testID="worker-v5-verification-count">{completed}/{checks.length}</RNText>
        </View>
        <ProgressBar score={checks.length ? (completed / checks.length) * 100 : 0} testID="worker-v5-verification-progress" />
      </View>

      <SectionHeading title={textByLanguage(language, 'Hồ sơ bắt buộc', 'Required profile')} action={missingCount ? textByLanguage(language, `${missingCount} mục thiếu`, `${missingCount} missing`) : textByLanguage(language, 'Không thiếu mục', 'No missing item')} />
      <View style={styles.listCard} testID="worker-v5-verification-checklist">
        {checks.map((check, index) => (
          <View key={check.title}>
            <DetailRow
              icon={verificationIcon(check.icon)}
              meta={check.meta}
              status={check.done ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Wait')}
              statusMuted={!check.done}
              metaTestID={`worker-v5-verification-row-meta-${index}`}
              statusTestID={`worker-v5-verification-row-status-${index}`}
              testID={`worker-v5-verification-row-${index}`}
              title={check.title}
              titleTestID={`worker-v5-verification-row-title-${index}`}
            />
            {index < checks.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </View>

      <SectionHeading title={textByLanguage(language, 'Nhắc gia hạn', 'Renewal reminder')} action={textByLanguage(language, 'Chưa khả dụng', 'Unavailable')} />
      <View style={styles.noteCard} testID="worker-v5-verification-renewal-card">
        <RNText style={styles.noteTitle}>{textByLanguage(language, 'Chưa có nguồn ngày hết hạn', 'No expiry source yet')}</RNText>
        <RNText style={styles.noteBody}>{textByLanguage(language, 'Hệ thống chưa thể theo dõi nhắc gia hạn giấy tờ từ hồ sơ hiện tại.', 'The current profile has no document-expiry source for renewal tracking.')}</RNText>
      </View>
    </View>
  )
}

function CompactMetric({ border, label, testID, value }: { border?: boolean; label: string; testID: string; value: string }) {
  return (
    <View style={[styles.compactMetric, border ? styles.compactMetricBorder : null]}>
      <RNText style={styles.compactMetricValue} numberOfLines={1} testID={testID}>{value}</RNText>
      <RNText style={styles.compactMetricLabel} numberOfLines={2}>{label}</RNText>
    </View>
  )
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.rowCopy}>
        <RNText style={styles.rowTitle}>{label}</RNText>
      </View>
      <RNText style={[styles.rowStatus, value === 'Chưa có dữ liệu' ? styles.rowStatusMuted : null]} numberOfLines={2}>{value}</RNText>
    </View>
  )
}

function DetailRow({
  detail,
  detailTestID,
  icon,
  reliabilityIcon,
  reviewsIcon,
  meta,
  metaTestID,
  progress,
  status,
  statusTestID,
  statusMuted,
  testID,
  title,
  titleTestID,
}: {
  detail?: ReactNode
  detailTestID?: string
  icon?: WorkerProfileSectionIconName
  meta: string
  metaTestID?: string
  progress?: number | null
  reliabilityIcon?: WorkerReliabilityIconName
  reviewsIcon?: WorkerReviewsIconName
  status?: string
  statusTestID?: string
  statusMuted?: boolean
  testID: string
  title: string
  titleTestID?: string
}) {
  return (
    <View style={[styles.listRow, progress !== undefined ? styles.listRowTall : null]} testID={testID}>
      {reviewsIcon ? <ReviewsIconFrame icon={reviewsIcon} testID={`${testID}-icon`} /> : reliabilityIcon ? <ReliabilityIconFrame icon={reliabilityIcon} testID={`${testID}-icon`} /> : icon ? <IconFrame icon={icon} testID={`${testID}-icon`} /> : null}
      <View style={styles.rowCopy}>
        <RNText style={styles.rowTitle} numberOfLines={2} testID={titleTestID ?? `${testID}-title`}>{title}</RNText>
        <RNText style={styles.rowMeta} numberOfLines={2} testID={metaTestID ?? `${testID}-meta`}>{meta}</RNText>
        {progress !== undefined ? (
          <View style={styles.rowDetail} testID={detailTestID}>
            <ProgressBar score={progress} testID={`${testID}-progress`} />
          </View>
        ) : detail ? (
          <View style={styles.inlineDetail} testID={detailTestID}>{detail}</View>
        ) : null}
      </View>
      {status ? <RNText style={[styles.rowStatus, statusMuted ? styles.rowStatusMuted : null]} numberOfLines={2} testID={statusTestID ?? `${testID}-status`}>{status}</RNText> : null}
    </View>
  )
}

function rankingAxisIcon(axisId: string): WorkerProfileSectionIconName {
  switch (axisId) {
    case 'arrival':
      return 'calendar'
    case 'completion':
      return 'document'
    case 'rating':
      return 'badge'
    case 'work_response':
      return 'chat'
    case 'incident_handling':
      return 'shield'
    default:
      return 'check'
  }
}

function reliabilityAxisIcon(axisId: string): WorkerReliabilityIconName {
  switch (axisId) {
    case 'arrival':
      return 'cadence'
    case 'completion':
      return 'proof'
    case 'rating':
      return 'quality'
    default:
      return 'stability'
  }
}

function verificationIcon(icon: WorkerV5IconName): WorkerProfileSectionIconName {
  switch (icon) {
    case 'document':
      return 'document'
    case 'profile':
      return 'worker'
    case 'tools':
      return 'tools'
    case 'shield':
      return 'shield'
    default:
      return 'check'
  }
}

function rankingAxisMeta(axisId: string, score: number | null, insights: WorkerV5ReviewsInsights, language: AppLanguage) {
  if (axisId === 'work_response') {
    const reviewCount = insights?.work_response_review_count ?? 0
    return reviewCount > 0
      ? textByLanguage(language, `Kael tổng hợp từ ${reviewCount} đánh giá của khách`, `Kael aggregates ${reviewCount} customer reviews`)
      : textByLanguage(language, 'Chờ khách đánh giá sau khi công việc hoàn tất', 'Waiting for customer feedback after completion')
  }
  if (axisId === 'incident_handling') {
    const incidentCount = insights?.resolved_incident_case_count ?? 0
    return incidentCount > 0
      ? textByLanguage(language, `${Math.min(4, incidentCount)}/4 ca đã được chốt`, `${Math.min(4, incidentCount)}/4 cases closed`)
      : textByLanguage(language, 'Mỗi phát sinh chỉ tính khi Kael và khách đã chốt', 'Each incident counts only after Kael and customer close it')
  }
  return score == null
    ? textByLanguage(language, 'Chờ dữ liệu hiệu suất thật', 'Waiting for real performance data')
    : textByLanguage(language, `${score}/100 từ dữ liệu hiệu suất thật`, `${score}/100 from real performance data`)
}

function rankingAxisStatus(axisId: string, score: number | null, insights: WorkerV5ReviewsInsights, language: AppLanguage) {
  if (axisId === 'incident_handling') {
    const bonus = insights?.incident_rank_bonus ?? 0
    return bonus > 0 ? textByLanguage(language, `+${bonus} điểm`, `+${bonus} points`) : textByLanguage(language, '+5/ca', '+5/case')
  }
  return score == null ? textByLanguage(language, 'Chờ', 'Waiting') : `+${Math.max(0, 100 - score)}`
}
