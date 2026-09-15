import { useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'

import { STAGE_REFERENCE_SCALE, stageFontSize, stageLineHeight, stageTapSize } from '../stage-ratio'
import { stageTenAssets } from './stage-ten-assets'
import { date10, fitStageTenValueSize, money10, text10 } from './stage-ten-model'
import { StageTenGradient, StageTenIcon, type StageTenIconName } from './stage-ten-icons'
import { stageTenTokens } from './stage-ten-tokens'
import type { StageTenActions, StageTenContentProps } from './stage-ten.types'

const MAX_GEOMETRY_SCALE = 1.2
const METRIC_VALUE_MIN_CANVAS_SIZE = 13

type FontSizeFor = (canvasSize: number) => number
type LineHeightFor = (canvasSize: number, ratio: number) => number

export function StageTenContent({
  actions,
  language = 'vi',
  model,
  photoSource,
  reduceTransparency = false,
}: StageTenContentProps) {
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
  const ft: FontSizeFor = (value) => stageFontSize(value, STAGE_REFERENCE_SCALE.stageTen, windowWidth)
  const lh: LineHeightFor = (value, ratio) => stageLineHeight(ft(value), ratio)
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
      <View style={[card, styles.hero, { minHeight: s(156), paddingBottom: s(15), paddingHorizontal: s(14), paddingTop: s(13) }]} testID="worker-v5-stage-ten-hero">
        {!reduceTransparency ? <StageTenGradient from="#F3FAFA" id="stage10-hero-gradient" to="#F0FAF8" /> : null}
        <View style={{ height: s(50), position: 'relative' }}>
          {completed ? (
            <Image
              contentFit="contain"
              source={stageTenAssets.medallion}
              style={{ height: s(51), left: s(-2), position: 'absolute', top: s(-1), width: s(91) }}
              testID="stage10-success-art"
            />
          ) : (
            <View style={{ alignItems: 'center', backgroundColor: stageTenTokens.mintSoft, borderRadius: s(19), height: s(38), justifyContent: 'center', marginTop: s(5), width: s(38) }}>
              <StageTenIcon color="#79AAA5" name="info" size={s(24)} />
            </View>
          )}
          {completed ? (
            <Image
              contentFit="contain"
              source={stageTenAssets.lettering}
              style={{ height: s(33), position: 'absolute', right: s(1), top: s(5), width: s(77) }}
            />
          ) : null}
        </View>
        <Text accessibilityRole="header" style={[styles.heroTitle, { fontSize: ft(25.6), letterSpacing: -0.7, lineHeight: lh(25.6, 1.21), marginBottom: s(7) }]}>{title}</Text>
        <Text style={[styles.bodyCopy, { fontSize: ft(12), lineHeight: lh(12, 1.46), paddingRight: completed ? s(96) : 0 }]}>{subtitle}</Text>
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
        <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: ft(15), lineHeight: lh(15, 1.27) }]}>{tx('Thông tin công việc', 'Job information')}</Text>
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
              <StageTenIcon color="#8BA3AB" name="photo" size={s(25)} />
              <Text style={{ color: stageTenTokens.text, fontSize: ft(10) }}>{tx('Chưa có ảnh', 'No photo')}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: s(8), paddingTop: s(2) }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: width < 330 ? 'wrap' : 'nowrap', gap: s(5), justifyContent: 'space-between' }}>
              <Text selectable style={[styles.jobTitle, { flexShrink: 1, fontSize: ft(14.6), lineHeight: lh(14.6, 1.23) }]}>{model.job.title}</Text>
              <View style={{ alignItems: 'center', backgroundColor: completed ? stageTenTokens.pill : stageTenTokens.note, borderRadius: s(20), flexDirection: 'row', gap: s(4), paddingHorizontal: s(8), paddingVertical: s(7) }}>
                {completed ? (
                  <View style={{ alignItems: 'center', backgroundColor: '#169C83', borderRadius: s(8), height: s(15), justifyContent: 'center', width: s(15) }}>
                    <StageTenIcon color="white" name="check" size={s(12)} />
                  </View>
                ) : null}
                <Text style={{ color: completed ? stageTenTokens.mint : stageTenTokens.text, fontSize: ft(9.6), fontWeight: '600' }}>{completed ? tx('Đã hoàn tất', 'Completed') : tx('Chưa hoàn tất', 'Not complete')}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: s(7) }}>
              <StageTenIcon color="#74889A" name="pin" size={s(14)} />
              <Text selectable style={[styles.bodyCopy, { flex: 1, fontSize: ft(11), lineHeight: lh(11, 1.36) }]}>{model.job.district ?? tx('Chưa có khu vực', 'Area unavailable')}</Text>
            </View>
            <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: s(7) }}>
              <StageTenIcon color="#74889A" name="calendar" size={s(14)} />
              <Text selectable style={[styles.bodyCopy, { flex: 1, fontSize: ft(11), lineHeight: lh(11, 1.45) }]}>{model.job.completedAt ? `${tx('Hoàn thành lúc', 'Completed at')} ${dates.time}\n${dates.date}` : dates.time}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[card, { gap: s(9), marginTop: s(2), padding: s(7), paddingTop: s(13) }]} testID="worker-v5-stage-ten-summary-card">
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: s(11), paddingHorizontal: s(7) }} testID="worker-v5-stage-ten-summary-list">
          <StageTenIcon color="#26AB93" name="chart" size={s(25)} />
          <View style={{ gap: s(3) }}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { fontSize: ft(15.5), lineHeight: lh(15.5, 1.23) }]}>{tx('Tóm tắt', 'Summary')}</Text>
            <Text style={[styles.bodyCopy, { fontSize: ft(11), lineHeight: lh(11, 1.27) }]}>{tx('Kết quả công việc của bạn', 'Your job results')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: s(6) }} testID="stage10-metric-grid">
          <MetricTile flex={1.07} ft={ft} icon="wallet" lh={lh} scale={scale} title={tx('Thu nhập', 'Earnings')}>
            <MetricValue fontScale={fontScale} ft={ft} lh={lh} marginTop={s(5)} missing={model.income.amount === null} preferred={21.5} testID="stage10-income" text={money10(model.income.amount, language)} />
            <Text style={[styles.metricMeta, { fontSize: ft(9), lineHeight: lh(9, 1.44), marginTop: s(10) }]}>{model.income.amount !== null ? tx('Đã ghi nhận', 'Recorded') : model.income.state === 'held' ? tx('Đang tạm giữ', 'On hold') : model.income.state === 'reversed' ? tx('Đã điều chỉnh', 'Reversed') : model.income.state === 'missing' ? tx('Chưa ghi nhận', 'Not recorded') : tx('Đang cập nhật', 'Updating')}</Text>
          </MetricTile>
          <MetricTile flex={1} ft={ft} gold icon="star" lh={lh} scale={scale} title={tx('Đánh giá trung bình', 'Average rating')}>
            <MetricValue fontScale={fontScale} ft={ft} lh={lh} marginTop={s(3)} missing={model.rating.value === null} preferred={19} testID="stage10-rating" text={model.rating.value !== null ? model.rating.value.toFixed(1) : tx('Chưa ghi nhận', 'Not recorded')} />
            <View style={{ flexDirection: 'row', gap: s(2), justifyContent: 'center', marginTop: s(2) }}>
              {Array.from({ length: 5 }, (_, index) => (
                <StageTenIcon filled key={index} color={model.rating.value !== null && index < Math.round(model.rating.value) ? stageTenTokens.gold : '#DEE7E9'} name="star" size={s(11)} />
              ))}
            </View>
            <Text style={[styles.metricMeta, { fontSize: ft(8.7), lineHeight: lh(8.7, 1.38), marginTop: s(5) }]}>{model.rating.value !== null && model.rating.reviewCount > 0 ? `${model.rating.reviewCount} ${tx('lượt đánh giá', 'reviews')}` : tx('Chưa có đánh giá', 'No reviews yet')}</Text>
          </MetricTile>
          <MetricTile flex={0.97} ft={ft} gold icon="trophy" lh={lh} scale={scale} title={tx('Điểm hiệu suất', 'Performance score')}>
            <MetricValue fontScale={fontScale} ft={ft} lh={lh} marginTop={s(5)} missing={model.ranking.performanceScore === null} preferred={19} testID="stage10-ranking" text={model.ranking.performanceScore !== null ? String(model.ranking.performanceScore) : tx('Chưa ghi nhận', 'Not recorded')} />
            <Text style={[styles.metricMeta, { fontSize: ft(9), lineHeight: lh(9, 1.44), marginTop: s(10) }]}>{model.ranking.performanceScore !== null ? tx('Theo hệ thống', 'System record') : tx('Chưa có dữ liệu', 'Not available')}</Text>
          </MetricTile>
        </View>
        <View style={{ alignItems: 'flex-start', backgroundColor: stageTenTokens.note, borderRadius: s(9), flexDirection: 'row', gap: s(7), minHeight: s(46), padding: s(9) }} testID="stage10-data-note">
          <StageTenIcon color="#8BAEB4" name="info" size={s(15)} />
          <Text style={[styles.bodyCopy, { flex: 1, fontSize: ft(9.4), lineHeight: lh(9.4, 1.49) }]}>{info}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(1) }}>
        <StageTenActionButton
          accessibilityLabel={tx('Xem điểm hạng', 'View ranking')}
          disabled={!actions.onRanking}
          fontSize={ft(14.7)}
          label={tx('Xem điểm hạng', 'View ranking')}
          onPress={actions.onRanking}
          scale={scale}
          testID="worker-v5-case-closed-ranking-action"
        />
        <StageTenActionButton
          accessibilityLabel={tx('Mở thu nhập', 'Open earnings')}
          fontSize={ft(14.7)}
          label={tx('Mở thu nhập', 'Open earnings')}
          onPress={actions.onEarnings}
          primary
          scale={scale}
          testID="worker-v5-case-closed-earnings-action"
        />
      </View>
    </View>
  )
}

