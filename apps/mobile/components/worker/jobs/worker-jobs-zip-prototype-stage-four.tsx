import { Pressable, Text as RNText, View, useWindowDimensions, type StyleProp, type TextProps, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { LocalDeal } from '@nestscout/shared'

import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
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
import { createStageFourStyles } from './worker-jobs-zip-prototype-stage-four-styles'

type StageFourIconName =
  | 'back'
  | 'building'
  | 'car'
  | 'chat'
  | 'chevron'
  | 'clock'
  | 'down'
  | 'headset'
  | 'layers'
  | 'locate'
  | 'note'
  | 'person'
  | 'phone'
  | 'pin'
  | 'route'
  | 'send'
  | 'share'
  | 'traffic'
  | 'triple'

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
  navigateJobChat,
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
  const deal = runtime.state.deal
  const hasRouteDestination = routePreview.hasRouteDestination
  const destinationLabel = hasRouteDestination && deal
    ? workerV5ArrivalDestinationLabel(deal, language)
    : textByLanguage(language, 'Chưa mở điểm đến', 'Destination not released')
  const destinationHeadline = deal?.broadcast?.generalArea?.trim()
    || deal?.draft.districtLabel?.trim()
    || textByLanguage(language, 'Điểm đến của khách hàng', 'Customer destination')
  const buildingNote = deal?.broadcast?.addressAccess?.access_profile.building_note?.trim()
    || deal?.draft.districtLabel?.trim()
    || textByLanguage(language, 'Thông tin điểm đến', 'Destination details')
  const etaSignal = routePreview.route
    ? workerV5LiveEtaSignal(routePreview.route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = routePreview.route
    ? workerV5LiveDistanceSignal(routePreview.route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const etaValue = etaDisplayValue(etaSignal, routePreview.route?.durationSeconds ?? null, language)
  const distanceValue = distanceSignal.hasSignal
    ? distanceSignal.label
    : textByLanguage(language, 'Đang cập nhật', 'Updating')
  const trafficValue = routePreview.route
    ? textByLanguage(language, 'Lộ trình thật', 'Live route')
    : textByLanguage(language, 'Đang cập nhật', 'Updating')
  const appointment = deal
    ? workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
    : textByLanguage(language, 'Chưa có lịch hẹn', 'No appointment')
  const customerNote = accessNote(deal, language)
  const primaryMode = deal?.status === 'worker_matched'
    ? 'start'
    : deal?.status === 'worker_on_way'
      ? 'arrival'
      : null
  const primaryLabel = primaryMode === 'start'
    ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
    : primaryMode === 'arrival'
      ? textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')
      : textByLanguage(language, 'Đã tới', 'Arrived')
  const primaryDisabled = !deal || !primaryMode || actionBusy
  const canChat = Boolean(deal?.broadcast?.jobId ?? deal?.id)
  const openDetails = deal ? () => navigateToScreen('2.2-offer-detail') : undefined
  const openChat = canChat ? navigateActiveJobChat : undefined

  return (
    <View
      style={[
        styles.screen,
        { marginHorizontal: prototypeMode ? -20 : -16, marginTop: prototypeMode ? -20 : -18 },
      ]}
      testID="worker-v5-route-eta-handoff"
    >
      <View style={[styles.hero, { height: Math.round(372 * scale) }]} testID="stage4-map-hero">
        <StageFourRouteMap
          deal={deal}
          destinationLabel={destinationLabel}
          language={language}
          routePreview={routePreview}
          scale={scale}
          styles={styles}
          tokens={tokens}
        />

        <View style={styles.header}>
          <StageFourButton
            accessibilityLabel={textByLanguage(language, 'Quay lại danh sách công việc', 'Back to jobs')}
            label={textByLanguage(language, 'Quay lại', 'Back')}
            onPress={() => navigateToScreen('2.1-opportunity-inbox')}
            reduceMotion={reduceMotion}
            style={styles.mapControl}
            testID="stage4-back"
            tokens={tokens}
          >
            <StageFourIcon color={tokens.text} name="back" size={21 * scale} />
          </StageFourButton>

          <View style={styles.headerTitle}>
            <Copy scale={scale} size={25} tokens={tokens} weight="700">{textByLanguage(language, 'Di chuyển', 'Travel')}</Copy>
            <Copy color={tokens.muted} scale={scale} size={13.5} style={{ marginTop: -2 * scale }} tokens={tokens}>
              {textByLanguage(language, 'Đến khách hàng', 'To customer')}
            </Copy>
          </View>

          <StageFourButton
            accessibilityLabel={textByLanguage(language, 'Trợ giúp', 'Help')}
            label={textByLanguage(language, 'Trợ giúp', 'Help')}
            onPress={navigateJobChat}
            reduceMotion={reduceMotion}
            style={styles.helpButton}
            testID="stage4-help"
            tokens={tokens}
          >
            <StageFourIcon color={tokens.text} name="headset" size={19 * scale} />
            <Copy scale={scale} size={13} tokens={tokens} weight="600">{textByLanguage(language, 'Trợ giúp', 'Help')}</Copy>
          </StageFourButton>
        </View>

        <StageFourButton
          accessibilityLabel={textByLanguage(language, 'Xem điểm đến', 'View destination')}
          disabled={!deal}
          label={textByLanguage(language, 'Xem điểm đến', 'View destination')}
          onPress={openDetails}
          reduceMotion={reduceMotion}
          style={[styles.chip, { left: Math.round(60 * scale), position: 'absolute', right: undefined, top: Math.round(67 * scale), width: Math.round(252 * scale), zIndex: 4 }]}
          testID="stage4-destination-chip"
          tokens={tokens}
        >
          <View style={styles.chipIcon}>
            <StageFourIcon color={tokens.primary} name="building" size={18.5 * scale} />
          </View>
          <View style={styles.chipCopy}>
            <Copy numberOfLines={1} scale={scale} size={14} tokens={tokens} weight="700">{destinationHeadline}</Copy>
            <Copy numberOfLines={2} color={tokens.muted} scale={scale} size={11.7} tokens={tokens}>{buildingNote}</Copy>
          </View>
          <StageFourIcon color={tokens.text} name="chevron" size={15 * scale} />
        </StageFourButton>

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
            <StageFourIconDisc name="car" scale={scale} size={42} tokens={tokens} />
            <View style={{ flex: 1, minWidth: 0 }}>
              {etaValue ? (
                <Copy scale={scale} size={18.6} tokens={tokens} weight="700">
                  {textByLanguage(language, 'Bạn sẽ đến trong ', 'Arrival in ')}
                  <Copy color={tokens.primary} scale={scale} size={18.6} tokens={tokens} weight="700">{etaValue}</Copy>
                </Copy>
              ) : (
                <Copy scale={scale} size={16} tokens={tokens} weight="700">
                  {textByLanguage(language, 'Thời gian đến đang cập nhật', 'Arrival time is updating')}
                </Copy>
              )}
              <Copy color={tokens.muted} scale={scale} size={11.8} tokens={tokens}>
                {primaryMode === 'arrival'
                  ? textByLanguage(language, 'Đang di chuyển đến địa điểm khách hàng', 'Travelling to the customer destination')
                  : textByLanguage(language, 'Sẵn sàng đến địa điểm khách hàng', 'Ready to travel to the customer destination')}
              </Copy>
            </View>
            <StageFourButton
              accessibilityLabel={textByLanguage(language, 'Mở chi tiết thời gian đến', 'Open arrival time details')}
              disabled={!deal}
              label={textByLanguage(language, 'Mở chi tiết thời gian đến', 'Open arrival time details')}
              onPress={openDetails}
              reduceMotion={reduceMotion}
              style={styles.etaDisclosure}
              testID="stage4-eta-details"
              tokens={tokens}
            >
              <StageFourIcon color={tokens.text} name="down" size={15 * scale} />
            </StageFourButton>
          </View>
        </View>
      </View>

      <View style={styles.contentStack}>
        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(98 * scale), marginTop: Math.round(6 * scale) }]} testID="stage4-destination-card">
          <StageFourButton
            accessibilityLabel={textByLanguage(language, 'Chi tiết điểm đến', 'Destination details')}
            disabled={!deal}
            label={textByLanguage(language, 'Chi tiết', 'Details')}
            onPress={openDetails}
            reduceMotion={reduceMotion}
            style={[styles.detailButton, styles.detailButtonPosition]}
            testID="stage4-destination-details"
            tokens={tokens}
          >
            <Copy scale={scale} size={12} tokens={tokens}>{textByLanguage(language, 'Chi tiết', 'Details')}</Copy>
            <StageFourIcon color={tokens.text} name="chevron" size={12.5 * scale} />
          </StageFourButton>
          <View style={styles.destinationBody}>
            <StageFourIconDisc name="pin" primary scale={scale} size={34} tokens={tokens} />
            <View style={styles.destinationCopy}>
              <Copy scale={scale} size={12} tokens={tokens} weight="600">{textByLanguage(language, 'Điểm đến', 'Destination')}</Copy>
              <Copy numberOfLines={2} scale={scale} size={15.6} tokens={tokens} weight="700">{destinationLabel}</Copy>
              <Copy numberOfLines={2} color={tokens.muted} scale={scale} size={11.6} style={{ lineHeight: 14.7 * scale, marginTop: 2 * scale }} tokens={tokens}>
                {hasRouteDestination && deal
                  ? workerV5ArrivalDestinationLabel(deal, language)
                  : textByLanguage(language, 'Thông tin được bảo vệ cho đến khi backend cấp quyền.', 'Details remain protected until the backend releases them.')}
              </Copy>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(64 * scale), paddingHorizontal: Math.round(7 * scale), paddingVertical: Math.round(5 * scale) }]} testID="stage4-metrics">
          <View style={styles.metricStack}>
            <StageFourMetric icon="route" label={textByLanguage(language, 'Khoảng cách', 'Distance')} scale={scale} tokens={tokens} value={distanceValue} />
            <View style={styles.verticalDivider} />
            <StageFourMetric icon="clock" label={textByLanguage(language, 'Thời gian đến', 'Arrival time')} scale={scale} tokens={tokens} value={etaValue ?? textByLanguage(language, 'Đang cập nhật', 'Updating')} />
            <View style={styles.verticalDivider} />
            <StageFourMetric compact icon="traffic" label={textByLanguage(language, 'Tình trạng đường', 'Road status')} scale={scale} tokens={tokens} value={trafficValue} />
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(88 * scale) }]} testID="stage4-customer-card">
          <View style={styles.sectionTitleRow}>
            <StageFourIconDisc name="person" primary scale={scale} size={32} tokens={tokens} />
            <Copy scale={scale} size={12.5} tokens={tokens} weight="600">{textByLanguage(language, 'Thông tin khách hàng', 'Customer information')}</Copy>
          </View>
          <View style={styles.customerBody}>
            <View style={styles.customerInitial}>
              <StageFourIcon color={tokens.primary} name="person" size={21 * scale} />
            </View>
            <View style={styles.customerCopy}>
              <View style={styles.customerTitleRow}>
                <Copy numberOfLines={1} scale={scale} size={15.6} tokens={tokens} weight="700">{textByLanguage(language, 'Khách hàng', 'Customer')}</Copy>
                <StageFourIcon color={tokens.text} name="chevron" size={12.5 * scale} />
              </View>
              <Copy color={tokens.muted} scale={scale} size={11.8} tokens={tokens}>{textByLanguage(language, 'Lịch hẹn: ', 'Appointment: ')}{appointment}</Copy>
            </View>
            <StageFourSmallAction
              disabled
              icon="phone"
              label={textByLanguage(language, 'Gọi', 'Call')}
              reduceMotion={reduceMotion}
              scale={scale}
              testID="stage4-call"
              tokens={tokens}
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
            />
          </View>
        </View>

        <View style={[styles.card, styles.cardContent, { minHeight: Math.round(78 * scale) }]} testID="stage4-customer-note">
          <View style={styles.noteBody}>
            <StageFourIconDisc name="note" primary scale={scale} size={32} tokens={tokens} />
            <View style={styles.noteCopy}>
              <Copy scale={scale} size={12.5} tokens={tokens} weight="600">{textByLanguage(language, 'Ghi chú từ khách hàng', 'Customer note')}</Copy>
              <View style={styles.noteSurface}>
                <StageFourIcon color={tokens.primary} name="building" size={18.5 * scale} />
                <Copy color={tokens.text} scale={scale} size={11.8} style={{ flex: 1, lineHeight: 14.7 * scale }} tokens={tokens}>{customerNote}</Copy>
              </View>
            </View>
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
          />
          <StageFourUtilityAction
            disabled
            icon="share"
            label={textByLanguage(language, 'Chia sẻ vị trí', 'Share location')}
            reduceMotion={reduceMotion}
            scale={scale}
            testID="stage4-share"
            tokens={tokens}
          />
          <StageFourUtilityAction
            icon="headset"
            label={textByLanguage(language, 'Hỗ trợ', 'Support')}
            onPress={navigateJobChat}
            reduceMotion={reduceMotion}
            scale={scale}
            testID="stage4-support"
            tokens={tokens}
          />
        </View>

        {runtime.state.lastError?.trim() ? (
          <Copy color={tokens.danger} scale={scale} size={12} style={styles.error} testID="stage4-error" tokens={tokens}>
            {runtime.state.lastError.trim()}
          </Copy>
        ) : null}

        <StageFourPrimaryButton
          busy={actionBusy}
          disabled={primaryDisabled}
          icon={primaryMode === 'start' ? 'triple' : 'pin'}
          label={primaryLabel}
          onPress={() => void runRouteAction()}
          processingLabel={textByLanguage(language, 'Đang xử lý…', 'Processing…')}
          reduceMotion={reduceMotion}
          scale={scale}
          subtitle={primaryMode === 'start'
            ? textByLanguage(language, 'Tôi đã sẵn sàng, bắt đầu đến khách hàng', 'I am ready to travel to the customer')
            : primaryMode === 'arrival'
              ? textByLanguage(language, 'Tôi đã có mặt tại điểm đến', 'I have arrived at the destination')
              : textByLanguage(language, 'Chưa có chuyển trạng thái mới', 'No next status is available')}
          testID="stage4-primary"
          tokens={tokens}
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
}: {
  deal: LocalDeal | null
  destinationLabel: string
  language: 'vi' | 'en'
  routePreview: WorkerV5RoutePreviewState
  scale: number
  styles: ReturnType<typeof createStageFourStyles>
  tokens: StageFourTokens
}) {
  if (routePreview.mapUri) {
    return (
      <View style={styles.mapImage} testID="stage4-real-route-map">
        <WorkerV5AuthenticatedRouteMapPreview label={destinationLabel} language={language} uri={routePreview.mapUri} />
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
    <View style={[styles.emptyMap, { gap: Math.round(8 * scale) }]} testID="stage4-route-map-empty">
      <StageFourIconDisc name="pin" scale={scale} size={48} tokens={tokens} />
      <Copy scale={scale} size={18} tokens={tokens} weight="700">{title}</Copy>
      <Copy color={tokens.muted} scale={scale} size={12} style={{ maxWidth: 292 * scale, textAlign: 'center' }} tokens={tokens}>{detail}</Copy>
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
}: {
  compact?: boolean
  icon: StageFourIconName
  label: string
  scale: number
  tokens: StageFourTokens
  value: string
}) {
  const styles = createStageFourStyles(scale, tokens)
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>
        <StageFourIcon color={tokens.primary} name={icon} size={18.5 * scale} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy color={compact ? tokens.primary : tokens.text} numberOfLines={compact ? 2 : 1} scale={scale} size={compact ? 11.8 : 15.4} style={{ lineHeight: (compact ? 14 : 18) * scale }} tokens={tokens} weight="700">{value}</Copy>
        <Copy color={tokens.muted} scale={scale} size={10.5} tokens={tokens}>{label}</Copy>
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
}: {
  disabled?: boolean
  icon: 'chat' | 'phone'
  label: string
  onPress?: () => void
  reduceMotion: boolean
  scale: number
  testID: string
  tokens: StageFourTokens
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
      <Copy scale={scale} size={11.2} tokens={tokens}>{label}</Copy>
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
}: {
  disabled?: boolean
  icon: 'headset' | 'send' | 'share'
  label: string
  onPress?: () => void
  reduceMotion: boolean
  scale: number
  testID: string
  tokens: StageFourTokens
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
      <Copy numberOfLines={2} scale={scale} size={11.8} style={{ textAlign: 'center' }} tokens={tokens}>{label}</Copy>
    </StageFourButton>
  )
}

