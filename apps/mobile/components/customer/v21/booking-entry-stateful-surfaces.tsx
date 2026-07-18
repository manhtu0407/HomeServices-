import { useMemo, type ReactNode } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text,
  View,
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
} from './aura-surfaces'
import { customerV21Assets } from './assets'
import { availableBookingTimeSlots } from './booking-intake-display-model'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, EmptyState, ProgressRail, SectionActionHeader, ServiceTile, V21Card, V21TopBar } from './shared-surfaces'

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

function BookingFormulaMintAura({
  includeSkin = false,
  scope,
  testIDPrefix,
}: {
  includeSkin?: boolean
  scope: string
  testIDPrefix: string
}) {
  return (
    <View pointerEvents="none" style={bookingStyles.bookingFormulaMintAura}>
      {includeSkin ? <SourceCardSkin testID={`${testIDPrefix}-card-skin`} /> : null}
      <CaseWideMintAura
        intensity="strong"
        scope={`${scope}Wide`}
        testID={`${testIDPrefix}-wide-mint-aura`}
      />
      <ZipMintAura scope={`${scope}Fine`} testID={`${testIDPrefix}-mint-aura`} />
    </View>
  )
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
  const timeSlotAuraLayers = useMemo(
    () => timeSlots.map((slot, index) => (
      <CaseWideMintAura
        intensity="strong"
        key={`booking-start-time-aura-${slot}`}
        scope={`BookingStartTime${slot.replace(':', '')}`}
        testID={`customer-v21-booking-time-${index}-mint-aura`}
      />
    )),
    [timeSlots],
  )
  const availableTimeSlots = availableBookingTimeSlots(
    selectedScheduleDate,
    new Date(scheduleRuntimeNow),
  )
  const availableTimeSlotSet = new Set<string>(availableTimeSlots)
  return (
    <>
      <V21TopBar
        onBack={onBack}
        subtitle={isMediaScreen ? (language === 'vi' ? 'Bước 2/4 · dữ liệu chờ công việc thật' : 'Step 2/4 · data waits for a real job') : (language === 'vi' ? 'Kael sẽ dẫn bạn theo từng bước' : 'Kael guides each step')}
        title={isMediaScreen ? (language === 'vi' ? 'Kael thu thập hiện trạng' : 'Kael collects current state') : (language === 'vi' ? 'Tạo yêu cầu dịch vụ' : 'Create service request')}
      />

      {!isMediaScreen ? (
        <V21Card glass style={[rootStyles.stepCard, bookingStyles.bookingSourceStepCard]} testID="customer-v21-services-hero">
          <SourceCardSkin testID="customer-v21-booking-step-card-skin" />
          <BookingFormulaMintAura
            scope="BookingStep"
            testIDPrefix="customer-v21-booking-step"
          />
          <View style={bookingStyles.bookingSourceStepContent}>
            <View style={sharedStyles.rowBetween}>
              <Text style={[rootStyles.stepLabel, { color: tokens.text }]}>{language === 'vi' ? 'Bước 1/4 · Chọn dịch vụ' : 'Step 1/4 · Choose service'}</Text>
              <Text style={[rootStyles.stepBadge, { color: tokens.primary }]}>{language === 'vi' ? 'Kael hỗ trợ' : 'Kael assisted'}</Text>
            </View>
            <ProgressRail activeStep={1} style={bookingStyles.bookingProgressRail} testID="customer-v21-booking-progress" tokens={tokens} />
          </View>
        </V21Card>
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
            <View style={bookingStyles.bookingSelectedServiceFrame}>
              <ServiceTile
                fullWidth
                homeAura
                selected
                service={selectedService}
                testID="customer-v21-selected-service"
              />
            </View>
          ) : null}
          {!selectedService ? (
            <View style={[sharedStyles.serviceGrid, bookingStyles.bookingServiceGrid]}>
              {CUSTOMER_SERVICE_IDS.map((service) => (
                <ServiceTile
                  homeAura
                  key={service}
                  onPress={() => onServiceSelect(service)}
                  selected={selectedService === service}
                  service={service}
                />
              ))}
            </View>
          ) : null}

          <SectionActionHeader
            action={language === 'vi' ? 'Kael nhớ sẵn' : 'Saved by Kael'}
            title={language === 'vi' ? 'Thông tin đặt lịch' : 'Booking details'}
          />
          <V21Card style={[rootStyles.formCard, bookingStyles.bookingInfoCard]} testID="customer-v21-booking-info-card">
            <SourceCardSkin testID="customer-v21-booking-info-card-skin" />
            <View
              pointerEvents="none"
              style={bookingStyles.bookingInfoMintAura}
              testID="customer-v21-booking-info-card-aura-layer"
            >
              <CaseWideMintAura scope="BookingInfoWide" testID="customer-v21-booking-info-card-wide-mint-aura" />
              <ZipMintAura scope="BookingInfoFine" testID="customer-v21-booking-info-card-mint-aura" />
            </View>
            <View style={bookingStyles.bookingField}>
              <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Địa điểm' : 'Location'}</Text>
              <View
                style={[
                  bookingStyles.bookingInputRow,
                  addressUsesMultiline ? bookingStyles.bookingInputRowMultiline : null,
                  { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border },
                ]}
                testID="customer-v21-booking-address-row"
              >
                <Image contentFit="contain" source={customerV21Assets.map} style={bookingStyles.bookingInlineIcon} />
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
                    addressUsesMultiline ? bookingStyles.bookingInlineInputMultiline : null,
                    textInputNoOutlineStyle,
                    hiddenTextInputScrollbarStyle,
                    { color: tokens.text },
                  ]}
                  testID="customer-v21-booking-address"
                  textAlignVertical="center"
                  value={address}
                />
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
            <View style={bookingStyles.bookingField}>
              <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Thời gian mong muốn' : 'Preferred time'}</Text>
              <View style={[bookingStyles.bookingSchedulePanel, { backgroundColor: tokens.mode === 'dark' ? tokens.base : 'rgba(255,255,255,0.68)', borderColor: tokens.border }]} testID="customer-v21-booking-schedule-panel">
                <BookingFormulaMintAura
                  includeSkin={tokens.mode !== 'dark'}
                  scope="BookingSchedule"
                  testIDPrefix="customer-v21-booking-schedule"
                />
                <View style={bookingStyles.bookingScheduleContent}>
                <View style={bookingStyles.bookingScheduleHeader}>
                  <Image contentFit="contain" source={customerV21Assets.booking} style={bookingStyles.bookingInlineIcon} />
                  <Text numberOfLines={1} style={[bookingStyles.bookingReadonlyText, { color: scheduleLabel ? tokens.text : tokens.muted }]} testID="customer-v21-booking-schedule-summary">
                    {scheduleLabel ?? (language === 'vi' ? 'Chưa chọn' : 'Not selected')}
                  </Text>
                </View>
                <View style={bookingStyles.bookingDateGrid}>
                  <CaseWideMintAura
                    intensity="strong"
                    scope="BookingDateGrid"
                    testID="customer-v21-booking-date-grid-mint-aura"
                  />
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
                          {
                            backgroundColor: selected
                              ? tokens.service
                              : tokens.mode === 'dark'
                                ? tokens.ghost
                                : 'rgba(255,255,255,0.72)',
                            borderColor: selected ? tokens.primary : tokens.border,
                          },
                        ]}
                        testID={`customer-v21-booking-date-${index}`}
                      >
                        <Text numberOfLines={1} style={[bookingStyles.bookingDateDay, { color: selected ? tokens.primary : tokens.muted }]}>{option.dayLabel}</Text>
                        <Text numberOfLines={1} style={[bookingStyles.bookingDateValue, { color: selected ? tokens.primary : tokens.text }]}>{option.dateLabel}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                <View style={bookingStyles.bookingCustomScheduleField}>
                  <Text style={[bookingStyles.bookingCustomScheduleLabel, { color: tokens.text }]}>
                    {language === 'vi' ? 'Ngày khác' : 'Another date'}
                  </Text>
                  <KaelTextField
                    inputShellAdornment={(
                      <BookingFormulaMintAura
                        scope="BookingCustomDate"
                        testIDPrefix="customer-v21-booking-custom-date"
                      />
                    )}
                    inputShellStyle={[
                      bookingStyles.bookingCustomScheduleInputShell,
                      {
                        backgroundColor: tokens.mode === 'dark' ? tokens.ghost : 'rgba(255,255,255,0.72)',
                        borderColor: customScheduleDateInput && selectedScheduleDate ? tokens.primary : tokens.border,
                      },
                    ]}
                    accessibilityLabel={language === 'vi' ? 'Nhập ngày muốn đặt' : 'Enter desired date'}
                    accessibilityHint={customScheduleDateError ?? (language === 'vi' ? 'Định dạng ngày tháng năm' : 'Day month year format')}
                    keyboardType="number-pad"
                    maxLength={10}
                    onChangeText={onCustomScheduleDateChange}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={tokens.subtleText}
                    style={[bookingStyles.bookingCustomScheduleInput, textInputNoOutlineStyle, { color: tokens.text }]}
                    testID="customer-v21-booking-custom-date"
                    value={customScheduleDateInput}
                  />
                  <Text
                    style={[bookingStyles.bookingCustomScheduleHint, { color: customScheduleDateError ? tokens.primary : tokens.muted }]}
                    testID={customScheduleDateError ? 'customer-v21-booking-custom-date-error' : undefined}
                  >
                    {customScheduleDateError ?? (language === 'vi' ? 'Nhập ngày mong muốn nếu lịch nằm sau 7 ngày.' : 'Enter a desired date when it is more than 7 days away.')}
                  </Text>
                </View>
                <View style={bookingStyles.bookingTimeStartSection}>
                  <Text style={[bookingStyles.bookingCustomScheduleHint, { color: tokens.muted, fontWeight: '700' }]}>
                    {language === 'vi'
                      ? 'Chọn giờ bạn muốn dịch vụ bắt đầu.'
                      : 'Choose when you want the service to start.'}
                  </Text>
                </View>
                <View style={bookingStyles.bookingTimeGrid}>
                  {timeSlots.map((slot, index) => {
                    const selected = selectedScheduleTime === slot
                    const unavailable = !availableTimeSlotSet.has(slot)
                    return (
                      <KaelChip
                        accessibilityState={{ selected }}
                        backgroundLayer={timeSlotAuraLayers[index]}
                        disabled={unavailable}
                        key={slot}
                        label={slot}
                        onPress={() => onScheduleTimeSelect(slot)}
                        style={{
                          backgroundColor: selected
                            ? tokens.service
                            : tokens.mode === 'dark'
                              ? tokens.ghost
                              : 'rgba(255,255,255,0.72)',
                          borderColor: selected ? tokens.primary : tokens.border,
                        }}
                        testID={`customer-v21-booking-time-${index}`}
                        variant={selected ? 'selected' : 'unselected'}
                      />
                    )
                  })}
                </View>
                <View style={bookingStyles.bookingCustomScheduleField}>
                  <Text style={[bookingStyles.bookingCustomScheduleLabel, { color: tokens.text }]}>
                    {language === 'vi' ? 'Giờ khác' : 'Another start time'}
                  </Text>
                  <KaelTextField
                    inputShellAdornment={(
                      <BookingFormulaMintAura
                        scope="BookingCustomTime"
                        testIDPrefix="customer-v21-booking-custom-time"
                      />
                    )}
                    inputShellStyle={[
                      bookingStyles.bookingCustomScheduleInputShell,
                      {
                        backgroundColor: tokens.mode === 'dark' ? tokens.ghost : 'rgba(255,255,255,0.72)',
                        borderColor: customScheduleTimeInput && selectedScheduleTime ? tokens.primary : tokens.border,
                      },
                    ]}
                    accessibilityLabel={language === 'vi' ? 'Nhập giờ bắt đầu mong muốn' : 'Enter desired start time'}
                    accessibilityHint={customScheduleTimeError ?? (language === 'vi' ? 'Định dạng giờ và phút' : 'Hour and minute format')}
                    keyboardType="number-pad"
                    maxLength={5}
                    onChangeText={onCustomScheduleTimeChange}
                    placeholder="HH:mm"
                    placeholderTextColor={tokens.subtleText}
                    style={[bookingStyles.bookingCustomScheduleInput, textInputNoOutlineStyle, { color: tokens.text }]}
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
                </View>
              </View>
            </View>
            <View style={bookingStyles.bookingField}>
                <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Mô tả sự cố' : 'Issue description'}</Text>
                <KaelTextField
                  inputShellAdornment={(
                    <BookingFormulaMintAura
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
          </V21Card>

          {error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}
          <KaelButton
            backgroundLayer={<BookingDraftButtonAura reduceTransparency={reduceTransparency} />}
            disabled={submitDisabled}
            label={createDraftLabel}
            onPress={onSubmit}
            style={bookingStyles.bookingDraftSubmitButton}
            testID="customer-v21-booking-submit"
            variant="secondary"
          />
        </>
      ) : null}
    </>
  )
}