function StageTenActionButton({ accessibilityLabel, disabled = false, fontSize, label, onPress, primary = false, scale, testID }: {
  accessibilityLabel: string
  disabled?: boolean
  fontSize: number
  label: string
  onPress?: StageTenActions['onEarnings']
  primary?: boolean
  scale: number
  testID: string
}) {
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
          borderColor: primary ? 'transparent' : '#25BFB3',
          borderRadius: stageTenTokens.buttonRadius * scale,
          borderWidth: primary ? 0 : 1,
          backgroundColor: primary ? stageTenTokens.mint : stageTenTokens.page,
          minHeight: stageTapSize(46, scale),
          overflow: primary ? 'hidden' : 'visible',
          opacity: pressed ? (primary ? 0.8 : 0.75) : disabled ? 0.52 : 1,
        },
      ]}
      testID={testID}
    >
      {primary ? <StageTenGradient from="#26D4C4" id="stage10-button-gradient" to="#008776" /> : null}
      <Text style={{ color: primary ? 'white' : '#008C80', fontSize, fontWeight: '600', position: 'relative', textAlign: 'center', zIndex: 1 }}>{label}</Text>
    </Pressable>
  )
}

function MetricTile({ children, flex, ft, gold = false, icon, lh, scale, title }: {
  children: ReactNode
  flex: number
  ft: FontSizeFor
  gold?: boolean
  icon: StageTenIconName
  lh: LineHeightFor
  scale: number
  title: string
}) {
  const titleLineHeight = lh(9.4, 1.38)

  return (
    <View style={{ alignItems: 'center', backgroundColor: stageTenTokens.tile, borderColor: '#E5EEF1', borderRadius: 9 * scale, borderWidth: 1, flex, minHeight: 125 * scale, paddingBottom: 8 * scale, paddingHorizontal: 4 * scale, paddingTop: 8 * scale }}>
      <StageTenIcon color={gold ? stageTenTokens.gold : '#25AA98'} filled name={icon} size={22 * scale} />
      {/* Two title lines stay reserved, so a label that wraps in one tile cannot push its value below the neighbouring tiles. */}
      <Text style={{ color: stageTenTokens.text, fontSize: ft(9.4), fontWeight: '600', lineHeight: titleLineHeight, marginTop: 5 * scale, minHeight: titleLineHeight * 2, textAlign: 'center' }}>{title}</Text>
      {children}
    </View>
  )
}

