import { Pressable, Text as RNText, View, useWindowDimensions, type StyleProp, type TextProps, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import type { LocalDeal } from '@nestscout/shared'

import { component, spacing, type AppleTypographyRole } from '@/design/theme'
import { stageLayout, stageTypography } from './stage-ratio'
import type { WorkerV5ScreenId } from '../dock/types'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5ArrivalDestinationLabel,
  workerV5EtaLensValue,
  workerV5LiveDistanceSignal,
  workerV5LiveEtaSignal,
} from '../ui/route'
import { textByLanguage } from '../ui/format'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import {
  getReducedTransparencyWorkerTokens,
  getWorkerThemeTokens,
  useWorkerThemeMode,
} from '../worker-theme'
import { WorkerV5AuthenticatedRouteMapPreview } from './route-map-surfaces'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import type { WorkerJobsLegacyPrototypeRuntime } from './worker-jobs-zip-prototype-shared'
import { StageFourGradientFill, StageFourIcon, type StageFourIconName } from './worker-jobs-zip-prototype-stage-four-icons'
import { createStageFourStyles, getStageFourPalette } from './worker-jobs-zip-prototype-stage-four-styles'

type StageFourTokens = ReturnType<typeof getWorkerThemeTokens>

export type StageFourProps = {
  actionBusy: boolean
  language: 'vi' | 'en'
  navigateActiveJobChat: () => void
  navigateJobChat: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  prototypeMode: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runtime: WorkerJobsLegacyPrototypeRuntime
}

