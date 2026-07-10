import type { ReactNode } from 'react'
import {
  Image,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { KaelButton, KaelChip, KaelTextField, KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { CUSTOMER_SERVICE_IDS, type CustomerServiceId } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from './aura-surfaces'
import { customerV21Assets, customerV21BookingServiceAssets } from './assets'
import { BookingDraftButtonAura, BookingProblemChipAura, BookingSearchMintBorder, BookingSuggestedChipAura } from './aura-surfaces'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, EmptyState, ProgressRail, SectionActionHeader, ServiceTile, V21Card, V21TopBar } from './shared-surfaces'

type BookingSearchSuggestionView = {
  key: string
  label: string
  problem?: string
  selected: boolean
  serviceType: CustomerServiceId
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
  searchShell: StyleProp<ViewStyle>
  searchText: StyleProp<TextStyle>
  selectedServiceCard: StyleProp<ViewStyle>
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
  bookingSourceSearchShadowStyle,
  bookingSearchInputColor,
  chatPlaceholder,
  createDraftLabel,
  dataPendingLabel,
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
  onDescriptionChange,
  onProblemToggle,
  onResetSelectedService,
  onScheduleDateSelect,
  onScheduleTimeSelect,
  onSearchQueryChange,
  onSearchSuggestionPress,
  onServiceSelect,
  onSubmit,
  performanceIntakeNode,
  problemOptions,
  reduceTransparency,
  rootStyles,
  scheduleDateOptions,
  scheduleLabel,
  searchSuggestions,
  selectedProblems,
  selectedScheduleDate,
  selectedScheduleTime,
  selectedService,
  selectedServiceCopy,
  serviceSearchQuery,
  textInputNoOutlineStyle,
  timeSlots,
  tokens,
  usesPerformanceIntake,
  submitDisabled = false,
}: {
  address: string
  addressFallbackUsed: boolean
  addressLookupOpen: boolean
  addressLookupPending: boolean
  addressSuggestions: BookingAddressSuggestionView[]
  addressUsesMultiline: boolean
  bookingSearchInputColor: string
  bookingSourceSearchShadowStyle: StyleProp<ViewStyle>
  chatPlaceholder: string
  createDraftLabel: string
  dataPendingLabel: string
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
  onDescriptionChange: (value: string) => void
  onProblemToggle: (problem: string) => void
  onResetSelectedService: () => void
  onScheduleDateSelect: (value: string) => void
  onScheduleTimeSelect: (value: string) => void
  onSearchQueryChange: (value: string) => void
  onSearchSuggestionPress: (suggestion: BookingSearchSuggestionView) => void
  onServiceSelect: (service: CustomerServiceId) => void
  onSubmit: () => void
  performanceIntakeNode?: ReactNode
  problemOptions: string[]
  reduceTransparency: boolean
  rootStyles: RootBookingStyles
  scheduleDateOptions: BookingScheduleDateOptionView[]
  scheduleLabel: string | null
  searchSuggestions: BookingSearchSuggestionView[]
  selectedProblems: string[]
  selectedScheduleDate: string | null
  selectedScheduleTime: string | null
  selectedService: CustomerServiceId | null
  selectedServiceCopy: { label: string; note: string } | null
  serviceSearchQuery: string
  textInputNoOutlineStyle: StyleProp<TextStyle>
  timeSlots: readonly string[]
  tokens: CustomerThemeTokens
  usesPerformanceIntake: boolean
  submitDisabled?: boolean
}) {
  return (
    <>
      <V21TopBar
        actionLabel="≡"
        onBack={onBack}
        subtitle={isMediaScreen ? (language === 'vi' ? 'Bước 2/4 · dữ liệu chờ công việc thật' : 'Step 2/4 · data waits for a real job') : (language === 'vi' ? 'Kael sẽ dẫn bạn theo từng bước' : 'Kael guides each step')}
        title={isMediaScreen ? (language === 'vi' ? 'Kael thu thập hiện trạng' : 'Kael collects current state') : (language === 'vi' ? 'Tạo yêu cầu dịch vụ' : 'Create service request')}
      />

      {!isMediaScreen ? (
        <V21Card glass style={[rootStyles.stepCard, bookingStyles.bookingSourceStepCard]} testID="customer-v21-services-hero">
          <SourceCardSkin testID="customer-v21-booking-step-card-skin" />
          <View style={sharedStyles.rowBetween}>
            <Text style={[rootStyles.stepLabel, { color: tokens.text }]}>{language === 'vi' ? 'Bước 1/4 · Chọn dịch vụ' : 'Step 1/4 · Choose service'}</Text>
            <Text style={[rootStyles.stepBadge, { color: tokens.primary }]}>{language === 'vi' ? 'Kael hỗ trợ' : 'Kael assisted'}</Text>
          </View>
          <ProgressRail activeStep={1} style={bookingStyles.bookingProgressRail} testID="customer-v21-booking-progress" tokens={tokens} />
        </V21Card>
      ) : null}

      {isMediaScreen ? mediaPanelNode : null}
      {isMediaScreen && error ? <Text style={[rootStyles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}

      {!isMediaScreen ? (
        <View style={[rootStyles.searchShell, bookingStyles.bookingSourceSearch, bookingSourceSearchShadowStyle, { backgroundColor: 'transparent', borderColor: 'rgba(13,174,154,0.64)' }]}>
          <SourceCardSkin testID="customer-v21-booking-search-source" />
          <BookingSearchMintBorder reduceTransparency={reduceTransparency} />
          <Image
            resizeMode="contain"
            source={customerV21Assets.request}
            style={bookingStyles.bookingSearchImageIcon}
            testID="customer-v21-booking-search-icon"
          />
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Tìm dịch vụ hoặc vấn đề' : 'Search services or issues'}
            onChangeText={onSearchQueryChange}
            placeholder={selectedService
              ? (language === 'vi' ? 'Tìm vấn đề: ống, vòi, toilet...' : 'Find an issue: pipe, faucet, toilet...')
              : (language === 'vi' ? 'Chọn dịch vụ hoặc gợi ý bên dưới...' : 'Pick a service or suggestion below...')}
            placeholderTextColor={tokens.muted}
            returnKeyType="search"
            style={[rootStyles.searchText, textInputNoOutlineStyle, { color: bookingSearchInputColor }]}
            testID="customer-v21-booking-search-input"
            value={serviceSearchQuery}
          />
        </View>
      ) : null}
      {!isMediaScreen ? (
        <View style={bookingStyles.bookingSearchSuggestionPanel} testID="customer-v21-booking-search-suggestions">
          <Text style={[bookingStyles.bookingSearchSuggestionTitle, { color: tokens.primary }]}>
            {selectedService ? (language === 'vi' ? 'Có thể đặt' : 'You can book') : (language === 'vi' ? 'Gợi ý đặt' : 'Suggestions')}
          </Text>
          <View style={bookingStyles.bookingSearchSuggestionRow}>
            {searchSuggestions.map((suggestion, index) => (
              <KaelChip
                accessibilityState={{ selected: suggestion.selected }}
                key={suggestion.key}
                label={suggestion.label}
                onPress={() => onSearchSuggestionPress(suggestion)}
                testID={`customer-v21-booking-search-suggestion-${index}`}
                variant={suggestion.selected ? 'selected' : 'unselected'}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!isMediaScreen ? (
        <>
          <SectionActionHeader
            action={selectedService ? (language === 'vi' ? 'Thay đổi' : 'Change') : undefined}
            onAction={selectedService ? onResetSelectedService : undefined}
            title={selectedService ? (language === 'vi' ? 'Dịch vụ đã chọn' : 'Selected service') : (language === 'vi' ? 'Chọn dịch vụ' : 'Choose service')}
          />
          {selectedService && selectedServiceCopy ? (
            <V21Card style={[rootStyles.selectedServiceCard, bookingStyles.bookingSelectedServiceCard]} testID="customer-v21-selected-service">
              <SourceCardSkin testID="customer-v21-booking-selected-card-skin" />
              <AssetTile image={customerV21BookingServiceAssets[selectedService]} label={selectedServiceCopy.label} size={44} sourceAura />
              <View style={rootStyles.flex}>
                <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{selectedServiceCopy.label}</Text>
                <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>{selectedServiceCopy.note}</Text>
                <View style={sharedStyles.heroChipRow}>
                  <View style={bookingStyles.bookingSuggestedChipFrame}>
                    <BookingSuggestedChipAura reduceTransparency={reduceTransparency} />
                    <KaelChip label={language === 'vi' ? 'Đề xuất bởi Kael' : 'Suggested by Kael'} style={bookingStyles.bookingSuggestedChip} variant="selected" />
                  </View>
                  <KaelChip label={dataPendingLabel} variant="unselected" />
                </View>
              </View>
            </V21Card>
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
                <Image resizeMode="contain" source={customerV21Assets.map} style={bookingStyles.bookingInlineIcon} />
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
              <View style={[bookingStyles.bookingSchedulePanel, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]} testID="customer-v21-booking-schedule-panel">
                <View style={bookingStyles.bookingScheduleHeader}>
                  <Image resizeMode="contain" source={customerV21Assets.booking} style={bookingStyles.bookingInlineIcon} />
                  <Text numberOfLines={1} style={[bookingStyles.bookingReadonlyText, { color: scheduleLabel ? tokens.text : tokens.muted }]} testID="customer-v21-booking-schedule-summary">
                    {scheduleLabel ?? (language === 'vi' ? 'Chưa chọn' : 'Not selected')}
                  </Text>
                </View>
                <View style={bookingStyles.bookingDateGrid}>
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
                            backgroundColor: selected ? tokens.service : tokens.ghost,
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
                <View style={bookingStyles.bookingTimeGrid}>
                  {timeSlots.map((slot, index) => {
                    const selected = selectedScheduleTime === slot
                    return (
                      <KaelChip
                        key={slot}
                        label={slot}
                        onPress={() => onScheduleTimeSelect(slot)}
                        testID={`customer-v21-booking-time-${index}`}
                        variant={selected ? 'selected' : 'unselected'}
                      />
                    )
                  })}
                </View>
              </View>
            </View>
            {usesPerformanceIntake ? performanceIntakeNode : (
              <View style={bookingStyles.bookingField}>
                <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Mô tả sự cố' : 'Issue description'}</Text>
                <KaelTextField
                  inputShellStyle={[bookingStyles.bookingDescriptionInputShell, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]}
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
            )}
            {selectedService && !usesPerformanceIntake ? (
              <View style={[bookingStyles.bookingField, bookingStyles.bookingProblemField]}>
                <BookingProblemChipAura reduceTransparency={reduceTransparency} />
                <Text style={[bookingStyles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Chi tiết' : 'Details'}</Text>
                <View style={rootStyles.chipWrap}>
                  {problemOptions.map((problem) => (
                    <KaelChip
                      key={problem}
                      label={problem}
                      onPress={() => onProblemToggle(problem)}
                      testID={`customer-v21-problem-${problem}`}
                      variant={selectedProblems.includes(problem) ? 'selected' : 'unselected'}
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