function StageFourPrimaryButton({
  busy,
  disabled,
  icon,
  label,
  onPress,
  processingLabel,
  reduceMotion,
  scale,
  subtitle,
  testID,
  tokens,
}: {
  busy: boolean
  disabled: boolean
  icon: 'pin' | 'triple'
  label: string
  onPress: () => void
  processingLabel: string
  reduceMotion: boolean
  scale: number
  subtitle: string
  testID: string
  tokens: StageFourTokens
}) {
  const styles = createStageFourStyles(scale, tokens)
  const displayLabel = busy ? processingLabel : label
  return (
    <Pressable
      accessibilityLabel={displayLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, disabled && { backgroundColor: tokens.disabled }, pressed && !disabled && !reduceMotion && { opacity: 0.84 }]}
      testID={testID}
    >
      <WorkerV5PrimaryButtonFill disabled={disabled} testID="stage4-primary-gradient" variant="source" />
      <View style={styles.primaryRow}>
        <StageFourIcon color={disabled ? tokens.subtleText : tokens.primaryText} name={icon} size={24 * scale} />
        <View style={styles.primaryCopy}>
          <Copy color={disabled ? tokens.subtleText : tokens.primaryText} numberOfLines={1} scale={scale} size={19.6} style={{ letterSpacing: -0.2 * scale }} tokens={tokens} weight="700">{displayLabel}</Copy>
          <Copy color={disabled ? tokens.subtleText : tokens.primaryText} numberOfLines={2} scale={scale} size={11.1} style={{ marginTop: -1 * scale }} tokens={tokens}>{subtitle}</Copy>
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
      <StageFourIcon color={primary ? tokens.primaryText : tokens.primary} name={name} size={(size > 44 ? 30 : 23) * scale} />
    </View>
  )
}