export function WorkerJobsProductionStageFour({
  actionBusy,
  language,
  navigateActiveJobChat,
  navigateToScreen,
  prototypeMode,
  reduceMotion,
  reduceTransparency,
  routePreview,
  runRouteAction,
  runtime,
}: StageFourProps) {
  const { width } = useWindowDimensions()
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const scale = Math.max(0.68, Math.min(1, width / 446))
  const styles = createStageFourStyles(scale, tokens)
  const palette = getStageFourPalette(tokens)
  const deal = runtime.state.deal
  const hasRouteDestination = routePreview.hasRouteDestination
  const destinationLabel = hasRouteDestination && deal
    ? workerV5ArrivalDestinationLabel(deal, language)
    : textByLanguage(language, 'Chưa mở điểm đến', 'Destination not released')
  const destinationDetail = hasRouteDestination && deal
    ? destinationDetailLine(deal, destinationLabel)
    : textByLanguage(language, 'Thông tin được bảo vệ cho đến khi backend cấp quyền.', 'Details remain protected until the backend releases them.')
  // The floating chip exists only for a released destination with a real area name; it never shows placeholder copy.
  const chipHeadline = hasRouteDestination && deal
    ? deal.broadcast?.generalArea?.trim() || deal.draft.districtLabel?.trim() || null
    : null
  const chipNote = [deal?.broadcast?.addressAccess?.access_profile.building_note, deal?.draft.districtLabel]
    .map((value) => value?.trim() ?? '')
    .find((value) => value.length > 0 && value !== chipHeadline)
    ?? textByLanguage(language, 'Điểm đến đã được mở', 'Destination released')
  const etaSignal = routePreview.route
    ? workerV5LiveEtaSignal(routePreview.route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = routePreview.route
    ? workerV5LiveDistanceSignal(routePreview.route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const etaValue = etaDisplayValue(etaSignal, routePreview.route?.durationSeconds ?? null, language)
  const distanceValue = distanceSignal.hasSignal ? distanceSignal.label : UNKNOWN_METRIC
  // No runtime source reports road conditions yet, so the metric states that honestly.
  const trafficValue = textByLanguage(language, 'Chưa có dữ liệu', 'No data yet')
  const appointment = deal
    ? workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
    : textByLanguage(language, 'Chưa có lịch hẹn', 'No appointment')
  const customerNote = accessNote(deal, language)
  // Stage 4 has two steps; until the job reaches `worker_matched` the first step is shown disabled.
  const primaryMode = deal?.status === 'worker_on_way' ? 'arrival' : 'start'
  const primaryReady = deal?.status === 'worker_matched' || deal?.status === 'worker_on_way'
  const primaryLabel = primaryMode === 'arrival'
    ? textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')
    : textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
  const primaryDisabled = !primaryReady || actionBusy
  const canChat = Boolean(deal?.broadcast?.jobId ?? deal?.id)
  const openDetails = deal ? () => navigateToScreen('2.2-offer-detail') : undefined
  const openChat = canChat ? navigateActiveJobChat : undefined

  return (
    <View
      style={[
        styles.screen,
        { marginHorizontal: prototypeMode ? -20 : -stageLayout.gutter, marginTop: prototypeMode ? -20 : -spacing.screenVerticalPadding },
      ]}
      testID="worker-v5-route-eta-handoff"
    >
      <View style={styles.hero} testID="stage4-map-hero">
        <StageFourRouteMap
          deal={deal}
          destinationLabel={destinationLabel}
          language={language}
          routePreview={routePreview}
          scale={scale}
          styles={styles}
          tokens={tokens}
          windowWidth={width}
        />

        {chipHeadline ? (
          <StageFourButton
            accessibilityLabel={textByLanguage(language, 'Xem điểm đến', 'View destination')}
            label={textByLanguage(language, 'Xem điểm đến', 'View destination')}
            onPress={openDetails}
            reduceMotion={reduceMotion}
            style={styles.chip}
            testID="stage4-destination-chip"
            tokens={tokens}
          >
            <View style={styles.chipIcon}>
              <StageFourIcon color={tokens.primary} name="home" size={23 * scale} />
            </View>
            <View style={styles.chipCopy}>
              <Copy numberOfLines={1} textRole="subheadline" tokens={tokens} weight="700" windowWidth={width}>{chipHeadline}</Copy>
              <Copy numberOfLines={1} color={tokens.muted} textRole="caption1" tokens={tokens} windowWidth={width}>{chipNote}</Copy>
            </View>
            <StageFourIcon color={tokens.text} name="chevron" size={17 * scale} />
          </StageFourButton>
        ) : null}

        {routePreview.mapUri ? (
          <View style={styles.mapControlColumn} testID="stage4-map-controls">
            <StageFourButton
              accessibilityLabel={textByLanguage(language, 'Mở chỉ đường', 'Open directions')}
              disabled
              label={textByLanguage(language, 'Mở chỉ đường', 'Open directions')}
              reduceMotion={reduceMotion}
              style={styles.mapControl}
              testID="stage4-map-directions"
              tokens={tokens}
            >
              <StageFourIcon color={tokens.text} name="send" size={21 * scale} />
            </StageFourButton>
            <StageFourButton
              accessibilityLabel={textByLanguage(language, 'Lớp bản đồ', 'Map layers')}
              disabled
              label={textByLanguage(language, 'Lớp bản đồ', 'Map layers')}
              reduceMotion={reduceMotion}
              style={styles.mapControl}
              testID="stage4-map-layers"
              tokens={tokens}
            >
              <StageFourIcon color={tokens.text} name="layers" size={21 * scale} />
            </StageFourButton>
            <StageFourButton
              accessibilityLabel={textByLanguage(language, 'Về vị trí hiện tại', 'Center on current location')}
              disabled
              label={textByLanguage(language, 'Về vị trí hiện tại', 'Center on current location')}
              reduceMotion={reduceMotion}
              style={styles.mapControl}
              testID="stage4-map-locate"
              tokens={tokens}
            >
              <StageFourIcon color={tokens.text} name="locate" size={21 * scale} />
            </StageFourButton>
          </View>
        ) : null}

        <View style={styles.etaSheet} testID="stage4-eta-sheet">
          <View style={styles.etaSheetRow}>
            <StageFourIcon color={tokens.primary} name="car" size={24 * scale} />
            <View style={{ flex: 1, minWidth: 0 }}>
              {etaValue ? (
                <Copy textRole="body" tokens={tokens} weight="700" windowWidth={width}>
                  {textByLanguage(language, 'Bạn sẽ đến trong ', 'Arrival in ')}
                  <Copy color={tokens.primary} textRole="body" tokens={tokens} weight="700" windowWidth={width}>{etaValue}</Copy>
                </Copy>
              ) : (
                <Copy textRole="body" tokens={tokens} weight="700" windowWidth={width}>
                  {textByLanguage(language, 'Thời gian đến đang cập nhật', 'Arrival time is updating')}
                </Copy>
              )}
              <Copy color={tokens.muted} textRole="caption1" tokens={tokens} windowWidth={width}>
                {primaryMode === 'arrival'
                  ? textByLanguage(language, 'Đang di chuyển đến địa điểm khách hàng', 'Travelling to the customer destination')
                  : textByLanguage(language, 'Sẵn sàng đến địa điểm khách hàng', 'Ready to travel to the customer destination')}
              </Copy>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.contentStack}>
        <View style={[styles.card, styles.cardContent, styles.destinationCard]} testID="stage4-destination-card">
          <View style={styles.destinationMain}>
            <View style={styles.sectionTitleRow}>
              <StageFourIconDisc name="pin" primary scale={scale} size={32} tokens={tokens} />
              <Copy textRole="footnote" style={styles.sectionTitle} tokens={tokens} weight="600" windowWidth={width}>{textByLanguage(language, 'Điểm đến', 'Destination')}</Copy>
            </View>
            <View style={styles.destinationCopy}>
              <Copy numberOfLines={2} textRole="subheadline" tokens={tokens} weight="700" windowWidth={width}>{destinationLabel}</Copy>
              {destinationDetail ? (
                <Copy numberOfLines={2} color={tokens.muted} textRole="caption1" style={{ marginTop: 2 * scale }} tokens={tokens} windowWidth={width}>
                  {destinationDetail}
                </Copy>
              ) : null}
            </View>
          </View>
          <View style={styles.destinationArt} testID="stage4-destination-art">
            <StageFourIcon color={palette.placeholderInk} name="image" size={26 * scale} />
            <Copy color={palette.placeholderInk} textRole="caption1" tokens={tokens} weight="500" windowWidth={width}>{textByLanguage(language, 'Chưa có ảnh', 'No photo')}</Copy>
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(64 * scale), paddingHorizontal: Math.round(7 * scale), paddingVertical: Math.round(5 * scale) }]} testID="stage4-metrics">
          <View style={styles.metricStack}>
            <StageFourMetric icon="route" label={textByLanguage(language, 'Khoảng cách', 'Distance')} scale={scale} tokens={tokens} value={distanceValue} windowWidth={width} />
            <View style={styles.verticalDivider} />
            <StageFourMetric icon="clock" label={textByLanguage(language, 'Thời gian đến', 'Arrival time')} scale={scale} tokens={tokens} value={etaValue ?? UNKNOWN_METRIC} windowWidth={width} />
            <View style={styles.verticalDivider} />
            <StageFourMetric compact icon="traffic" label={textByLanguage(language, 'Tình trạng đường', 'Road status')} scale={scale} tokens={tokens} value={trafficValue} windowWidth={width} />
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(88 * scale) }]} testID="stage4-customer-card">
          <View style={styles.sectionTitleRow}>
            <StageFourIconDisc name="person" primary scale={scale} size={32} tokens={tokens} />
            <Copy textRole="footnote" style={styles.sectionTitle} tokens={tokens} weight="600" windowWidth={width}>{textByLanguage(language, 'Thông tin khách hàng', 'Customer information')}</Copy>
            <View style={styles.customerActions}>
              <StageFourSmallAction
                disabled
                icon="phone"
                label={textByLanguage(language, 'Gọi', 'Call')}
                reduceMotion={reduceMotion}
                scale={scale}
                testID="stage4-call"
                tokens={tokens}
                windowWidth={width}
              />
              <StageFourSmallAction
                disabled={!openChat}
                icon="chat"
                label={textByLanguage(language, 'Nhắn tin', 'Message')}
                onPress={openChat}
                reduceMotion={reduceMotion}
                scale={scale}
                testID="stage4-chat"
                tokens={tokens}
                windowWidth={width}
              />
            </View>
          </View>
          <View style={styles.customerBody}>
            <View style={styles.customerInitial}>
              <StageFourIcon color={tokens.primary} name="person" size={21 * scale} />
            </View>
            <View style={styles.customerCopy}>
              <Copy numberOfLines={1} textRole="subheadline" tokens={tokens} weight="700" windowWidth={width}>{textByLanguage(language, 'Khách hàng', 'Customer')}</Copy>
              <Copy color={tokens.muted} textRole="caption1" tokens={tokens} windowWidth={width}>{textByLanguage(language, 'Lịch hẹn: ', 'Appointment: ')}{appointment}</Copy>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, styles.noteCard]} testID="stage4-customer-note">
          <View style={styles.sectionTitleRow}>
            <StageFourIconDisc name="note" primary scale={scale} size={32} tokens={tokens} />
            <Copy textRole="footnote" tokens={tokens} weight="600" windowWidth={width}>{textByLanguage(language, 'Ghi chú từ khách hàng', 'Customer note')}</Copy>
          </View>
          <View style={styles.noteSurface}>
            <StageFourIcon color={tokens.primary} name="building" size={18.5 * scale} />
            <Copy color={tokens.text} textRole="caption1" style={{ flex: 1 }} tokens={tokens} windowWidth={width}>{customerNote}</Copy>
          </View>
        </View>

        <View style={styles.smallActionRow} testID="stage4-utility-actions">
          <StageFourUtilityAction
            disabled
            icon="send"
            label={textByLanguage(language, 'Mở chỉ đường', 'Directions')}
            reduceMotion={reduceMotion}
            scale={scale}
            testID="stage4-directions"
            tokens={tokens}
            windowWidth={width}
          />
          <StageFourUtilityAction
            disabled
            icon="share"
            label={textByLanguage(language, 'Chia sẻ vị trí', 'Share location')}
            reduceMotion={reduceMotion}
            scale={scale}
            testID="stage4-share"
            tokens={tokens}
            windowWidth={width}
          />
        </View>

        {runtime.state.lastError?.trim() ? (
          <Copy color={tokens.danger} textRole="caption1" style={styles.error} testID="stage4-error" tokens={tokens} windowWidth={width}>
            {runtime.state.lastError.trim()}
          </Copy>
        ) : null}

        <StageFourPrimaryButton
          busy={actionBusy}
          disabled={primaryDisabled}
          label={primaryLabel}
          onPress={() => void runRouteAction()}
          processingLabel={textByLanguage(language, 'Đang xử lý…', 'Processing…')}
          reduceMotion={reduceMotion}
          scale={scale}
          subtitle={primaryMode === 'arrival'
            ? textByLanguage(language, 'Tôi đã có mặt tại điểm đến', 'I have arrived at the destination')
            : textByLanguage(language, 'Tôi đã sẵn sàng, bắt đầu đến khách hàng', 'I am ready to travel to the customer')}
          testID="stage4-primary"
          tokens={tokens}
          windowWidth={width}
        />
        <View style={{ height: Math.round(10 * scale) }} />
      </View>
    </View>
  )
}

