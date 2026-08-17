import { useMemo, type ReactNode } from 'react'
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { CUSTOMER_SERVICE_IDS, type CustomerServiceId } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  BookingDraftButtonAura,
  BookingProblemChipAura,
  CaseWideMintAura,
  SourceCardSkin,
  ZipMintAura,
} from '../ui/aura-surfaces'
import { customerV21Assets } from '../ui/assets'
import { availableBookingTimeSlots } from './booking-intake-display-model'
import { BookingFormGlyph, BookingFormulaMintAura } from './booking-form-glyphs'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { BookingWorkartJourney, BookingWorkartServiceTile } from './booking-workart-surfaces'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { AssetTile, EmptyState, SectionActionHeader, V21Card, V21TopBar } from '../ui/shared-surfaces'

type BookingProblemOptionView = {
  label: string
  value: string
}

type BookingAddressSuggestionView = {
  label: string
  main_text: string
  place_id: string
  secondary_text: string | null
}

type BookingScheduleDateOptionView = {
  dateLabel: string
  dayLabel: string
  value: string
}

type RootBookingStyles = {
  bodyText: StyleProp<TextStyle>
  chipWrap: StyleProp<ViewStyle>
  errorText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  formCard: StyleProp<ViewStyle>
  pressed: StyleProp<ViewStyle>
  stepBadge: StyleProp<TextStyle>
  stepCard: StyleProp<ViewStyle>
  stepLabel: StyleProp<TextStyle>
}

export function CustomerBookingGuestGateView({
  body,
  loginLabel,
  onLogin,
  title,
}: {
  body: string
  loginLabel: string
  onLogin: () => void
  title: string
}) {
  return (
    <EmptyState
      action={<KaelButton label={loginLabel} onPress={onLogin} testID="customer-v21-guest-login" />}
      assetTile={AssetTile}
      body={body}
      image={customerV21Assets.identity}
      testID="customer-v21-guest-gate"
      title={title}
    />
  )
}

