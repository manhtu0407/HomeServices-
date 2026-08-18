import { type ComponentType } from 'react'
import { Text as RNText, View, type TextProps , type ViewStyle } from 'react-native'
import { type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { workerV5HasNumber, workerV5NumericInsight } from '../ui/performance'
import { styles as rankingStyles } from './ranking-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { WorkerV5ProfileFormulaCard } from './worker-profile-formula-surfaces'
import { styles as formulaStyles } from './worker-profile-formula-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[rankingStyles.workerCustomerFontText, style]} />
}

export function WorkerV5RankingHero({
  heroAura: _heroAura,
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  heroAura: ComponentType<{ testID: string }>
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = workerV5NumericInsight(insights?.performance_score)
  const hasScore = workerV5HasNumber(insights?.performance_score)
  const completedSource = insights?.completed_job_count ?? profile?.total_jobs
  const hasCompleted = workerV5HasNumber(completedSource)
  const completed = workerV5NumericInsight(completedSource)
  const progressWidth = `${Math.max(0, Math.min(100, score))}%` as ViewStyle['width']
  const scoreLabel = hasScore ? `${score}` : textByLanguage(language, 'Chờ', 'Pending')
  const completedLabel = hasCompleted
    ? textByLanguage(language, `${completed} việc hoàn tất`, `${completed} completed jobs`)
    : textByLanguage(language, 'Chờ dữ liệu việc hoàn tất', 'Completed-job data pending')
  return (
    <WorkerV5ProfileFormulaCard
      auraTestID="worker-v5-ranking-mint-aura"
      contentStyle={formulaStyles.heroContent}
      reduceTransparency={reduceTransparency}
      scope="WorkerRankingHero"
      testID="worker-v5-ranking-hero"
    >
      <View style={rankingStyles.rankingHeroRow}>
        <View style={rankingStyles.rankingScoreOrb} testID="worker-v5-ranking-score-orb">
          <WorkerV5FormulaMintCardAura
            reduceTransparency={reduceTransparency}
            scope="WorkerRankingScoreOrb"
            style={rankingStyles.rankingScoreOrbAura}
            testID="worker-v5-ranking-score-orb-mint-aura"
          />
          <Text style={rankingStyles.rankingScoreOrbValue} numberOfLines={1} testID="worker-v5-ranking-score">{scoreLabel}</Text>
          <Text style={rankingStyles.rankingScoreOrbLabel} numberOfLines={2} testID="worker-v5-ranking-score-label">{textByLanguage(language, 'điểm hạng', 'rank points')}</Text>
        </View>
        <View style={rankingStyles.earningsHeroCopy}>
          <Text style={rankingStyles.earningsHeroPill} numberOfLines={2} testID="worker-v5-ranking-status">
            {hasScore ? textByLanguage(language, 'Dữ liệu thật', 'Real data') : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')}
          </Text>
          <Text style={rankingStyles.rankingHeroTitle} numberOfLines={2} testID="worker-v5-ranking-title">
            {hasScore
              ? textByLanguage(language, `${score}/100 điểm xếp hạng`, `${score}/100 ranking points`)
              : textByLanguage(language, 'Chưa có điểm xếp hạng', 'No ranking score yet')}
          </Text>
          <Text style={rankingStyles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-ranking-name">
            {profile?.legal_name || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')} · {completedLabel}
          </Text>
          <View style={rankingStyles.rankingProgressTrack} testID="worker-v5-ranking-progress">
            <View style={[rankingStyles.rankingProgressFill, { width: progressWidth }]} />
          </View>
        </View>
      </View>
    </WorkerV5ProfileFormulaCard>
  )
}

