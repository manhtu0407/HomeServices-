import { Text as RNText, View, type TextProps } from 'react-native'
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { type AppLanguage } from '@/lib/app-language'
import { WorkerV5EarningsHomeHeroAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5HasNumber, workerV5NumericInsight } from '../ui/performance'
import { styles } from '../worker-v5-flow-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import Animated from 'react-native-reanimated'
import { type ViewStyle } from 'react-native'
import { motionTokens } from '@/components/ui/motion-tokens'
import { styles as reliabilityStyles } from './reliability-styles'
import { useEffect } from 'react'
import { withDelay, withSpring } from 'react-native-reanimated'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ReliabilityHero({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasScore = workerV5HasNumber(insights?.performance_score)
  const score = workerV5NumericInsight(insights?.performance_score)
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reliability-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-reliability-mint-aura" /> : null}
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reliability-score">
          {hasScore ? score : textByLanguage(language, 'Chờ', 'Pending')}
        </Text>
        <Text style={styles.completionLensLabel} numberOfLines={2}>{textByLanguage(language, 'điểm tin cậy', 'trust score')}</Text>
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-reliability-status">{hasScore ? textByLanguage(language, 'Có thể giải thích', 'Explainable') : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-reliability-title">{hasScore ? textByLanguage(language, 'Đáng tin cậy và ổn định', 'Reliable and stable') : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{hasScore ? textByLanguage(language, 'Tính từ dữ liệu hiệu suất đã đồng bộ.', 'Calculated from synced performance data.') : textByLanguage(language, 'Số sẽ cập nhật khi có hiệu suất thật.', 'The score updates when real performance exists.')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5ReliabilityAxisFill({
  hasData,
  index,
  reduceMotion,
  score,
}: {
  hasData: boolean
  index: number
  reduceMotion: boolean
  score: number
}) {
  const target = hasData ? Math.max(0, Math.min(100, score)) : 0
  const progress = useSharedValue(reduceMotion ? target : 0)
  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%` as ViewStyle['width'],
  }))

  useEffect(() => {
    // The fill follows score props and must also react to background data refreshes.
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!hasData || reduceMotion) {
      progress.value = target
      return
    }
    progress.value = 0
    progress.value = withDelay(70 + index * 45, withSpring(target, motionTokens.liquid.entrance))
  }, [hasData, index, progress, reduceMotion, target])

  return (
    <Animated.View
      style={[reliabilityStyles.reliabilityAxisFill, animatedFillStyle]}
      testID={`worker-v5-reliability-axis-fill-${index}`}
    />
  )
}