function MetricValue({ fontScale, ft, lh, marginTop, missing, preferred, testID, text }: {
  fontScale: number
  ft: FontSizeFor
  lh: LineHeightFor
  marginTop: number
  missing: boolean
  preferred: number
  testID: string
  text: string
}) {
  const [available, setAvailable] = useState(0)

  if (missing) {
    return (
      <Text selectable style={[styles.metricValue, { fontSize: ft(METRIC_VALUE_MIN_CANVAS_SIZE), fontWeight: '600', lineHeight: lh(METRIC_VALUE_MIN_CANVAS_SIZE, 1.3), marginTop }]} testID={testID}>{text}</Text>
    )
  }

  const fontSize = fitStageTenValueSize(text, available, ft(preferred), ft(METRIC_VALUE_MIN_CANVAS_SIZE), fontScale)

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width
        if (next > 0 && Math.abs(next - available) > 0.5) setAvailable(next)
      }}
      style={styles.metricValueFrame}
      testID={`${testID}-frame`}
    >
      <Text selectable style={[styles.metricValue, { fontSize, letterSpacing: fontSize * -0.028, lineHeight: stageLineHeight(fontSize, 1.25), marginTop }]} testID={testID}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  bodyCopy: {
    color: stageTenTokens.text,
    position: 'relative',
    zIndex: 1,
  },
  card: {
    backgroundColor: stageTenTokens.page,
    borderColor: stageTenTokens.border,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: stageTenTokens.hero,
    position: 'relative',
  },
  heroTitle: {
    color: stageTenTokens.ink,
    fontWeight: '700',
    position: 'relative',
    zIndex: 1,
  },
  jobTitle: {
    color: '#0B2030',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metricMeta: {
    color: stageTenTokens.text,
    textAlign: 'center',
  },
  metricPill: {
    alignItems: 'center',
    backgroundColor: stageTenTokens.pill,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  metricValue: {
    color: stageTenTokens.ink,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  metricValueFrame: {
    alignSelf: 'stretch',
  },
  root: {
    alignSelf: 'center',
    backgroundColor: stageTenTokens.page,
    maxWidth: stageTenTokens.referenceContentWidth * MAX_GEOMETRY_SCALE,
    width: '100%',
  },
  sectionTitle: {
    color: stageTenTokens.ink,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
})
