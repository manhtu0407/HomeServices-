import { useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'

import { PrimaryCtaFill } from '@/components/ui/primary-cta-fill'
import { component, typography } from '@/design/theme'
import { stageTapSize, stageTypography } from '../stage-ratio'
import { stageTenAssets } from './stage-ten-assets'
import { date10, fitStageTenValueSize, money10, text10 } from './stage-ten-model'
import { StageTenGradient, StageTenIcon, type StageTenIconName } from './stage-ten-icons'
import { stageTenTokens as stageTenTokensLight } from './stage-ten-tokens'
import type { StageTenActions, StageTenContentProps } from './stage-ten.types'
import { useWorkerColor, useWorkerThemedStyles, useWorkerThemedTokens } from '../../ui/worker-dark-styles'

const MAX_GEOMETRY_SCALE = 1.2
/** The metric-value fit-to-width algorithm below title3 has no fixed canonical size to spread —
 *  it lands anywhere in [footnote, title3] — so its tracking/leading scale proportionally from
 *  title3's own ratios instead of a bespoke constant. */
const METRIC_VALUE_TRACKING_RATIO = typography.title3.letterSpacing / typography.title3.fontSize
const METRIC_VALUE_LINE_HEIGHT_RATIO = typography.title3.lineHeight / typography.title3.fontSize

export function StageTenContent({
  actions,
  language = 'vi',
  model,
  photoSource,
  reduceTransparency = false,
}: StageTenContentProps) {
  const tc = useWorkerColor()
  const stageTenTokens = useWorkerThemedTokens(stageTenTokensLight)
  const styles = useWorkerThemedStyles(stylesLight)
  const { fontScale, width: windowWidth } = useWindowDimensions()
  const [width, setWidth] = useState<number>(stageTenTokens.referenceContentWidth)
  const [failedPhotoKey, setFailedPhotoKey] = useState<string | null>(null)
  const photoKey = typeof photoSource === 'number'
    ? String(photoSource)
    : Array.isArray(photoSource)
      ? photoSource.map((source) => source.uri ?? '').join('|')
      : photoSource?.uri ?? 'none'
  const failedPhoto = photoKey !== 'none' && failedPhotoKey === photoKey
  // Geometry follows the measured card width; type resolves against the window through
  // stage-ratio.ts, so a narrow host keeps captions at the house minimum instead of shrinking them.
  const scale = Math.min(MAX_GEOMETRY_SCALE, width / stageTenTokens.referenceContentWidth)
  const s = (value: number) => value * scale
  const completed = model.state === 'closed'
  const dates = date10(model.job.completedAt, language)
  const tx = (vi: string, en: string) => text10(language, vi, en)

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    if (nextWidth > 0 && Math.abs(nextWidth - width) > 0.5) setWidth(nextWidth)
  }

  const title = completed
    ? tx('Hoàn thiện công việc', 'Job completed')
    : model.state === 'missing'
      ? tx('Chưa có công việc hoàn tất', 'No completed job')
      : model.state === 'awaiting-confirmation'
        ? tx('Chờ khách xác nhận', 'Awaiting confirmation')
        : tx('Công việc chưa hoàn tất', 'Job in progress')
  const subtitle = completed
    ? tx('Công việc đã được hoàn tất thành công.\nCảm ơn bạn đã đồng hành cùng NestScout!', 'The job has been completed.\nThank you for working with NestScout!')
    : model.state === 'missing'
      ? tx('Chỉ hiển thị kết quả khi hệ thống ghi nhận\ncông việc đã hoàn tất.', 'Results appear after the system records\na completed job.')
      : tx('Kết quả sẽ hiển thị sau khi khách xác nhận.\nKhông cần gửi lại hồ sơ hoàn tất.', 'Results appear after customer confirmation.\nNo need to resubmit your completion record.')
  const allRecorded = model.income.amount !== null
    && model.rating.value !== null
    && model.rating.reviewCount > 0
    && model.ranking.performanceScore !== null
  const info = allRecorded
    ? tx('Số liệu được lấy từ công việc, Thu nhập và chỉ số hiệu suất của bạn.', 'Data comes from this job, Earnings, and your performance insights.')
    : tx('Chỉ hiển thị dữ liệu đã được hệ thống ghi nhận.\nDữ liệu chưa có sẽ được đánh dấu rõ ràng.', 'Only recorded system data is shown.\nUnavailable data is labelled clearly.')
  const card = [styles.card, { borderRadius: s(stageTenTokens.cardRadius) }]

  return (
    <View onLayout={onLayout} style={[styles.root, { gap: s(10) }]} testID="worker-v5-stage-ten-prototype">
      <View style={[card, styles.hero, { minHeight: completed ? s(156) : undefined, paddingBottom: s(15), paddingHorizontal: s(14), paddingTop: s(completed ? 13 : 15) }]} testID="worker-v5-stage-ten-hero">
        {!reduceTransparency ? <StageTenGradient from={tc('surface', '#F3FAFA')} id="stage10-hero-gradient" to={tc('surface', '#F0FAF8')} /> : null}
        {completed ? (
          <View style={{ height: s(50), position: 'relative' }}>
            <Image
              contentFit="contain"
              source={stageTenAssets.medallion}
              style={{ height: s(51), left: s(-2), position: 'absolute', top: s(-1), width: s(91) }}
              testID="stage10-success-art"
            />
            <Image
              contentFit="contain"
              source={stageTenAssets.lettering}
              style={{ height: s(33), position: 'absolute', right: s(1), top: s(5), width: s(77) }}
            />
          </View>
        ) : null}
        <Text accessibilityRole="header" style={[stageTypography('title1', windowWidth), styles.heroTitle, { marginBottom: s(7) }]}>{title}</Text>
        <Text style={[stageTypography('caption1', windowWidth), styles.bodyCopy, { paddingRight: completed ? s(96) : 0 }]}>{subtitle}</Text>
        {completed ? (
          <Image
            contentFit="contain"
            source={stageTenAssets.workart}
            style={{ bottom: s(12), height: s(85), position: 'absolute', right: s(9), width: s(88) }}
            testID="worker-v5-stage-ten-status-workart"
          />
        ) : null}
      </View>

      <View style={[card, { gap: s(10), padding: s(14) }]} testID="stage10-job-card">
        <Text accessibilityRole="header" style={[stageTypography('subheadline', windowWidth), styles.sectionTitle]}>{tx('Thông tin công việc', 'Job information')}</Text>
        <View style={{ alignItems: 'stretch', flexDirection: 'row', gap: s(13) }}>
          {photoSource && !failedPhoto ? (
            <Image
              accessibilityLabel={tx('Ảnh công việc', 'Job photo')}
              contentFit="cover"
              onError={() => setFailedPhotoKey(photoKey)}
              source={photoSource}
              style={{ borderRadius: s(7), height: s(94), width: s(103) }}
              testID="stage10-job-photo"
            />
          ) : (
            <View style={{ alignItems: 'center', backgroundColor: stageTenTokens.tile, borderRadius: s(7), gap: s(6), justifyContent: 'center', minHeight: s(94), width: s(103) }} testID="stage10-job-photo-placeholder">
              <StageTenIcon color={tc('ink', '#8BA3AB')} name="photo" size={s(25)} />
              <Text style={{ ...stageTypography('caption2', windowWidth), color: stageTenTokens.text }}>{tx('Chưa có ảnh', 'No photo')}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: s(8), paddingTop: s(2) }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: width < 330 ? 'wrap' : 'nowrap', gap: s(5), justifyContent: 'space-between' }}>
              <Text selectable style={[stageTypography('subheadline', windowWidth), styles.jobTitle, { flexShrink: 1 }]}>{model.job.title}</Text>
              <View style={{ alignItems: 'center', backgroundColor: completed ? stageTenTokens.pill : stageTenTokens.note, borderRadius: s(20), flexDirection: 'row', gap: s(4), paddingHorizontal: s(8), paddingVertical: s(7) }}>
                {completed ? (
                  <View style={{ alignItems: 'center', backgroundColor: '#169C83', borderRadius: s(8), height: s(15), justifyContent: 'center', width: s(15) }}>
                    <StageTenIcon color="white" name="check" size={s(12)} />
                  </View>
                ) : null}
                <Text style={{ ...stageTypography('caption2', windowWidth), color: completed ? stageTenTokens.mint : stageTenTokens.text, fontWeight: '600' }}>{completed ? tx('Đã hoàn tất', 'Completed') : tx('Chưa hoàn tất', 'Not complete')}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: s(7) }}>
              <StageTenIcon color={tc('ink', '#74889A')} name="pin" size={s(14)} />
              <Text selectable style={[stageTypography('caption2', windowWidth), styles.bodyCopy, { flex: 1 }]}>{model.job.district ?? tx('Chưa có khu vực', 'Area unavailable')}</Text>
            </View>
            <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: s(7) }}>
              <StageTenIcon color={tc('ink', '#74889A')} name="calendar" size={s(14)} />
              <Text selectable style={[stageTypography('caption2', windowWidth), styles.bodyCopy, { flex: 1 }]}>{model.job.completedAt ? `${tx('Hoàn thành lúc', 'Completed at')} ${dates.time}\n${dates.date}` : dates.time}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[card, { gap: s(9), marginTop: s(2), padding: s(7), paddingTop: s(13) }]} testID="worker-v5-stage-ten-summary-card">
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: s(11), paddingHorizontal: s(7) }} testID="worker-v5-stage-ten-summary-list">
          <StageTenIcon color={tc('ink', '#26AB93')} name="chart" size={s(25)} />
          <View style={{ gap: s(3) }}>
            <Text accessibilityRole="header" style={[stageTypography('subheadline', windowWidth), styles.sectionTitle]}>{tx('Tóm tắt', 'Summary')}</Text>
            <Text style={[stageTypography('caption2', windowWidth), styles.bodyCopy]}>{tx('Kết quả công việc của bạn', 'Your job results')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: s(6) }} testID="stage10-metric-grid">
          <MetricTile flex={1.07} icon="wallet" scale={scale} title={tx('Thu nhập', 'Earnings')} windowWidth={windowWidth}>
            <MetricValue fontScale={fontScale} marginTop={s(5)} missing={model.income.amount === null} testID="stage10-income" text={money10(model.income.amount, language)} windowWidth={windowWidth} />
            <Text style={[stageTypography('caption2', windowWidth), styles.metricMeta, { marginTop: s(10) }]}>{model.income.amount !== null ? tx('Đã ghi nhận', 'Recorded') : model.income.state === 'held' ? tx('Đang tạm giữ', 'On hold') : model.income.state === 'reversed' ? tx('Đã điều chỉnh', 'Reversed') : model.income.state === 'missing' ? tx('Chưa ghi nhận', 'Not recorded') : tx('Đang cập nhật', 'Updating')}</Text>
          </MetricTile>
          <MetricTile flex={1} gold icon="star" scale={scale} title={tx('Đánh giá trung bình', 'Average rating')} windowWidth={windowWidth}>
            <MetricValue fontScale={fontScale} marginTop={s(3)} missing={model.rating.value === null} testID="stage10-rating" text={model.rating.value !== null ? model.rating.value.toFixed(1) : tx('Chưa ghi nhận', 'Not recorded')} windowWidth={windowWidth} />
            <View style={{ flexDirection: 'row', gap: s(2), justifyContent: 'center', marginTop: s(2) }}>
              {Array.from({ length: 5 }, (_, index) => (
                <StageTenIcon filled key={index} color={model.rating.value !== null && index < Math.round(model.rating.value) ? stageTenTokens.gold : tc('line', '#DEE7E9')} name="star" size={s(11)} />
              ))}
            </View>
            <Text style={[stageTypography('caption2', windowWidth), styles.metricMeta, { marginTop: s(5) }]}>{model.rating.value !== null && model.rating.reviewCount > 0 ? `${model.rating.reviewCount} ${tx('lượt đánh giá', 'reviews')}` : tx('Chưa có đánh giá', 'No reviews yet')}</Text>
          </MetricTile>
          <MetricTile flex={0.97} gold icon="trophy" scale={scale} title={tx('Điểm hiệu suất', 'Performance score')} windowWidth={windowWidth}>
            <MetricValue fontScale={fontScale} marginTop={s(5)} missing={model.ranking.performanceScore === null} testID="stage10-ranking" text={model.ranking.performanceScore !== null ? String(model.ranking.performanceScore) : tx('Chưa ghi nhận', 'Not recorded')} windowWidth={windowWidth} />
            <Text style={[stageTypography('caption2', windowWidth), styles.metricMeta, { marginTop: s(10) }]}>{model.ranking.performanceScore !== null ? tx('Theo hệ thống', 'System record') : tx('Chưa có dữ liệu', 'Not available')}</Text>
          </MetricTile>
        </View>
        <View style={{ alignItems: 'flex-start', backgroundColor: stageTenTokens.note, borderRadius: s(9), flexDirection: 'row', gap: s(7), minHeight: s(46), padding: s(9) }} testID="stage10-data-note">
          <StageTenIcon color={tc('ink', '#8BAEB4')} name="info" size={s(15)} />
          <Text style={[stageTypography('caption2', windowWidth), styles.bodyCopy, { flex: 1 }]}>{info}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(1) }}>
        <StageTenActionButton
          accessibilityLabel={tx('Xem điểm hạng', 'View ranking')}
          disabled={!actions.onRanking}
          label={tx('Xem điểm hạng', 'View ranking')}
          onPress={actions.onRanking}
          scale={scale}
          testID="worker-v5-case-closed-ranking-action"
          windowWidth={windowWidth}
        />
        <StageTenActionButton
          accessibilityLabel={tx('Mở thu nhập', 'Open earnings')}
          label={tx('Mở thu nhập', 'Open earnings')}
          onPress={actions.onEarnings}
          primary
          scale={scale}
          testID="worker-v5-case-closed-earnings-action"
          windowWidth={windowWidth}
        />
      </View>
    </View>
  )
}