function StageFourRouteMap({
  deal,
  destinationLabel,
  language,
  routePreview,
  scale,
  styles,
  tokens,
  windowWidth,
}: {
  deal: LocalDeal | null
  destinationLabel: string
  language: 'vi' | 'en'
  routePreview: WorkerV5RoutePreviewState
  scale: number
  styles: ReturnType<typeof createStageFourStyles>
  tokens: StageFourTokens
  windowWidth: number
}) {
  if (routePreview.mapUri) {
    return (
      <View style={styles.mapCanvas} testID="stage4-real-route-map">
        <View style={styles.mapImage}>
          <WorkerV5AuthenticatedRouteMapPreview label={destinationLabel} language={language} uri={routePreview.mapUri} />
        </View>
      </View>
    )
  }

  const title = !routePreview.hasRouteDestination
    ? textByLanguage(language, 'Địa chỉ chưa được mở', 'Destination not released')
    : routePreview.locationStatus === 'loading'
      ? textByLanguage(language, 'Đang tải lộ trình', 'Loading route')
      : routePreview.locationStatus === 'denied'
        ? textByLanguage(language, 'Cần quyền vị trí', 'Location permission required')
        : textByLanguage(language, 'Chưa có lộ trình thật', 'Live route unavailable')
  const detail = !deal || !routePreview.hasRouteDestination
    ? textByLanguage(language, 'Bản đồ và thời gian chỉ hiển thị khi backend đã cấp điểm đến hợp lệ.', 'The map and ETA appear after the backend releases a valid destination.')
    : textByLanguage(language, 'Không thể tính tuyến đường từ vị trí hiện tại.', 'A route cannot be calculated from the current location.')

  return (
    <View style={[styles.mapCanvas, styles.emptyMap, { gap: Math.round(8 * scale) }]} testID="stage4-route-map-empty">
      <StageFourIconDisc name="pin" scale={scale} size={48} tokens={tokens} />
      <Copy textRole="body" tokens={tokens} weight="700" windowWidth={windowWidth}>{title}</Copy>
      <Copy color={tokens.muted} textRole="caption1" style={{ maxWidth: 292 * scale, textAlign: 'center' }} tokens={tokens} windowWidth={windowWidth}>{detail}</Copy>
    </View>
  )
}