function Copy({
  children,
  color,
  scale,
  size,
  style,
  tokens,
  weight = '400',
  ...props
}: TextProps & {
  color?: string
  scale: number
  size: number
  tokens: StageFourTokens
  weight?: '400' | '500' | '600' | '700'
}) {
  return <RNText {...props} style={[{ color: color ?? tokens.text, fontSize: size * scale, fontWeight: weight, lineHeight: size * 1.33 * scale, position: 'relative', zIndex: 1 }, style]}>{children}</RNText>
}

function StageFourIcon({ color, name, size }: { color: string; name: StageFourIconName; size: number }) {
  const strokeProps = { fill: 'none' as const, stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.8 }
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {name === 'back' ? <Path d="m14.5 5.5-6.5 6.5 6.5 6.5" {...strokeProps} />
        : name === 'building' ? <>
          <Path d="M5 20V4.5c0-.8.7-1.5 1.5-1.5h7c.8 0 1.5.7 1.5 1.5V20" {...strokeProps} />
          <Path d="M3 20h18M9 7h1M12 7h1M9 10h1M12 10h1M9 13h1M12 13h1M9 16h1M12 16h1" {...strokeProps} />
        </>
        : name === 'car' ? <>
          <Path d="m5.1 10.4 1.5-4.1c.2-.6.8-1 1.4-1h8c.6 0 1.2.4 1.4 1l1.5 4.1" {...strokeProps} />
          <Rect height={6.8} rx={1.7} width={16.4} x={3.8} y={9.5} {...strokeProps} />
          <Path d="M6.5 16.3v1.4M17.5 16.3v1.4M6 12.7h.1M18 12.7h.1" {...strokeProps} />
        </>
        : name === 'chat' ? <>
          <Path d="M4.5 5.5h15v9.2h-8l-4.5 3v-3h-2.5v-9.2Z" {...strokeProps} />
          <Path d="M8 9.8h.1M12 9.8h.1M16 9.8h.1" {...strokeProps} />
        </>
        : name === 'chevron' ? <Path d="m9 5 7 7-7 7" {...strokeProps} />
        : name === 'clock' ? <>
          <Circle cx="12" cy="12" r="8.1" {...strokeProps} />
          <Path d="M12 7.5v4.8l3.1 1.8" {...strokeProps} />
        </>
        : name === 'down' ? <Path d="m6.5 9 5.5 5.5L17.5 9" {...strokeProps} />
        : name === 'headset' ? <>
          <Path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1" {...strokeProps} />
          <Path d="M4.5 12.5h2.7v5H5.6c-.6 0-1.1-.5-1.1-1.1v-2.8c0-.6.5-1.1 1.1-1.1ZM19.5 12.5h-2.7v5h1.6c.6 0 1.1-.5 1.1-1.1v-2.8c0-.6-.5-1.1-1.1-1.1ZM14.2 19h-2.3" {...strokeProps} />
        </>
        : name === 'layers' ? <>
          <Path d="m4 8 8-4 8 4-8 4-8-4Z" {...strokeProps} />
          <Path d="m4 12 8 4 8-4M4 16l8 4 8-4" {...strokeProps} />
        </>
        : name === 'locate' ? <>
          <Circle cx="12" cy="12" r="5.6" {...strokeProps} />
          <Circle cx="12" cy="12" fill={color} r="1.5" />
          <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" {...strokeProps} />
        </>
        : name === 'note' ? <>
          <Rect height="16" rx="2" width="14.5" x="4.75" y="4" {...strokeProps} />
          <Path d="M8 8h8M8 11.5h8M8 15h5" {...strokeProps} />
        </>
        : name === 'person' ? <>
          <Circle cx="12" cy="8" r="3" {...strokeProps} />
          <Path d="M5.5 20c.7-3.2 3.1-5 6.5-5s5.8 1.8 6.5 5" {...strokeProps} />
        </>
        : name === 'phone' ? <Path d="M7.2 4.6 9.4 4l1.4 4-1.8 1.4a14.7 14.7 0 0 0 5.6 5.6l1.4-1.8 4 1.4-.6 2.2c-.3 1.1-1.4 1.8-2.5 1.5C10.9 17 7 13.1 5.7 6.9c-.3-1.1.4-2.2 1.5-2.3Z" {...strokeProps} />
        : name === 'pin' ? <>
          <Path d="M12 21s6-6.1 6-11.2A6 6 0 0 0 6 9.8C6 14.9 12 21 12 21Z" {...strokeProps} />
          <Circle cx="12" cy="9.5" r="2" {...strokeProps} />
        </>
        : name === 'route' ? <>
          <Path d="M6 5.5c2.3 0 2.8 3.1 5.1 3.1h1.8c2.5 0 2.8 3.7 5.1 3.7" {...strokeProps} />
          <Path d="M6 18.5c2.3 0 2.8-3.1 5.1-3.1h1.8c2.5 0 2.8-3.7 5.1-3.7" {...strokeProps} />
          <Circle cx="6" cy="5.5" fill={color} r="1.5" />
          <Circle cx="18" cy="12.3" fill={color} r="1.5" />
        </>
        : name === 'send' ? <Path d="m4 12 16-8-4.2 16-4.1-5.8L4 12Zm7.7 2.2L20 4" {...strokeProps} />
        : name === 'share' ? <>
          <Circle cx="6" cy="12" r="2" {...strokeProps} />
          <Circle cx="17.5" cy="5.5" r="2" {...strokeProps} />
          <Circle cx="17.5" cy="18.5" r="2" {...strokeProps} />
          <Path d="m7.7 11 7.9-4.5M7.7 13l7.9 4.5" {...strokeProps} />
        </>
        : name === 'traffic' ? <>
          <Path d="M5 19V13M10 19V9M15 19V5M20 19v-8" {...strokeProps} />
        </>
        : <>
          <Path d="m5 8 4 4-4 4M10 8l4 4-4 4M15 8l4 4-4 4" {...strokeProps} />
        </>}
    </Svg>
  )
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