function StageTenActionButton({ accessibilityLabel, disabled = false, label, onPress, primary = false, scale, testID, windowWidth }: {
  accessibilityLabel: string
  disabled?: boolean
  label: string
  onPress?: StageTenActions['onEarnings']
  primary?: boolean
  scale: number
  testID: string
  windowWidth: number
}) {
  const tc = useWorkerColor()
  const stageTenTokens = useWorkerThemedTokens(stageTenTokensLight)
  const styles = useWorkerThemedStyles(stylesLight)
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          borderColor: primary ? component.button.primary.border : tc('line', '#25BFB3'),
          borderRadius: stageTenTokens.buttonRadius * scale,
          borderWidth: 1,
          backgroundColor: primary ? stageTenTokens.mint : stageTenTokens.page,
          boxShadow: primary && !disabled ? component.button.primary.boxShadow : undefined,
          minHeight: stageTapSize(46, scale),
          overflow: primary ? 'hidden' : 'visible',
          opacity: pressed ? (primary ? 0.8 : 0.75) : disabled ? 0.52 : 1,
        },
      ]}
      testID={testID}
    >
      {primary ? <PrimaryCtaFill radius={0} /> : null}
      <Text style={{ ...stageTypography('subheadline', windowWidth), color: primary ? 'white' : tc('ink', '#008C80'), fontWeight: '600', position: 'relative', textAlign: 'center', zIndex: 1 }}>{label}</Text>
    </Pressable>
  )
}