function StageFourMetric({
  compact = false,
  icon,
  label,
  scale,
  tokens,
  value,
  windowWidth,
}: {
  compact?: boolean
  icon: StageFourIconName
  label: string
  scale: number
  tokens: StageFourTokens
  value: string
  windowWidth: number
}) {
  const styles = createStageFourStyles(scale, tokens)
  return (
    <View style={styles.metric}>
      <StageFourIcon color={tokens.primary} name={icon} size={20 * scale} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy color={compact ? tokens.primary : tokens.text} numberOfLines={compact ? 2 : 1} textRole={compact ? 'caption1' : 'subheadline'} tokens={tokens} weight="700" windowWidth={windowWidth}>{value}</Copy>
        <Copy color={tokens.muted} textRole="caption2" tokens={tokens} windowWidth={windowWidth}>{label}</Copy>
      </View>
    </View>
  )
}

function StageFourSmallAction({
  disabled = false,
  icon,
  label,
  onPress,
  reduceMotion,
  scale,
  testID,
  tokens,
  windowWidth,
}: {
  disabled?: boolean
  icon: 'chat' | 'phone'
  label: string
  onPress?: () => void
  reduceMotion: boolean
  scale: number
  testID: string
  tokens: StageFourTokens
  windowWidth: number
}) {
  const styles = createStageFourStyles(scale, tokens)
  return (
    <StageFourButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      reduceMotion={reduceMotion}
      style={styles.workAction}
      testID={testID}
      tokens={tokens}
    >
      <StageFourIcon color={tokens.primary} name={icon} size={19 * scale} />
      <Copy textRole="caption1" tokens={tokens} weight="500" windowWidth={windowWidth}>{label}</Copy>
    </StageFourButton>
  )
}

