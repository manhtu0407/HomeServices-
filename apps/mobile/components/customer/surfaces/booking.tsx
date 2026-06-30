import { customerCopy } from './copy'
import { styles } from './styles'
import { customerBookingActiveRequestSurface, customerBookingDiagnosisSurface, customerOpaqueSurface, customerSmallChipSurface, customerSmallChipTextColor } from './surface-styles'
import { type SurfaceTone } from './types'
import { BookingWizard } from '@/components/customer/booking-wizard'
import { localizedProblemLabel, localizedServiceLabel, useAppLanguage } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type ServiceType } from '@nestscout/shared'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { V4Frame } from './shell'
import { IconGlyph, PrimaryButton, SubtleLiquidLight, V4ServiceCard, canReplaceCustomerDeal, customerVisibleStatusLabel, isTerminalCustomerDeal, kaelChatPath, localizedCustomerAreaLabel, localizedCustomerGeneratedText, openHistoryPath, openKaelChatPath, useCustomerTokens } from './ui'

export function CustomerBookingEntrySurface() {
  const { push, replace } = useRouter()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { dispatch, selectors, state } = useFrontendWorkflow()
  const activeDeal = state.deal
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const entryCopy = languageMode === 'en'
    ? {
        activeBody: 'Continue the active request before starting a new one.',
        activeCta: 'View activity',
        activeTitle: 'Request in progress',
        intakeHandoffSubtitle: 'Send details to Kael',
        checklist: 'Intake handoff',
        checklistItems: ['Service', 'Issue', 'Media', 'Area'],
        diagnosis: 'Kael intake',
        diagnosisValue: 'Kael will summarize the issue here after the chat has enough detail.',
        detailEstimate: 'View activity details',
        estimateLabel: 'Kael estimate',
        estimatePending: 'Needs data',
        kicker: 'Start request',
        serviceChange: 'Change service',
        serviceChoose: 'Choose service',
        serviceSelected: 'Selected',
        startKaelCheck: 'Open Kael chat',
        title: 'Start with Kael',
      }
    : {
        activeBody: 'Theo dõi hoặc hoàn tất yêu cầu hiện tại trước khi tạo yêu cầu mới.',
        activeCta: 'Xem hoạt động',
        activeTitle: 'Đang có yêu cầu',
        intakeHandoffSubtitle: 'Gửi thông tin cho Kael',
        checklist: 'Phiếu gửi Kael',
        checklistItems: ['Dịch vụ', 'Vấn đề', 'Ảnh/video', 'Khu vực'],
        diagnosis: 'Kael tiếp nhận',
        diagnosisValue: 'Kael sẽ tóm tắt vấn đề ở đây sau khi chat có đủ chi tiết.',
        detailEstimate: 'Xem chi tiết hoạt động',
        estimateLabel: 'Ước tính Kael',
        estimatePending: 'Cần dữ liệu',
        kicker: 'Bắt đầu yêu cầu',
        serviceChange: 'Đổi dịch vụ',
        serviceChoose: 'Chọn dịch vụ',
        serviceSelected: 'Đã chọn',
        startKaelCheck: 'Mở chat Kael',
        title: 'Bắt đầu với Kael',
      }
  const activeServiceType = activeDeal?.draft.serviceType ?? null
  const estimateLabel = activeDeal?.estimate?.priceRangeLabel ?? entryCopy.estimatePending
  const mediaCount = activeDeal?.draft.mediaCount ?? 0
  const mediaChipLabel = mediaCount > 0
    ? `${languageMode === 'en' ? 'Media' : 'Ảnh/video'}: ${mediaCount}`
    : (languageMode === 'en' ? 'Media: none yet' : 'Ảnh/video: chưa có')
  const serviceMetaForBooking = (serviceType: ServiceType) => {
    if (activeDeal?.draft.serviceType === serviceType) return entryCopy.serviceSelected
    return activeDeal ? entryCopy.serviceChange : entryCopy.serviceChoose
  }
  const bookingIssueValue = activeDeal
    ? localizedProblemLabel(activeDeal.draft.problemChips[0] ?? activeDeal.draft.inferredProblemLabel, activeDeal.draft.serviceType, languageMode)
    : entryCopy.estimatePending
  const bookingMediaValue = mediaCount > 0 ? `${mediaCount}` : entryCopy.estimatePending
  const bookingAreaValue = activeDeal
    ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown)
    : entryCopy.estimatePending
  const bookingCheckValues = [
    activeServiceType ? localizedServiceLabel(activeServiceType, languageMode) : entryCopy.estimatePending,
    activeDeal?.estimate?.problemLabel ?? bookingIssueValue,
    bookingMediaValue,
    bookingAreaValue,
  ]
  const openChat = (serviceType: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const openEstimateDetails = () => {
    if (activeDeal) {
      replace(`${openHistoryPath}?tab=price`)
      return
    }
    push(kaelChatPath(activeServiceType))
  }
  const shouldShowBookingWizard = canStartNewDeal

  if (shouldShowBookingWizard) {
    return (
      <V4Frame active="booking" testID="customer-booking-entry-surface">
        {({ tokens }) => (
          <View style={styles.bookingStack}>
            <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-booking" />
            <View style={styles.hiddenMarker} testID="customer-booking-ios26-foundation-section" />
            <View style={styles.bookingTopRow} testID="customer-booking-title-row">
              <View style={styles.titleBlock}>
                <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                  {entryCopy.title}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {entryCopy.intakeHandoffSubtitle}
                </Text>
              </View>
            </View>
            <View style={styles.hiddenMarker} testID="customer-booking-intake-to-kael-primary" />
            <BookingWizard
              mode={tokens.mode}
              onOpenHistory={() => replace(openHistoryPath)}
              onOpenKael={(serviceType) => replace(kaelChatPath(serviceType))}
            />
          </View>
        )}
      </V4Frame>
    )
  }

  return (
    <V4Frame active="booking" testID="customer-booking-entry-surface">
      {({ tokens }) => (
        <View style={styles.bookingStack}>
          <View style={styles.hiddenMarker} testID="customer-section-liquid-wash-booking" />
          <View style={styles.hiddenMarker} testID="customer-booking-ios26-foundation-section" />
          <View style={styles.bookingTopRow} testID="customer-booking-title-row">
            <View style={styles.titleBlock}>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.title}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {entryCopy.intakeHandoffSubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.serviceGrid} testID="customer-booking-service-entry-grid">
            <V4ServiceCard compact icon="plug" meta={serviceMetaForBooking('electrical')} selected={activeServiceType === 'electrical'} title={localizedServiceLabel('electrical', languageMode)} testID="customer-booking-service-electrical" tone="service" onPress={() => openChat('electrical')} />
            <V4ServiceCard compact icon="faucet" meta={serviceMetaForBooking('plumbing')} selected={activeServiceType === 'plumbing'} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-booking-service-plumbing" tone="water" onPress={() => openChat('plumbing')} />
            <V4ServiceCard compact icon="broom" meta={serviceMetaForBooking('cleaning')} selected={activeServiceType === 'cleaning'} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-booking-service-cleaning" tone="warm" onPress={() => openChat('cleaning')} />
          </View>
          <View style={styles.chipRow} testID="customer-booking-summary-chips">
            <SmallChip label={activeDeal?.draft.problemChips[0] ? `${copy.ticket.issue}: ${localizedProblemLabel(activeDeal.draft.problemChips[0], activeDeal.draft.serviceType, languageMode)}` : `${copy.ticket.issue}: ${entryCopy.estimatePending}`} tone="service" />
            <SmallChip label={mediaChipLabel} tone="water" />
            <SmallChip label={`${copy.ticket.area}: ${activeDeal ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown) : entryCopy.estimatePending}`} tone="warm" />
            <SmallChip label={`${entryCopy.estimateLabel}: ${estimateLabel}`} tone="service" />
          </View>
          <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-booking-ai-diagnosis-summary">
            <View style={styles.hiddenMarker} testID="customer-booking-kael-summary" />
            <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
              <IconGlyph name="kael" color={tokens.primary} accent={tokens.copper} />
              <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.diagnosis}
              </Text>
            </View>
            <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
              {localizedCustomerGeneratedText(activeDeal?.estimate?.advisory, languageMode, entryCopy.diagnosisValue)}
            </Text>
          </View>
          <View style={[styles.bookingCheckPanel, customerOpaqueSurface(tokens)]} testID="customer-booking-intake-handoff-panel">
            <SubtleLiquidLight testID="customer-booking-checklist-liquid-rim" variant="rim" />
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.checklist}
              </Text>
            </View>
            <View style={styles.bookingGrid} testID="customer-booking-intake-handoff-grid">
              {entryCopy.checklistItems.map((item, index) => (
                <View key={item} style={[styles.priceBox, customerOpaqueSurface(tokens)]}>
                  <Text style={[styles.priceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
                    {item}
                  </Text>
                  <Text style={[styles.priceBoxValue, { color: tokens.text }]} numberOfLines={2}>
                    {bookingCheckValues[index] ?? entryCopy.estimatePending}
                  </Text>
                </View>
              ))}
            </View>
            {activeDeal?.estimate ? (
              <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-booking-estimate-disclaimer">
                {copy.history.priceDisclaimer}
              </Text>
            ) : null}
          </View>
          <PrimaryButton compact label={activeDeal ? entryCopy.detailEstimate : entryCopy.startKaelCheck} onPress={openEstimateDetails} testID="customer-booking-activity-detail-cta" />
          {activeDeal ? (
            <Pressable
              accessibilityLabel={`${entryCopy.activeTitle}. ${activeDealStatusLabel}`}
              accessibilityRole="button"
              onPress={() => replace(activeDealRoute)}
              style={({ pressed }) => [styles.ticketCard, customerBookingActiveRequestSurface(tokens), pressed ? styles.pressed : null]}
              testID="customer-booking-active-request"
            >
              <View style={styles.sectionTitle}>
                <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                  {entryCopy.activeTitle}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                  {activeDealStatusLabel}
                </Text>
              </View>
              <Text style={[styles.homeTrustBody, { color: tokens.muted }]} numberOfLines={2}>
                {entryCopy.activeBody}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.activeCta}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.hiddenMarker} testID="customer-booking-legacy-flow-not-primary" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerKaelSurface() {
  const { replace } = useRouter()

  useEffect(() => {
    replace(openKaelChatPath)
  }, [replace])

  return null
}

function SmallChip({ label, tone = 'base' }: { label: string; tone?: SurfaceTone }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.smallChip, customerSmallChipSurface(tokens, tone)]}>
      <Text style={[styles.smallChipText, { color: customerSmallChipTextColor(tokens, tone) }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