export function CustomerBookingEntryView({
  address,
  addressLookupOpen,
  addressLookupPending,
  addressFallbackUsed,
  addressSuggestions,
  addressUsesMultiline,
  chatPlaceholder,
  createDraftLabel,
  customScheduleDateError,
  customScheduleDateInput,
  customScheduleTimeError,
  customScheduleTimeInput,
  description,
  error,
  hiddenTextInputScrollbarStyle,
  invisibleTextInputScrollbarStyle,
  isMediaScreen,
  language,
  mediaPanelNode,
  onAddressChange,
  onAddressFocus,
  onAddressSuggestionPress,
  onBack,
  onCustomScheduleDateChange,
  onCustomScheduleTimeChange,
  onDescriptionChange,
  onProblemToggle,
  onResetSelectedService,
  onScheduleDateSelect,
  onScheduleTimeSelect,
  onServiceSelect,
  onSubmit,
  problemOptions,
  reduceTransparency,
  rootStyles,
  scheduleDateOptions,
  scheduleLabel,
  scheduleRuntimeNow,
  selectedProblems,
  selectedScheduleDate,
  selectedScheduleTime,
  selectedService,
  textInputNoOutlineStyle,
  timeSlots,
  tokens,
  submitDisabled = false,
}: {
  address: string
  addressFallbackUsed: boolean
  addressLookupOpen: boolean
  addressLookupPending: boolean
  addressSuggestions: BookingAddressSuggestionView[]
  addressUsesMultiline: boolean
  chatPlaceholder: string
  createDraftLabel: string
  customScheduleDateError: string | null
  customScheduleDateInput: string
  customScheduleTimeError: string | null
  customScheduleTimeInput: string
  description: string
  error: string | null
  hiddenTextInputScrollbarStyle: StyleProp<TextStyle>
  invisibleTextInputScrollbarStyle: StyleProp<TextStyle>
  isMediaScreen: boolean
  language: AppLanguage
  mediaPanelNode: ReactNode
  onAddressChange: (value: string) => void
  onAddressFocus: () => void
  onAddressSuggestionPress: (suggestion: BookingAddressSuggestionView) => void
  onBack: () => void
  onCustomScheduleDateChange: (value: string) => void
  onCustomScheduleTimeChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onProblemToggle: (problem: string) => void
  onResetSelectedService: () => void
  onScheduleDateSelect: (value: string) => void
  onScheduleTimeSelect: (value: string) => void
  onServiceSelect: (service: CustomerServiceId) => void
  onSubmit: () => void
  problemOptions: BookingProblemOptionView[]
  reduceTransparency: boolean
  rootStyles: RootBookingStyles
  scheduleDateOptions: BookingScheduleDateOptionView[]
  scheduleLabel: string | null
  scheduleRuntimeNow: number
  selectedProblems: string[]
  selectedScheduleDate: string | null
  selectedScheduleTime: string | null
  selectedService: CustomerServiceId | null
  textInputNoOutlineStyle: StyleProp<TextStyle>
  timeSlots: readonly string[]
  tokens: CustomerThemeTokens
  submitDisabled?: boolean
}) {
  const { width: viewportWidth } = useWindowDimensions()
  const isWideBookingForm = viewportWidth >= 420
  const timeSlotAuraLayers = useMemo(
    () => timeSlots.map((slot, index) => (
      <View
        key={`booking-start-time-aura-${slot}`}
        pointerEvents="none"
        style={[bookingStyles.bookingWideAuraLayer, isWideBookingForm ? bookingStyles.bookingWideHiddenAuraLayer : null]}
      >
        <CaseWideMintAura
          intensity="strong"
          scope={`BookingStartTime${slot.replace(':', '')}`}
          testID={`customer-v21-booking-time-${index}-mint-aura`}
        />
      </View>
    )),
    [isWideBookingForm, timeSlots],
  )
  const availableTimeSlots = availableBookingTimeSlots(
    selectedScheduleDate,
    new Date(scheduleRuntimeNow),
  )
  const availableTimeSlotSet = new Set<string>(availableTimeSlots)
  const showDateChipGlyph = isWideBookingForm && viewportWidth >= 480
  const bookingCardWidth = Math.max(0, viewportWidth - 32)
  const bookingCardScale = Math.min(1.25, Math.max(1, Math.round((bookingCardWidth / 411) * 100) / 100))
  const bookingJourneyArtworkHeight = Math.max(140, Math.min(184, Math.round(bookingCardWidth * 0.37)))
  const bookingServiceTileHeight = Math.max(56, Math.min(72, Math.round(bookingCardWidth * 0.133)))
  const bookingServiceGridGap = Math.max(3, Math.min(4, Math.round(bookingCardWidth * 0.007)))
  const draftSubmitButton = (
    <KaelButton
      backgroundLayer={isWideBookingForm ? (
        <View
          pointerEvents="none"
          style={[bookingStyles.bookingWideAuraLayer, bookingStyles.bookingWideHiddenAuraLayer]}
        >
          <BookingDraftButtonAura reduceTransparency={reduceTransparency} />
        </View>
      ) : <BookingDraftButtonAura reduceTransparency={reduceTransparency} />}
      disabled={submitDisabled}
      label={createDraftLabel}
      onPress={onSubmit}
      style={isWideBookingForm ? bookingStyles.bookingWideDraftSubmitButton : bookingStyles.bookingDraftSubmitButton}
      testID="customer-v21-booking-submit"
      textStyle={isWideBookingForm ? bookingStyles.bookingWideDraftSubmitText : undefined}
      variant="primary"
    />
  )
  const draftSubmitNode = isWideBookingForm ? (
    <View style={bookingStyles.bookingWideDraftSubmitWrap}>
      {draftSubmitButton}
      <View pointerEvents="none" style={bookingStyles.bookingWideDraftSubmitIcon}>
        <BookingFormGlyph color="#FFFFFF" kind="send" size={20} />
      </View>
    </View>
  ) : draftSubmitButton
  const dateGridContentNode = (
    <View style={[bookingStyles.bookingDateGrid, isWideBookingForm ? bookingStyles.bookingDateGridWide : null]}>
      <View
        pointerEvents="none"
        style={[bookingStyles.bookingWideAuraLayer, isWideBookingForm ? bookingStyles.bookingWideHiddenAuraLayer : null]}
      >
        <CaseWideMintAura
          intensity="strong"
          scope="BookingDateGrid"
          testID="customer-v21-booking-date-grid-mint-aura"
        />
      </View>
      {scheduleDateOptions.map((option, index) => {
        const selected = selectedScheduleDate === option.value
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onScheduleDateSelect(option.value)}
            style={[
              bookingStyles.bookingDateOption,
              isWideBookingForm ? bookingStyles.bookingDateOptionWide : null,
              {
                backgroundColor: isWideBookingForm
                  ? 'transparent'
                  : selected
                    ? tokens.service
                    : tokens.mode === 'dark'
                      ? tokens.ghost
                      : 'rgba(255,255,255,0.72)',
                borderColor: isWideBookingForm ? 'transparent' : selected ? tokens.primary : tokens.border,
                borderBottomColor: isWideBookingForm ? 'transparent' : undefined,
              },
            ]}
            testID={`customer-v21-booking-date-${index}`}
          >
            <View style={[bookingStyles.bookingDateOptionContent, isWideBookingForm ? bookingStyles.bookingDateOptionContentWide : null]}>
              {showDateChipGlyph ? <BookingFormGlyph color={selected ? tokens.primary : tokens.muted} kind="calendar" size={12} /> : null}
              <View style={bookingStyles.bookingDateTextStack}>
                <Text numberOfLines={1} style={[bookingStyles.bookingDateDay, { color: selected ? tokens.primary : tokens.muted }]}>{option.dayLabel}</Text>
                <Text numberOfLines={1} style={[bookingStyles.bookingDateValue, { color: selected ? tokens.primary : tokens.text }]}>{option.dateLabel}</Text>
              </View>
              {isWideBookingForm ? <View style={[bookingStyles.bookingWideDateSelectionLine, { backgroundColor: selected ? tokens.primary : 'transparent' }]} /> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
  const dateGridNode = isWideBookingForm ? (
    <View style={bookingStyles.bookingWideDateGroup}>
      <Text style={[bookingStyles.bookingWideDateLabel, { color: tokens.text }]}>
        {language === 'vi' ? 'Ngày mong muốn' : 'Preferred date'}
      </Text>
      {dateGridContentNode}
    </View>
  ) : dateGridContentNode
  const customDateFieldNode = (
    <View style={[bookingStyles.bookingCustomScheduleField, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleField : null]}>
      <Text style={[bookingStyles.bookingCustomScheduleLabel, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleLabel : null, { color: tokens.text }]}>
        {language === 'vi' ? 'Ngày khác' : 'Another date'}
      </Text>
      <KaelTextField
        inputShellAdornment={(
          isWideBookingForm ? (
            <View style={bookingStyles.bookingWideFieldAdornment}>
              <BookingFormulaMintAura
                quiet={isWideBookingForm}
                scope="BookingCustomDate"
                testIDPrefix="customer-v21-booking-custom-date"
              />
              <BookingFormGlyph color={tokens.primary} kind="calendar" size={14} />
            </View>
          ) : (
            <BookingFormulaMintAura
              quiet={isWideBookingForm}
              scope="BookingCustomDate"
              testIDPrefix="customer-v21-booking-custom-date"
            />
          )
        )}
        inputShellStyle={[
          bookingStyles.bookingCustomScheduleInputShell,
          isWideBookingForm ? bookingStyles.bookingWideCustomScheduleInputShell : null,
          {
            backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.ghost : 'rgba(255,255,255,0.72)',
            borderColor: isWideBookingForm ? tokens.border : customScheduleDateInput && selectedScheduleDate ? tokens.primary : tokens.border,
          },
        ]}
        accessibilityLabel={language === 'vi' ? 'Nhập ngày muốn đặt' : 'Enter desired date'}
        accessibilityHint={customScheduleDateError ?? (language === 'vi' ? 'Định dạng ngày tháng năm' : 'Day month year format')}
        keyboardType="number-pad"
        maxLength={10}
        onChangeText={onCustomScheduleDateChange}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={tokens.subtleText}
        style={[bookingStyles.bookingCustomScheduleInput, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleInput : null, textInputNoOutlineStyle, { color: isWideBookingForm ? tokens.primary : tokens.text }]}
        testID="customer-v21-booking-custom-date"
        value={customScheduleDateInput}
      />
      {customScheduleDateError || !isWideBookingForm ? (
        <Text
          style={[bookingStyles.bookingCustomScheduleHint, { color: customScheduleDateError ? tokens.primary : tokens.muted }]}
          testID={customScheduleDateError ? 'customer-v21-booking-custom-date-error' : undefined}
        >
          {customScheduleDateError ?? (language === 'vi' ? 'Nhập ngày mong muốn nếu lịch nằm sau 7 ngày.' : 'Enter a desired date when it is more than 7 days away.')}
        </Text>
      ) : null}
    </View>
  )
  const timeStartNode = (
    <View style={[bookingStyles.bookingTimeStartSection, isWideBookingForm ? bookingStyles.bookingWideTimeStartSection : null]}>
      <Text style={[bookingStyles.bookingCustomScheduleHint, isWideBookingForm ? bookingStyles.bookingWideTimeStartLabel : null, { color: tokens.text, fontWeight: '700' }]}>
        {language === 'vi'
          ? 'Chọn giờ bạn muốn dịch vụ bắt đầu.'
          : 'Choose when you want the service to start.'}
      </Text>
    </View>
  )
  const timeGridNode = (
    <View style={[bookingStyles.bookingTimeGrid, isWideBookingForm ? bookingStyles.bookingWideTimeGrid : null]}>
      {timeSlots.map((slot, index) => {
        const selected = selectedScheduleTime === slot
        const unavailable = !availableTimeSlotSet.has(slot)
        return (
          <View key={slot} style={isWideBookingForm ? bookingStyles.bookingWideTimeSlotGroup : null}>
            <KaelChip
              accessibilityState={{ selected }}
              backgroundLayer={timeSlotAuraLayers[index]}
              disabled={unavailable}
              label={slot}
              onPress={() => onScheduleTimeSelect(slot)}
              style={[
                isWideBookingForm ? bookingStyles.bookingWideTimeChip : null,
                {
                  backgroundColor: isWideBookingForm
                    ? 'transparent'
                    : selected
                      ? tokens.service
                      : tokens.mode === 'dark'
                        ? tokens.ghost
                        : 'rgba(255,255,255,0.72)',
                  borderColor: isWideBookingForm ? 'transparent' : selected ? tokens.primary : tokens.border,
                },
              ]}
              testID={`customer-v21-booking-time-${index}`}
              textStyle={isWideBookingForm ? bookingStyles.bookingWideTimeChipText : undefined}
              variant={selected ? 'selected' : 'unselected'}
            />
            {isWideBookingForm && index < timeSlots.length - 1 ? <View style={[bookingStyles.bookingWideTimeSeparator, { backgroundColor: tokens.primary }]} /> : null}
          </View>
        )
      })}
    </View>
  )
  const customTimeFieldNode = (
    <View style={[bookingStyles.bookingCustomScheduleField, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleField : null]}>
      <Text style={[bookingStyles.bookingCustomScheduleLabel, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleLabel : null, { color: tokens.text }]}>
        {language === 'vi' ? 'Giờ khác' : 'Another start time'}
      </Text>
      <KaelTextField
        inputShellAdornment={(
          isWideBookingForm ? (
            <View style={bookingStyles.bookingWideFieldAdornment}>
              <BookingFormulaMintAura
                quiet={isWideBookingForm}
                scope="BookingCustomTime"
                testIDPrefix="customer-v21-booking-custom-time"
              />
              <BookingFormGlyph color={tokens.primary} kind="clock" size={14} />
            </View>
          ) : (
            <BookingFormulaMintAura
              quiet={isWideBookingForm}
              scope="BookingCustomTime"
              testIDPrefix="customer-v21-booking-custom-time"
            />
          )
        )}
        inputShellStyle={[
          bookingStyles.bookingCustomScheduleInputShell,
          isWideBookingForm ? bookingStyles.bookingWideCustomScheduleInputShell : null,
          {
            backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.ghost : 'rgba(255,255,255,0.72)',
            borderColor: isWideBookingForm ? tokens.border : customScheduleTimeInput && selectedScheduleTime ? tokens.primary : tokens.border,
          },
        ]}
        accessibilityLabel={language === 'vi' ? 'Nhập giờ bắt đầu mong muốn' : 'Enter desired start time'}
        accessibilityHint={customScheduleTimeError ?? (language === 'vi' ? 'Định dạng giờ và phút' : 'Hour and minute format')}
        keyboardType="number-pad"
        maxLength={5}
        onChangeText={onCustomScheduleTimeChange}
        placeholder="HH:mm"
        placeholderTextColor={tokens.subtleText}
        style={[bookingStyles.bookingCustomScheduleInput, isWideBookingForm ? bookingStyles.bookingWideCustomScheduleInput : null, textInputNoOutlineStyle, { color: isWideBookingForm ? tokens.primary : tokens.text }]}
        testID="customer-v21-booking-custom-time"
        value={customScheduleTimeInput}
      />
      {customScheduleTimeError ? (
        <Text
          style={[bookingStyles.bookingCustomScheduleHint, { color: tokens.primary }]}
          testID="customer-v21-booking-custom-time-error"
        >
          {customScheduleTimeError}
        </Text>
      ) : null}
    </View>
  )
  const descriptionNode = isWideBookingForm ? (
    <View style={[bookingStyles.bookingWideDescriptionRow, { backgroundColor: 'transparent', borderColor: tokens.border }]}>
      <View style={[bookingStyles.bookingInlineIconShell, bookingStyles.bookingWideDescriptionIconShell, { backgroundColor: 'transparent' }]}>
        <BookingFormGlyph color={tokens.primary} kind="note" size={22} />
      </View>
      <KaelTextField
        inputShellAdornment={(
          <BookingFormulaMintAura
            quiet={isWideBookingForm}
            scope="BookingDescription"
            testIDPrefix="customer-v21-booking-description"
          />
        )}
        inputShellStyle={[bookingStyles.bookingDescriptionInputShell, bookingStyles.bookingWideDescriptionInputShell, { borderBottomColor: tokens.border }]}
        accessibilityLabel={language === 'vi' ? 'Mô tả vấn đề' : 'Issue description'}
        multiline
        onChangeText={onDescriptionChange}
        placeholder={chatPlaceholder}
        placeholderTextColor={tokens.subtleText}
        shellStyle={bookingStyles.bookingWideDescriptionField}
        style={[bookingStyles.bookingDescriptionInput, bookingStyles.bookingWideDescriptionInput, textInputNoOutlineStyle, invisibleTextInputScrollbarStyle, { color: tokens.text }]}
        testID="customer-v21-booking-description"
        textAlignVertical="center"
        value={description}
      />
    </View>
  ) : (
    <>
      <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Mô tả sự cố' : 'Issue description'}</Text>
      <KaelTextField
        inputShellAdornment={(
            <BookingFormulaMintAura
              quiet={isWideBookingForm}
              scope="BookingDescription"
              testIDPrefix="customer-v21-booking-description"
          />
        )}
        inputShellStyle={[bookingStyles.bookingDescriptionInputShell, { backgroundColor: tokens.mode === 'dark' ? tokens.base : 'rgba(255,255,255,0.70)', borderColor: tokens.border }]}
        accessibilityLabel={language === 'vi' ? 'Mô tả vấn đề' : 'Issue description'}
        multiline
        onChangeText={onDescriptionChange}
        placeholder={chatPlaceholder}
        placeholderTextColor={tokens.subtleText}
        style={[bookingStyles.bookingDescriptionInput, textInputNoOutlineStyle, invisibleTextInputScrollbarStyle, { color: tokens.text }]}
        testID="customer-v21-booking-description"
        textAlignVertical="top"
        value={description}
      />
    </>
  )
  return (
    <>
      <V21TopBar
        onBack={onBack}
        subtitle={isMediaScreen ? (language === 'vi' ? 'Bước 2/4 · dữ liệu chờ công việc thật' : 'Step 2/4 · data waits for a real job') : (language === 'vi' ? 'Kael sẽ dẫn bạn theo từng bước' : 'Kael guides each step')}
        title={isMediaScreen ? (language === 'vi' ? 'Kael thu thập hiện trạng' : 'Kael collects current state') : (language === 'vi' ? 'Tạo yêu cầu dịch vụ' : 'Create service request')}
      />

      {!isMediaScreen ? (
        <BookingWorkartJourney artworkHeight={bookingJourneyArtworkHeight} copyScale={bookingCardScale} language={language} testID="customer-v21-booking-progress" tokens={tokens} />
      ) : null}

      {isMediaScreen ? mediaPanelNode : null}
      {isMediaScreen && error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}

      {!isMediaScreen ? (
        <>
          <SectionActionHeader
            action={selectedService ? (language === 'vi' ? 'Thay đổi' : 'Change') : undefined}
            onAction={selectedService ? onResetSelectedService : undefined}
            title={selectedService ? (language === 'vi' ? 'Dịch vụ đã chọn' : 'Selected service') : (language === 'vi' ? 'Chọn dịch vụ' : 'Choose service')}
          />
          {selectedService ? (
            <View style={bookingStyles.bookingSelectedServiceFrame} testID="customer-v21-selected-service-frame">
              <BookingWorkartServiceTile
                language={language}
                selected
                service={selectedService}
                testID="customer-v21-selected-service"
                tileHeight={bookingServiceTileHeight}
                tokens={tokens}
              />
            </View>
          ) : null}
          {!selectedService ? (
            <View style={[sharedStyles.serviceGrid, bookingStyles.bookingServiceGrid, { gap: bookingServiceGridGap }]}>
              {CUSTOMER_SERVICE_IDS.map((service) => (
                <BookingWorkartServiceTile
                  language={language}
                  key={service}
                  onPress={() => onServiceSelect(service)}
                  selected={selectedService === service}
                  service={service}
                  tileHeight={bookingServiceTileHeight}
                  tokens={tokens}
                />
              ))}
            </View>
          ) : null}

          <View style={bookingStyles.bookingInfoHeader}>
            <Text style={[bookingStyles.bookingInfoHeaderTitle, { color: tokens.text }]}>{language === 'vi' ? 'Thông tin đặt lịch' : 'Booking details'}</Text>
            <Text style={[bookingStyles.bookingInfoHeaderAction, { color: tokens.primary }]}>{language === 'vi' ? 'Kael nhớ sẵn' : 'Saved by Kael'}</Text>
          </View>
          <V21Card style={[rootStyles.formCard, bookingStyles.bookingInfoCard, isWideBookingForm ? bookingStyles.bookingInfoCardWide : null]} testID="customer-v21-booking-info-card">
            <View
              pointerEvents="none"
              style={[bookingStyles.bookingWideAuraLayer, isWideBookingForm ? bookingStyles.bookingWideHiddenAuraLayer : null]}
              testID="customer-v21-booking-info-card-skin"
            >
              <SourceCardSkin />
            </View>
            <View
              pointerEvents="none"
              style={bookingStyles.bookingInfoMintAura}
              testID="customer-v21-booking-info-card-aura-layer"
            >
              <View style={[bookingStyles.bookingWideAuraLayer, isWideBookingForm ? bookingStyles.bookingWideHiddenAuraLayer : null]}>
                <CaseWideMintAura scope="BookingInfoWide" testID="customer-v21-booking-info-card-wide-mint-aura" />
                <ZipMintAura scope="BookingInfoFine" testID="customer-v21-booking-info-card-mint-aura" />
              </View>
            </View>
            <View style={[bookingStyles.bookingField, isWideBookingForm ? bookingStyles.bookingFieldWide : null]}>
              <Text style={[bookingStyles.bookingFieldLabel, isWideBookingForm ? bookingStyles.bookingWideFieldLabel : null, { color: tokens.text }]}>{language === 'vi' ? 'Địa điểm' : 'Location'}</Text>
              <View
                style={[
                  bookingStyles.bookingInputRow,
                  isWideBookingForm ? bookingStyles.bookingWideInputRow : null,
                  addressUsesMultiline ? bookingStyles.bookingInputRowMultiline : null,
                  { backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.base : tokens.raised, borderColor: tokens.border },
                ]}
                testID="customer-v21-booking-address-row"
              >
                <View style={[bookingStyles.bookingInlineIconShell, isWideBookingForm ? bookingStyles.bookingWideInlineIconShell : null, { backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.ghost : '#E7F6F2' }]}>
                  <BookingFormGlyph color={tokens.primary} kind="pin" size={isWideBookingForm ? 27 : 18} />
                </View>
                <KaelTextField
                  inputShellStyle={bookingStyles.bookingInlineTextFieldShell}
                  accessibilityLabel={language === 'vi' ? 'Khu vực căn hộ' : 'Apartment area'}
                  multiline={addressUsesMultiline}
                  onChangeText={onAddressChange}
                  onFocus={onAddressFocus}
                  placeholder={language === 'vi' ? 'Ví dụ: Tòa A, Quận 7' : 'Example: Tower A, District 7'}
                  placeholderTextColor={tokens.subtleText}
                  scrollEnabled={false}
                  shellStyle={bookingStyles.bookingInlineTextFieldStack}
                  style={[
                    bookingStyles.bookingInlineInput,
                    isWideBookingForm ? bookingStyles.bookingWideInlineInput : null,
                    addressUsesMultiline ? bookingStyles.bookingInlineInputMultiline : null,
                    textInputNoOutlineStyle,
                    hiddenTextInputScrollbarStyle,
                    { color: tokens.text },
                  ]}
                  testID="customer-v21-booking-address"
                  textAlignVertical="center"
                  value={address}
                />
                <Text accessibilityElementsHidden style={[bookingStyles.bookingInlineChevron, { color: tokens.muted }]}>›</Text>
              </View>
              {addressLookupOpen && (addressLookupPending || addressSuggestions.length > 0 || addressFallbackUsed) ? (
                <View style={[bookingStyles.bookingAddressSuggestions, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]} testID="customer-v21-booking-address-suggestions">
                  {addressLookupPending ? (
                    <Text style={[bookingStyles.bookingAddressLookupText, { color: tokens.muted }]} testID="customer-v21-booking-address-loading">
                      {language === 'vi' ? 'Đang tìm' : 'Searching'}
                    </Text>
                  ) : addressSuggestions.length > 0 ? (
                    addressSuggestions.map((suggestion, index) => (
                      <Pressable
                        accessibilityRole="button"
                        key={suggestion.place_id}
                        onPress={() => onAddressSuggestionPress(suggestion)}
                        style={({ pressed }) => [
                          bookingStyles.bookingAddressSuggestionButton,
                          { borderBottomColor: tokens.border },
                          pressed ? rootStyles.pressed : null,
                        ]}
                        testID={`customer-v21-booking-address-suggestion-${index}`}
                      >
                        <Text numberOfLines={1} style={[bookingStyles.bookingAddressSuggestionTitle, { color: tokens.text }]}>
                          {suggestion.main_text}
                        </Text>
                        {suggestion.secondary_text ? (
                          <Text numberOfLines={1} style={[bookingStyles.bookingAddressSuggestionSubtitle, { color: tokens.muted }]}>
                            {suggestion.secondary_text}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[bookingStyles.bookingAddressLookupText, { color: tokens.muted }]} testID="customer-v21-booking-address-fallback">
                      {language === 'vi' ? 'Chưa có gợi ý' : 'No suggestions'}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
            <View style={[bookingStyles.bookingField, isWideBookingForm ? bookingStyles.bookingFieldWide : null]}>
              <Text style={[bookingStyles.bookingFieldLabel, isWideBookingForm ? bookingStyles.bookingWideFieldLabel : null, { color: tokens.text }]}>{language === 'vi' ? 'Thời gian mong muốn' : 'Preferred time'}</Text>
              <View style={[bookingStyles.bookingSchedulePanel, isWideBookingForm ? bookingStyles.bookingWideSchedulePanel : null, { backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.base : 'rgba(255,255,255,0.68)', borderColor: tokens.border }]} testID="customer-v21-booking-schedule-panel">
                <BookingFormulaMintAura
                  includeSkin={tokens.mode !== 'dark'}
                  quiet={isWideBookingForm}
                  scope="BookingSchedule"
                  testIDPrefix="customer-v21-booking-schedule"
                />
                <View style={bookingStyles.bookingScheduleContent}>
                <View style={[bookingStyles.bookingScheduleHeader, isWideBookingForm ? bookingStyles.bookingWideScheduleHeader : null]}>
                  <View style={[bookingStyles.bookingInlineIconShell, isWideBookingForm ? bookingStyles.bookingWideInlineIconShell : null, { backgroundColor: isWideBookingForm ? 'transparent' : tokens.mode === 'dark' ? tokens.ghost : '#E7F6F2' }]}>
                    <BookingFormGlyph color={tokens.primary} kind="calendar" size={isWideBookingForm ? 27 : 18} />
                  </View>
                  <Text numberOfLines={1} style={[bookingStyles.bookingReadonlyText, isWideBookingForm ? bookingStyles.bookingWideReadonlyText : null, { color: scheduleLabel ? tokens.text : tokens.muted }]} testID="customer-v21-booking-schedule-summary">
                    {scheduleLabel ?? (language === 'vi' ? 'Chưa chọn' : 'Not selected')}
                  </Text>
                  <Text accessibilityElementsHidden style={[bookingStyles.bookingInlineChevron, { color: tokens.muted }]}>⌄</Text>
                </View>
                <View style={isWideBookingForm ? bookingStyles.bookingWideScheduleRow : null}>
                  <View style={isWideBookingForm ? bookingStyles.bookingWideScheduleMain : null}>
                    {dateGridNode}
                  </View>
                  {isWideBookingForm ? <View style={bookingStyles.bookingWideCustomScheduleColumn}>{customDateFieldNode}</View> : null}
                </View>
                {!isWideBookingForm ? customDateFieldNode : null}
                <View style={isWideBookingForm ? [bookingStyles.bookingWideScheduleRow, bookingStyles.bookingWideScheduleRowSpaced] : null}>
                  <View style={isWideBookingForm ? bookingStyles.bookingWideScheduleMain : null}>
                    {timeStartNode}
                    {timeGridNode}
                  </View>
                  {isWideBookingForm ? <View style={bookingStyles.bookingWideCustomScheduleColumn}>{customTimeFieldNode}</View> : null}
                </View>
                {!isWideBookingForm ? (
                  <>
                    {timeStartNode}
                    {timeGridNode}
                    {customTimeFieldNode}
                  </>
                ) : null}
                </View>
              </View>
            </View>
            <View style={[bookingStyles.bookingField, isWideBookingForm ? bookingStyles.bookingFieldWide : null]}>
              {descriptionNode}
            </View>
            {selectedService ? (
              <View style={[bookingStyles.bookingField, bookingStyles.bookingProblemField]}>
                <BookingProblemChipAura reduceTransparency={reduceTransparency} />
                <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Chi tiết' : 'Details'}</Text>
                <View style={rootStyles.chipWrap}>
                  {problemOptions.map((problem) => (
                    <KaelChip
                      accessibilityState={{ selected: selectedProblems.includes(problem.value) }}
                      key={problem.value}
                      label={problem.label}
                      onPress={() => onProblemToggle(problem.value)}
                      testID={`customer-v21-problem-${problem.value}`}
                      variant={selectedProblems.includes(problem.value) ? 'selected' : 'unselected'}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          {isWideBookingForm ? (
            <>
              {error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}
              {draftSubmitNode}
            </>
          ) : null}
          </V21Card>
          {!isWideBookingForm ? (
            <>
              {error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}
              {draftSubmitNode}
            </>
          ) : null}
        </>
      ) : null}
    </>
  )
}