function MetricTile({ children, flex, gold = false, icon, scale, title, windowWidth }: {
  children: ReactNode
  flex: number
  gold?: boolean
  icon: StageTenIconName
  scale: number
  title: string
  windowWidth: number
}) {
  const tc = useWorkerColor()
  const stageTenTokens = useWorkerThemedTokens(stageTenTokensLight)
  const titleTypography = stageTypography('caption2', windowWidth)
  const titleLineHeight = titleTypography.lineHeight as number

  return (
    <View style={{ alignItems: 'center', backgroundColor: stageTenTokens.tile, borderColor: tc('line', '#E5EEF1'), borderRadius: 9 * scale, borderWidth: 1, flex, minHeight: 125 * scale, paddingBottom: 8 * scale, paddingHorizontal: 4 * scale, paddingTop: 8 * scale }}>
      <StageTenIcon color={gold ? stageTenTokens.gold : tc('ink', '#25AA98')} filled name={icon} size={22 * scale} />
      {/* Two title lines stay reserved, so a label that wraps in one tile cannot push its value below the neighbouring tiles. */}
      <Text style={{ ...titleTypography, color: stageTenTokens.text, fontWeight: '600', marginTop: 5 * scale, minHeight: titleLineHeight * 2, textAlign: 'center' }}>{title}</Text>
      {children}
    </View>
  )
}