function StageFourUtilityAction({
  disabled = false,
  icon,
  label,
  onPress,
  reduceMotion,
  scale,
  testID,
  tokens,
  windowWidth,
}: {
  disabled?: boolean
  icon: 'send' | 'share'
  label: string
  onPress?: () => void
  reduceMotion: boolean
  scale: number
  testID: string
  tokens: StageFourTokens
  windowWidth: number
}) {
  const styles = createStageFourStyles(scale, tokens)
  return (
    <StageFourButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      reduceMotion={reduceMotion}
      style={styles.smallAction}
      testID={testID}
      tokens={tokens}
    >
      <StageFourIcon color={tokens.primary} name={icon} size={19 * scale} />
      <Copy numberOfLines={2} textRole="caption1" style={{ textAlign: 'center' }} tokens={tokens} weight="500" windowWidth={windowWidth}>{label}</Copy>
    </StageFourButton>
  )
}

function StageFourPrimaryButton({
  busy,
  disabled,
  label,
  onPress,
  processingLabel,
  reduceMotion,
  scale,
  subtitle,
  testID,
  tokens,
  windowWidth,
}: {
  busy: boolean
  disabled: boolean
  label: string
  onPress: () => void
  processingLabel: string
  reduceMotion: boolean
  scale: number
  subtitle: string
  testID: string
  tokens: StageFourTokens
  windowWidth: number
}) {
  const styles = createStageFourStyles(scale, tokens)
  const palette = getStageFourPalette(tokens)
  const displayLabel = busy ? processingLabel : label
  return (
    <Pressable
      accessibilityLabel={displayLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, { opacity: disabled ? 0.42 : pressed && !reduceMotion ? 0.76 : 1, transform: [{ scale: pressed && !disabled && !reduceMotion ? 0.98 : 1 }] }]}
      testID={testID}
    >
      <StageFourGradientFill testID="stage4-primary-gradient" />
      <View style={styles.primaryRow}>
        <View style={styles.primaryCopy}>
          <Copy color={component.button.primary.text} numberOfLines={1} textRole="body" tokens={tokens} weight="700" windowWidth={windowWidth}>{displayLabel}</Copy>
          <Copy color={palette.ctaSubtitle} numberOfLines={2} textRole="caption1" style={{ marginTop: -1 * scale }} tokens={tokens} windowWidth={windowWidth}>{subtitle}</Copy>
        </View>
      </View>
    </Pressable>
  )
}

