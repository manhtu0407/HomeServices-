import { customerAccountInfoCopy, customerCopy, customerFeedbackCopy, customerPasswordCopy, customerProfileCareCopy, customerProfileEditorCopy, customerProfileSectionCopy } from './copy'
import { styles } from './styles'
import { customerProfileCareCardSurface, customerProfileCarePillSurface, customerProfileCareStatSurface, customerProfileChromeBottomEdgeSurface, customerProfileChromeCrispShellSurface, customerProfileChromeInnerInsetSurface, customerProfileChromeTopEdgeSurface, customerProfileHeroSurface, customerProfileInputSurface, customerProfilePanelSurface, customerProfilePrimaryButtonSurface, customerProfileRowIconSurface, customerProfileRowSurface, customerProfileSecondaryButtonSurface, customerProfileVerificationSurface, customerReduceTransparency } from './surface-styles'
import { setCustomerThemeMode, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, type AppLanguage, languageDisplayName, setAppLanguage, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { customerFeedbackService } from '@/lib/services'
import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { AccountInfoField, AccountInfoGenderSegment, formatCustomerBirthDateInput, isValidCustomerBirthDate, normalizeCustomerGender, readCustomerProfileMetric } from './profile-account'
import type { CustomerAccountInfoDraft, CustomerProfileEditField } from './profile-account'
import { V4Frame } from './shell'
import { IconShell, MappedIcon, SubtleGlassHighlight, formatVnd, localizedProfileName, readCustomerMetadataString, useCustomerTokens } from './ui'
import type { IconName } from './ui'

export function CustomerProfileSurface() {
  const { session, signOut, updateCustomerProfile, updatePassword } = useAuth()
  const themeMode = useCustomerThemeMode()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const profileEditorCopy = customerProfileEditorCopy[languageMode]
  const { reduceMotion } = useGlassAccessibility()
  const [profileEditorField, setProfileEditorField] = useState<CustomerProfileEditField | null>(null)
  const [profileEditorValue, setProfileEditorValue] = useState('')
  const [profileEditorError, setProfileEditorError] = useState<string | null>(null)
  const [profileEditorSaving, setProfileEditorSaving] = useState(false)
  const [accountInfoOpen, setAccountInfoOpen] = useState(false)
  const [accountInfoDraft, setAccountInfoDraft] = useState<CustomerAccountInfoDraft>({
    birthDate: '',
    email: '',
    fullName: '',
    gender: '',
    phone: '',
    salutation: '',
  })
  const [accountInfoError, setAccountInfoError] = useState<string | null>(null)
  const [accountInfoSaving, setAccountInfoSaving] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackValue, setFeedbackValue] = useState('')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordUpdated, setPasswordUpdated] = useState(false)
  const toggleLanguage = () => setAppLanguage(languageMode === 'vi' ? 'en' : 'vi')
  const toggleTheme = () => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawNickname = readCustomerMetadataString(customerMetadata, 'nickname', 'preferred_name')
  const rawFullName = readCustomerMetadataString(customerMetadata, 'full_name', 'name')
  const rawPhone = readCustomerMetadataString(customerMetadata, 'phone_number', 'phone')
  const rawAddress = readCustomerMetadataString(customerMetadata, 'default_address')
  const rawSalutation = readCustomerMetadataString(customerMetadata, 'salutation')
  const rawGender = readCustomerMetadataString(customerMetadata, 'gender')
  const rawBirthDate = readCustomerMetadataString(customerMetadata, 'birth_date', 'birthDate')
  const rawEmail = readCustomerMetadataString(customerMetadata, 'contact_email', 'email') || session?.user.email?.trim() || ''
  const kaelInteractionCount = readCustomerProfileMetric(customerMetadata.kael_interaction_count ?? customerMetadata.kaelInteractions)
  const completedServiceCount = readCustomerProfileMetric(customerMetadata.completed_service_count ?? customerMetadata.completedServices)
  const priceSavingsVnd = readCustomerProfileMetric(customerMetadata.price_savings_vnd ?? customerMetadata.priceSavingsVnd)
  const closeProfileEditor = useCallback(() => {
    if (profileEditorSaving) return
    setProfileEditorField(null)
    setProfileEditorValue('')
    setProfileEditorError(null)
  }, [profileEditorSaving])
  const openProfileEditor = useCallback((field: CustomerProfileEditField) => {
    setProfileEditorField(field)
    setProfileEditorError(null)
    setProfileEditorValue(field === 'nickname' ? rawNickname : rawAddress)
  }, [rawAddress, rawNickname])
  const submitProfileEditor = useCallback(async () => {
    if (!profileEditorField || profileEditorSaving) return

    const value = profileEditorValue.trim()
    const fieldCopy = profileEditorCopy[profileEditorField]
    const validValue = profileEditorField === 'nickname'
      ? value.length >= 2 && value.length <= 80
      : value.length >= 6 && value.length <= 180

    if (!validValue) {
      setProfileEditorError(fieldCopy.error)
      return
    }

    setProfileEditorSaving(true)
    setProfileEditorError(null)
    try {
      const payload = profileEditorField === 'nickname'
        ? { nickname: value }
        : { defaultAddress: value }
      const result = await updateCustomerProfile(payload)
      if (!result.success) {
        setProfileEditorError(result.error ?? profileEditorCopy.saveError)
        return
      }

      setProfileEditorField(null)
      setProfileEditorValue('')
    } catch {
      setProfileEditorError(profileEditorCopy.saveError)
    } finally {
      setProfileEditorSaving(false)
    }
  }, [profileEditorCopy, profileEditorField, profileEditorSaving, profileEditorValue, updateCustomerProfile])
  const accountInfoCopy = customerAccountInfoCopy[languageMode]
  const feedbackCopy = customerFeedbackCopy[languageMode]
  const passwordCopy = customerPasswordCopy[languageMode]
  const openAccountInfo = useCallback(() => {
    setAccountInfoDraft({
      birthDate: formatCustomerBirthDateInput(rawBirthDate),
      email: rawEmail,
      fullName: rawFullName,
      gender: normalizeCustomerGender(rawGender),
      phone: rawPhone,
      salutation: rawSalutation,
    })
    setAccountInfoError(null)
    setAccountInfoOpen(true)
  }, [rawBirthDate, rawEmail, rawFullName, rawGender, rawPhone, rawSalutation])
  const closeAccountInfo = useCallback(() => {
    if (accountInfoSaving) return
    setAccountInfoOpen(false)
    setAccountInfoError(null)
  }, [accountInfoSaving])
  const updateAccountInfoDraft = useCallback((field: keyof CustomerAccountInfoDraft, value: string) => {
    setAccountInfoDraft((current) => ({ ...current, [field]: value }))
    if (accountInfoError) setAccountInfoError(null)
  }, [accountInfoError])
  const submitAccountInfo = useCallback(async () => {
    if (accountInfoSaving) return

    const fullName = accountInfoDraft.fullName.trim()
    const phone = accountInfoDraft.phone.trim()
    const email = accountInfoDraft.email.trim()
    const salutation = accountInfoDraft.salutation.trim()
    const gender = accountInfoDraft.gender.trim()
    const birthDate = accountInfoDraft.birthDate.trim()
    const phoneDigits = phone.replace(/\D/g, '')
    const hasAnyValue = Boolean(fullName || phone || email || salutation || gender || birthDate)

    if (!hasAnyValue) {
      setAccountInfoError(accountInfoCopy.fieldRequired)
      return
    }
    if (fullName && (fullName.length < 2 || fullName.length > 80)) {
      setAccountInfoError(accountInfoCopy.fullNameInvalid)
      return
    }
    if (salutation.length > 40) {
      setAccountInfoError(accountInfoCopy.shortFieldInvalid)
      return
    }
    if (gender && !normalizeCustomerGender(gender)) {
      setAccountInfoError(accountInfoCopy.shortFieldInvalid)
      return
    }
    if (birthDate && !isValidCustomerBirthDate(birthDate)) {
      setAccountInfoError(accountInfoCopy.birthDateInvalid)
      return
    }
    if (phone && (phoneDigits.length < 9 || phoneDigits.length > 12 || !/^[+0-9().\-\s]+$/.test(phone))) {
      setAccountInfoError(accountInfoCopy.phoneInvalid)
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountInfoError(accountInfoCopy.emailInvalid)
      return
    }

    setAccountInfoSaving(true)
    setAccountInfoError(null)
    try {
      const result = await updateCustomerProfile({
        birthDate: birthDate || undefined,
        email: email || undefined,
        fullName: fullName || undefined,
        gender: gender || undefined,
        phone: phone || undefined,
        salutation: salutation || undefined,
      })
      if (!result.success) {
        setAccountInfoError(result.error ?? accountInfoCopy.saveError)
        return
      }

      setAccountInfoOpen(false)
    } catch {
      setAccountInfoError(accountInfoCopy.saveError)
    } finally {
      setAccountInfoSaving(false)
    }
  }, [accountInfoCopy, accountInfoDraft, accountInfoSaving, updateCustomerProfile])
  const openFeedback = useCallback(() => {
    setFeedbackValue('')
    setFeedbackError(null)
    setFeedbackOpen(true)
  }, [])
  const closeFeedback = useCallback(() => {
    if (feedbackSaving) return
    setFeedbackOpen(false)
    setFeedbackError(null)
  }, [feedbackSaving])
  const submitFeedback = useCallback(async () => {
    if (feedbackSaving) return
    const message = feedbackValue.trim()

    if (message.length < 8 || message.length > 1200) {
      setFeedbackError(feedbackCopy.errorRequired)
      return
    }

    setFeedbackSaving(true)
    setFeedbackError(null)
    try {
      const result = await customerFeedbackService.submit({
        language: languageMode,
        message,
        source: 'profile',
      })
      if (!result.success) {
        setFeedbackError(result.error || feedbackCopy.saveError)
        return
      }

      setFeedbackSent(true)
      setFeedbackOpen(false)
      setFeedbackValue('')
    } catch {
      setFeedbackError(feedbackCopy.saveError)
    } finally {
      setFeedbackSaving(false)
    }
  }, [feedbackCopy, feedbackSaving, feedbackValue, languageMode])
  const openPasswordSheet = useCallback(() => {
    setPasswordCurrent('')
    setPasswordValue('')
    setPasswordConfirm('')
    setPasswordError(null)
    setPasswordOpen(true)
  }, [])
  const closePasswordSheet = useCallback(() => {
    if (passwordSaving) return
    setPasswordOpen(false)
    setPasswordError(null)
  }, [passwordSaving])
  const submitPassword = useCallback(async () => {
    if (passwordSaving) return

    if (!passwordCurrent) {
      setPasswordError(passwordCopy.currentRequiredError)
      return
    }
    if (passwordValue.length < 8 || passwordValue.length > 72) {
      setPasswordError(passwordCopy.shortError)
      return
    }
    if (passwordValue !== passwordConfirm) {
      setPasswordError(passwordCopy.mismatchError)
      return
    }

    setPasswordSaving(true)
    setPasswordError(null)
    try {
      const result = await updatePassword({
        currentPassword: passwordCurrent,
        newPassword: passwordValue,
      })
      if (!result.success) {
        setPasswordError(result.error || passwordCopy.saveError)
        return
      }

      setPasswordUpdated(true)
      setPasswordOpen(false)
      setPasswordCurrent('')
      setPasswordValue('')
      setPasswordConfirm('')
    } catch {
      setPasswordError(passwordCopy.saveError)
    } finally {
      setPasswordSaving(false)
    }
  }, [passwordConfirm, passwordCopy, passwordCurrent, passwordSaving, passwordValue, updatePassword])
  const profileNickname = localizedProfileName(rawNickname, languageMode) || appCopy[languageMode].common.noData
  const profileAddress = rawAddress || appCopy[languageMode].common.noData
  const accountInfoSavedCount = [rawFullName, rawPhone, rawEmail].filter(Boolean).length
  const profileAccountInfoMeta = accountInfoSavedCount >= 3
    ? accountInfoCopy.metaComplete
    : accountInfoSavedCount > 0
      ? accountInfoCopy.metaPartial(accountInfoSavedCount)
      : accountInfoCopy.metaEmpty
  const profileCareCopy = customerProfileCareCopy[languageMode]
  const profileSectionCopy = customerProfileSectionCopy[languageMode]
  const profileCareStats = [
    {
      icon: 'kael' as const,
      label: profileCareCopy.interactionLabel,
      value: kaelInteractionCount ? `${kaelInteractionCount}` : profileCareCopy.interactionReady,
    },
    {
      icon: 'request' as const,
      label: profileCareCopy.serviceLabel,
      value: completedServiceCount ? `${completedServiceCount}` : profileCareCopy.servicePending,
    },
    {
      icon: 'payment' as const,
      label: profileCareCopy.savingsLabel,
      value: priceSavingsVnd ? formatVnd(priceSavingsVnd) : profileCareCopy.savingsPending,
    },
  ]
  const profileFallbackTitle = languageMode === 'en' ? 'Customer profile' : 'Hồ sơ khách'
  const profileTitle = localizedProfileName(rawNickname, languageMode) || localizedProfileName(rawFullName, languageMode) || profileFallbackTitle
  const profileSubtitle = languageMode === 'en' ? 'Basic information' : 'Thông tin cơ bản'
  const profileEditorConfig = profileEditorField ? profileEditorCopy[profileEditorField] : null
  const profileEditorIsAddress = profileEditorField === 'address'

  return (
    <V4Frame active="profile" testID="customer-profile-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <ReduceMotionAwareEntranceView delayMs={70} distanceY={10} testID="customer-profile-hero-motion">
            <GlassCard material="liquid" mode={tokens.mode} style={[styles.profilePrototypeHero, customerProfileHeroSurface(tokens)]} testID="customer-profile-hero">
              <ProfileLiquidChrome testID="customer-profile-identity-liquid-card" variant="hero" />
              <View style={styles.hiddenMarker} testID="customer-profile-empty-state" />
              <View style={styles.profilePrototypeTop}>
                <View style={styles.profilePrototypeTitleRow}>
                  <IconShell icon="person" size={54} tone="service" />
                  <View style={styles.profilePrototypeTitleCopy}>
                    <Text style={[styles.profilePrototypeTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-profile-hero-title">
                      {profileTitle}
                    </Text>
                    <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                      {profileSubtitle}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.hiddenMarker} testID="customer-admin-audit-switch" />
            </GlassCard>
          </ReduceMotionAwareEntranceView>
          <View style={styles.hiddenMarker} testID="customer-profile-setup-card" />
          <View style={styles.hiddenMarker} testID="customer-shell-honest-profile-save" />
          <ReduceMotionAwareEntranceView delayMs={125} distanceY={8} style={[styles.profileActions, styles.profileCareWideWrap]} testID="customer-profile-care-card-motion">
            <CustomerProfileCareCard
              copy={profileCareCopy}
              stats={profileCareStats}
            />
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={165} distanceY={8} style={styles.profileActions} testID="customer-profile-list-motion">
            <View style={[styles.listCard, styles.profileGlassListCard, customerProfilePanelSurface(tokens)]} testID="customer-profile-checklist">
              <ProfileLiquidChrome testID="customer-profile-identity-panel-liquid" variant="panel" />
              <Text style={[styles.profileListSectionTitle, { color: tokens.muted }]} numberOfLines={1}>
                {profileSectionCopy.identity}
              </Text>
              <View style={styles.hiddenMarker} testID="customer-profile-unified-functions" />
              <View style={styles.hiddenMarker} testID="customer-profile-privacy-shell" />
              <ActionRow compact icon="identity" title={profileEditorCopy.nickname.title} meta={profileNickname} onPress={() => openProfileEditor('nickname')} testID="customer-profile-edit-nickname" />
              <ActionRow compact icon="phone" title={languageMode === 'en' ? 'Information' : 'Thông tin'} meta={profileAccountInfoMeta} onPress={openAccountInfo} testID="customer-profile-open-account-info" />
              <ActionRow compact icon="map" title={profileEditorCopy.address.title} meta={profileAddress} onPress={() => openProfileEditor('address')} testID="customer-utility-saved-address" />
              <View style={styles.hiddenMarker} testID="customer-profile-evidence-shell" />
            </View>
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={205} distanceY={8} style={styles.profileActions} testID="customer-profile-actions-motion">
            <View style={[styles.listCard, styles.profileGlassListCard, customerProfilePanelSurface(tokens)]}>
              <ProfileLiquidChrome testID="customer-profile-settings-panel-liquid" variant="panel" />
              <Text style={[styles.profileListSectionTitle, { color: tokens.muted }]} numberOfLines={1}>
                {profileSectionCopy.settings}
              </Text>
              <ActionRow compact icon="theme" title={copy.profile.interface} meta={themeMode === 'light' ? copy.profile.light : copy.profile.dark} onPress={toggleTheme} testID="customer-dark-mode-toggle-profile" />
              <ActionRow compact icon="language" title={appCopy[languageMode].common.appLanguage} meta={languageDisplayName(languageMode)} onPress={toggleLanguage} testID="customer-language-toggle" />
              <ActionRow compact icon="feedback" title={feedbackCopy.rowTitle} meta={feedbackSent ? feedbackCopy.rowMetaSent : feedbackCopy.rowMeta} onPress={openFeedback} testID="customer-profile-open-feedback" />
              <ActionRow compact icon="password" title={passwordCopy.rowTitle} meta={passwordUpdated ? passwordCopy.rowMetaUpdated : passwordCopy.rowMeta} onPress={openPasswordSheet} testID="customer-profile-open-password" />
              <ActionRow compact icon="logout" title={copy.profile.signOut} meta={copy.profile.switchAccount} onPress={() => void signOut()} testID="customer-profile-sign-out" />
              <View style={styles.hiddenMarker} testID="customer-utility-ticket-wallet" />
              <View style={styles.hiddenMarker} testID="customer-utility-support-entry" />
              <View style={styles.hiddenMarker} testID="customer-profile-payment-placeholder" />
              <View style={styles.hiddenMarker} testID="customer-profile-review-placeholder" />
            </View>
          </ReduceMotionAwareEntranceView>
          {profileEditorConfig ? (
            <Modal animationType="fade" onRequestClose={closeProfileEditor} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-profile-editor-sheet">
                  <ProfileLiquidChrome testID="customer-profile-editor-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {profileEditorConfig.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {profileEditorConfig.helper}
                  </Text>
                  <TextInput
                    accessibilityLabel={profileEditorConfig.title}
                    autoCapitalize="sentences"
                    editable={!profileEditorSaving}
                    keyboardType="default"
                    multiline={profileEditorIsAddress}
                    numberOfLines={profileEditorIsAddress ? 3 : 1}
                    onChangeText={(nextValue) => {
                      setProfileEditorValue(nextValue)
                      if (profileEditorError) setProfileEditorError(null)
                    }}
                    onSubmitEditing={profileEditorIsAddress ? undefined : () => void submitProfileEditor()}
                    placeholder={profileEditorConfig.placeholder}
                    placeholderTextColor={tokens.subtleText}
                    returnKeyType={profileEditorIsAddress ? 'default' : 'done'}
                    style={[
                      styles.profileEditorInput,
                      profileEditorIsAddress ? styles.profileEditorInputMultiline : null,
                      customerProfileInputSurface(tokens),
                      {
                        color: tokens.text,
                      },
                    ]}
                    testID="customer-profile-editor-input"
                    textAlignVertical={profileEditorIsAddress ? 'top' : 'center'}
                    value={profileEditorValue}
                  />
                  {profileEditorError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-profile-editor-error">
                      {profileEditorError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={profileEditorCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: profileEditorSaving }}
                      disabled={profileEditorSaving}
                      onPress={closeProfileEditor}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        profileEditorSaving ? styles.disabled : null,
                      ]}
                      testID="customer-profile-editor-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {profileEditorCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={profileEditorCopy.save}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: profileEditorSaving }}
                      disabled={profileEditorSaving}
                      onPress={() => void submitProfileEditor()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        profileEditorSaving ? styles.disabled : null,
                      ]}
                      testID="customer-profile-editor-save"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {profileEditorSaving ? profileEditorCopy.saving : profileEditorCopy.save}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {accountInfoOpen ? (
            <Modal animationType="fade" onRequestClose={closeAccountInfo} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.accountInfoSheet, customerProfilePanelSurface(tokens)]} testID="customer-account-info-sheet">
                  <ProfileLiquidChrome testID="customer-account-info-sheet-liquid" variant="panel" />
                  <View style={styles.accountInfoHeader}>
                    <Pressable
                      accessibilityLabel={accountInfoCopy.close}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: accountInfoSaving }}
                      disabled={accountInfoSaving}
                      onPress={closeAccountInfo}
                      style={({ pressed }) => [styles.accountInfoBackButton, reduceMotionAwarePressStyle(pressed, reduceMotion), accountInfoSaving ? styles.disabled : null]}
                      testID="customer-account-info-close"
                    >
                      <Text style={[styles.accountInfoBackText, { color: tokens.text }]} numberOfLines={1}>
                        ‹
                      </Text>
                    </Pressable>
                    <Text style={[styles.accountInfoTitle, { color: tokens.text }]} numberOfLines={1}>
                      {accountInfoCopy.title}
                    </Text>
                    <View style={styles.accountInfoHeaderSpacer} />
                  </View>
                  <ScrollView
                    automaticallyAdjustKeyboardInsets
                    contentContainerStyle={styles.accountInfoFields}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      label={accountInfoCopy.salutation}
                      onChangeText={(value) => updateAccountInfoDraft('salutation', value)}
                      placeholder={accountInfoCopy.salutationPlaceholder}
                      testID="customer-account-salutation-input"
                      tokens={tokens}
                      value={accountInfoDraft.salutation}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      label={accountInfoCopy.fullName}
                      onChangeText={(value) => updateAccountInfoDraft('fullName', value)}
                      placeholder={accountInfoCopy.fullNamePlaceholder}
                      testID="customer-account-full-name-input"
                      tokens={tokens}
                      value={accountInfoDraft.fullName}
                    />
                    <AccountInfoGenderSegment
                      disabled={accountInfoSaving}
                      labels={accountInfoCopy.genderOptions}
                      onSelect={(value) => updateAccountInfoDraft('gender', value)}
                      selected={normalizeCustomerGender(accountInfoDraft.gender)}
                      title={accountInfoCopy.gender}
                      tokens={tokens}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      keyboardType="number-pad"
                      label={accountInfoCopy.birthDate}
                      onChangeText={(value) => updateAccountInfoDraft('birthDate', formatCustomerBirthDateInput(value))}
                      placeholder={accountInfoCopy.birthDatePlaceholder}
                      testID="customer-account-birth-date-input"
                      tokens={tokens}
                      value={accountInfoDraft.birthDate}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      keyboardType="phone-pad"
                      label={accountInfoCopy.phone}
                      onChangeText={(value) => updateAccountInfoDraft('phone', value)}
                      placeholder={accountInfoCopy.phonePlaceholder}
                      testID="customer-account-phone-input"
                      tokens={tokens}
                      value={accountInfoDraft.phone}
                    />
                    <AccountInfoField
                      autoCapitalize="none"
                      editable={!accountInfoSaving}
                      keyboardType="email-address"
                      label={accountInfoCopy.email}
                      onChangeText={(value) => updateAccountInfoDraft('email', value)}
                      placeholder="name@example.com"
                      testID="customer-account-email-input"
                      tokens={tokens}
                      value={accountInfoDraft.email}
                    />
                    <Text style={[styles.accountInfoNote, { color: tokens.muted }]} numberOfLines={3}>
                      {accountInfoCopy.emailNote}
                    </Text>
                    <View style={[styles.accountInfoVerification, customerProfileVerificationSurface(tokens)]}>
                      <MappedIcon name="privacy" color={tokens.primary} accent={tokens.aqua} size={24} />
                      <View style={styles.accountInfoVerificationCopy}>
                        <Text style={[styles.accountInfoVerificationTitle, { color: tokens.primary }]} numberOfLines={1}>
                          {accountInfoCopy.identityTitle}
                        </Text>
                        <Text style={[styles.accountInfoVerificationBody, { color: tokens.muted }]} numberOfLines={2}>
                          {accountInfoCopy.identityBody}
                        </Text>
                      </View>
                    </View>
                  </ScrollView>
                  {accountInfoError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-account-info-error">
                      {accountInfoError}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityLabel={accountInfoCopy.save}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: accountInfoSaving }}
                    disabled={accountInfoSaving}
                    onPress={() => void submitAccountInfo()}
                    style={({ pressed }) => [
                      styles.accountInfoSaveButton,
                      customerProfilePrimaryButtonSurface(tokens),
                      reduceMotionAwarePressStyle(pressed, reduceMotion),
                      accountInfoSaving ? styles.disabled : null,
                    ]}
                    testID="customer-account-info-save"
                  >
                    <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                      {accountInfoSaving ? accountInfoCopy.saving : accountInfoCopy.save}
                    </Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {feedbackOpen ? (
            <Modal animationType="fade" onRequestClose={closeFeedback} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-feedback-sheet">
                  <ProfileLiquidChrome testID="customer-feedback-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {feedbackCopy.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {feedbackCopy.helper}
                  </Text>
                  <TextInput
                    accessibilityLabel={feedbackCopy.title}
                    autoCapitalize="sentences"
                    editable={!feedbackSaving}
                    maxLength={1200}
                    multiline
                    numberOfLines={5}
                    onChangeText={(nextValue) => {
                      setFeedbackValue(nextValue)
                      if (feedbackError) setFeedbackError(null)
                    }}
                    placeholder={feedbackCopy.placeholder}
                    placeholderTextColor={tokens.subtleText}
                    returnKeyType="default"
                    style={[
                      styles.profileEditorInput,
                      styles.feedbackInput,
                      customerProfileInputSurface(tokens),
                      {
                        color: tokens.text,
                      },
                    ]}
                    testID="customer-feedback-input"
                    textAlignVertical="top"
                    value={feedbackValue}
                  />
                  {feedbackError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-feedback-error">
                      {feedbackError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={feedbackCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: feedbackSaving }}
                      disabled={feedbackSaving}
                      onPress={closeFeedback}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        feedbackSaving ? styles.disabled : null,
                      ]}
                      testID="customer-feedback-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {feedbackCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={feedbackCopy.submit}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: feedbackSaving }}
                      disabled={feedbackSaving}
                      onPress={() => void submitFeedback()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        feedbackSaving ? styles.disabled : null,
                      ]}
                      testID="customer-feedback-submit"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {feedbackSaving ? feedbackCopy.saving : feedbackCopy.submit}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {passwordOpen ? (
            <Modal animationType="fade" onRequestClose={closePasswordSheet} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-password-sheet">
                  <ProfileLiquidChrome testID="customer-password-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {passwordCopy.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {passwordCopy.helper}
                  </Text>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.currentLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.currentLabel}
                      autoCapitalize="none"
                      autoComplete="current-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordCurrent(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      placeholder={passwordCopy.currentPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="next"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-current-input"
                      textContentType="password"
                      value={passwordCurrent}
                    />
                  </View>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.passwordLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.passwordLabel}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordValue(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      placeholder={passwordCopy.passwordPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="next"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-new-input"
                      textContentType="newPassword"
                      value={passwordValue}
                    />
                  </View>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.confirmLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.confirmLabel}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordConfirm(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      onSubmitEditing={() => void submitPassword()}
                      placeholder={passwordCopy.confirmPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="done"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-confirm-input"
                      textContentType="newPassword"
                      value={passwordConfirm}
                    />
                  </View>
                  {passwordError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-password-error">
                      {passwordError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={passwordCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: passwordSaving }}
                      disabled={passwordSaving}
                      onPress={closePasswordSheet}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        passwordSaving ? styles.disabled : null,
                      ]}
                      testID="customer-password-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {passwordCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={passwordCopy.save}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: passwordSaving }}
                      disabled={passwordSaving}
                      onPress={() => void submitPassword()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        passwordSaving ? styles.disabled : null,
                      ]}
                      testID="customer-password-save"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {passwordSaving ? passwordCopy.saving : passwordCopy.save}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
        </View>
      )}
    </V4Frame>
  )
}