function MetricValue({ fontScale, marginTop, missing, testID, text, windowWidth }: {
  fontScale: number
  marginTop: number
  missing: boolean
  testID: string
  text: string
  windowWidth: number
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const [available, setAvailable] = useState(0)

  if (missing) {
    return (
      <Text selectable style={[stageTypography('footnote', windowWidth), styles.metricValue, { fontWeight: '600', marginTop }]} testID={testID}>{text}</Text>
    )
  }

  const preferred = stageTypography('title3', windowWidth).fontSize as number
  const floor = stageTypography('footnote', windowWidth).fontSize as number
  const fontSize = fitStageTenValueSize(text, available, preferred, floor, fontScale)

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width
        if (next > 0 && Math.abs(next - available) > 0.5) setAvailable(next)
      }}
      style={styles.metricValueFrame}
      testID={`${testID}-frame`}
    >
      <Text selectable style={[styles.metricValue, { fontSize, letterSpacing: fontSize * METRIC_VALUE_TRACKING_RATIO, lineHeight: Math.round(fontSize * METRIC_VALUE_LINE_HEIGHT_RATIO * 10) / 10, marginTop }]} testID={testID}>{text}</Text>
    </View>
  )
}

const stylesLight = StyleSheet.create({
  action: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  bodyCopy: {
    color: stageTenTokensLight.text,
    position: 'relative',
    zIndex: 1,
  },
  card: {
    backgroundColor: stageTenTokensLight.page,
    borderColor: stageTenTokensLight.border,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: stageTenTokensLight.hero,
    position: 'relative',
  },
  heroTitle: {
    color: stageTenTokensLight.ink,
    fontWeight: '700',
    position: 'relative',
    zIndex: 1,
  },
  jobTitle: {
    color: '#0B2030',
    fontWeight: '700',
  },
  metricMeta: {
    color: stageTenTokensLight.text,
    textAlign: 'center',
  },
  metricPill: {
    alignItems: 'center',
    backgroundColor: stageTenTokensLight.pill,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  metricValue: {
    color: stageTenTokensLight.ink,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  metricValueFrame: {
    alignSelf: 'stretch',
  },
  root: {
    alignSelf: 'center',
    backgroundColor: stageTenTokensLight.page,
    maxWidth: stageTenTokensLight.referenceContentWidth * MAX_GEOMETRY_SCALE,
    width: '100%',
  },
  sectionTitle: {
    color: stageTenTokensLight.ink,
    fontWeight: '700',
  },
})