function StageFourButton({
  accessibilityLabel,
  children,
  disabled = false,
  label,
  onPress,
  reduceMotion,
  style,
  testID,
  tokens,
}: {
  accessibilityLabel?: string
  children: ReactNode
  disabled?: boolean
  label: string
  onPress?: () => void
  reduceMotion: boolean
  style: StyleProp<ViewStyle>
  testID: string
  tokens: StageFourTokens
}) {
  const isDisabled = disabled || !onPress
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', opacity: isDisabled ? 0.44 : pressed && !reduceMotion ? 0.76 : 1, transform: [{ scale: pressed && !reduceMotion ? 0.98 : 1 }] }, style]}
      testID={testID}
    >
      {children}
    </Pressable>
  )
}

function StageFourIconDisc({
  name,
  primary = false,
  scale,
  size,
  tokens,
}: {
  name: StageFourIconName
  primary?: boolean
  scale: number
  size: number
  tokens: StageFourTokens
}) {
  const styles = createStageFourStyles(scale, tokens)
  return (
    <View style={[primary ? { backgroundColor: tokens.primary } : styles.actionIcon, { alignItems: 'center', borderRadius: size * scale / 2, height: size * scale, justifyContent: 'center', overflow: 'hidden', width: size * scale }]}>
      {primary ? <StageFourGradientFill /> : null}
      {/* A positioned wrapper keeps the glyph above the absolute gradient on web, where static SVGs paint underneath it. */}
      <View>
        <StageFourIcon color={primary ? component.button.primary.text : tokens.primary} name={name} size={(size > 44 ? 30 : 23) * scale} />
      </View>
    </View>
  )
}

function Copy({
  children,
  color,
  textRole,
  style,
  tokens,
  weight = '400',
  windowWidth,
  ...props
}: TextProps & {
  color?: string
  textRole: AppleTypographyRole
  tokens: StageFourTokens
  weight?: '400' | '500' | '600' | '700'
  windowWidth: number
}) {
  return <RNText {...props} style={[stageTypography(textRole, windowWidth), { color: color ?? tokens.text, fontWeight: weight, position: 'relative', zIndex: 1 }, style]}>{children}</RNText>
}

const UNKNOWN_METRIC = '—'

// The card title already carries the released address, so the second line only adds an area it does not repeat.
function destinationDetailLine(deal: LocalDeal, title: string) {
  const normalizedTitle = title.trim().toLocaleLowerCase('vi')
  return [deal.broadcast?.generalArea, deal.draft.districtLabel]
    .map((value) => value?.trim() ?? '')
    .find((value) => value.length > 0 && !normalizedTitle.includes(value.toLocaleLowerCase('vi'))) ?? null
}

function etaDisplayValue(
  signal: ReturnType<typeof workerV5LiveEtaSignal> | ReturnType<typeof buildWorkerV5AcceptEtaSignal>,
  durationSeconds: number | null,
  language: 'vi' | 'en',
) {
  const minutes = durationSeconds != null && Number.isFinite(durationSeconds)
    ? Math.max(1, Math.ceil(durationSeconds / 60))
    : signal.hasSignal
      ? workerV5EtaLensValue(signal.label)
      : null
  if (minutes == null) return null
  return textByLanguage(language, `${minutes} phút`, `${minutes} min`)
}

function accessNote(deal: LocalDeal | null, language: 'vi' | 'en') {
  const profile = deal?.broadcast?.addressAccess?.access_profile
  const note = [profile?.entry_method, profile?.guard_note, profile?.building_note, profile?.customer_handoff_note, profile?.parking_note]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 2)
    .join(' ')
  return note || textByLanguage(language, 'Khách chưa để lại hướng dẫn.', 'No customer guidance was provided.')
}