function CustomerProfileCareCard({
  copy,
  stats,
}: {
  copy: (typeof customerProfileCareCopy)[AppLanguage]
  stats: Array<{ icon: IconName; label: string; value: string }>
}) {
  const tokens = useCustomerTokens()

  return (
    <View style={[styles.profileCareCard, customerProfileCareCardSurface(tokens)]} testID="customer-profile-home-care-card">
      <ProfileLiquidChrome testID="customer-profile-care-card-liquid" variant="care" />
      <View style={styles.profileCareHeader} testID="customer-profile-care-header-motion">
        <Text style={[styles.profileCareTitle, { color: tokens.text }]} numberOfLines={1}>
          {copy.title}
        </Text>
      </View>
      <View style={styles.profileCareStats}>
        {stats.map((item, index) => (
          <View key={item.label} style={[styles.profileCareStat, customerProfileCareStatSurface(tokens)]} testID={`customer-profile-care-stat-motion-${index}`}>
            <View style={[styles.profileCareStatIcon, customerProfileCarePillSurface(tokens)]}>
              <MappedIcon name={item.icon} color={tokens.primary} accent={tokens.primary} size={22} />
            </View>
            <View style={styles.profileCareStatCopy}>
              <Text style={[styles.profileCareStatLabel, { color: tokens.text }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.profileCareStatValue, { color: tokens.primary }]} numberOfLines={1} testID={`customer-profile-insight-${index}`}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ActionRow({
  compact = false,
  icon,
  meta,
  onPress,
  testID,
  title,
}: {
  compact?: boolean
  icon: IconName
  meta: string
  onPress: () => void
  testID: string
  title: string
}) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  const compactRowSurface = compact ? customerProfileRowSurface(tokens) : null
  return (
    <Pressable accessibilityLabel={meta ? `${title}. ${meta}` : title} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, compact ? styles.profileListRow : null, compactRowSurface, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={testID}>
      <View style={[styles.profileRowIconStage, customerProfileRowIconSurface(tokens)]}>
        <MappedIcon name={icon} color={tokens.primary} accent={tokens.primary} size={compact ? 24 : 26} />
      </View>
      <View style={[styles.listCopy, compact ? styles.profileListCopy : null]}>
        <Text style={[styles.listTitle, compact ? styles.profileListTitle : null, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, compact ? styles.profileListMeta : null, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {compact ? null : (
        <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
          ›
        </Text>
      )}
    </Pressable>
  )
}

function ProfileLiquidChrome({ testID, variant }: { testID?: string; variant: 'care' | 'hero' | 'panel' }) {
  const tokens = useCustomerTokens()
  const reduceTransparency = customerReduceTransparency(tokens)
  const sheenColor = tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.64)'
  const lensColor = tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(105,222,198,0.20)'
  const outerEdgeSurface = customerProfileChromeCrispShellSurface(tokens, variant)
  const innerInsetSurface = customerProfileChromeInnerInsetSurface(tokens, variant)
  const topGlintSurface = customerProfileChromeTopEdgeSurface(tokens)
  const bottomEdgeSurface = customerProfileChromeBottomEdgeSurface(tokens)
  const lensStyle = variant === 'hero'
    ? styles.profileHeroLiquidLens
    : variant === 'care'
      ? styles.profileCareLiquidLens
      : styles.profilePanelLiquidLens
  const sheenStyle = variant === 'hero'
    ? styles.profileHeroLiquidSheen
    : variant === 'care'
      ? styles.profileCareLiquidSheen
      : styles.profilePanelLiquidSheen
  const edgeStyle = variant === 'hero'
    ? styles.profileHeroLiquidEdge
    : variant === 'care'
      ? styles.profileCareLiquidEdge
      : styles.profilePanelLiquidEdge

  return (
    <>
      <SubtleGlassHighlight />
      {reduceTransparency ? null : (
        <>
          {variant === 'hero' ? null : <View pointerEvents="none" style={[lensStyle, { backgroundColor: lensColor }]} testID={testID} />}
          <View pointerEvents="none" style={[styles.profileLiquidSheen, sheenStyle, { backgroundColor: sheenColor }]} />
          <View pointerEvents="none" style={[styles.profileLiquidOuterEdge, edgeStyle, outerEdgeSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidInnerEdge, innerInsetSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidTopGlint, topGlintSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidBottomEdge, bottomEdgeSurface]} />
        </>
      )}
    </>
  )
}
