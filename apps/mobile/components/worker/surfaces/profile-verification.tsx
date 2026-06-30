import { workerVerificationCopy, type WorkerVerificationCopy } from './copy'
import { styles } from './styles'
import { workerProfileFileButtonSurface, workerProfileInputSurface, workerProfilePanelSurface, workerProfileServiceAreaSurface } from './surface-styles/profile-map'
import { type WorkerVerificationFileSlot } from './types'
import { createWorkerVerificationFormState, workerVerificationFormReducer, workerVerificationServices } from './verification'
import { localizedServiceLabel } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type LocalMediaUploadDraft, uploadWorkerVerificationDrafts } from '@/lib/media-upload'
import { type DistrictSlug, HCMC_DISTRICTS, normalizeDistrict, type ServiceType, type WorkerRegisterInput, type WorkerVerificationStatus } from '@home-services/shared'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useReducer } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { workerServiceAreaAnchors } from './map'
import { PressButton, WorkerProfileMaterialChrome, WorkerUtilityIcon, localizedWorkerVerificationStatus, useWorkerUi } from './ui'

const workerServiceRadiusPresets = [5, 8, 12, 20] as const

export function WorkerVerificationForm() {
  const { language, tokens } = useWorkerUi()
  const { actions, workerProfile } = useFrontendWorkflow()
  const verificationCopy = workerVerificationCopy[language] as WorkerVerificationCopy
  const [{
    bankAccount,
    bankName,
    dateOfBirth,
    districts,
    files,
    homeLat,
    homeLng,
    legalName,
    problemSpecializations,
    serviceRadiusKm,
    serviceTypes,
    submitError,
    submitting,
    yearsExperience,
  }, formDispatch] = useReducer(
    workerVerificationFormReducer,
    workerProfile,
    createWorkerVerificationFormState,
  )
  const status: WorkerVerificationStatus = workerProfile?.verification_status ?? 'draft'
  const setLegalName = (value: string) => formDispatch({ type: 'field', field: 'legalName', value })
  const setDateOfBirth = (value: string) => formDispatch({ type: 'field', field: 'dateOfBirth', value })
  const setDistricts = (value: string) => formDispatch({ type: 'field', field: 'districts', value })
  const setHomeLat = (value: string) => formDispatch({ type: 'field', field: 'homeLat', value })
  const setHomeLng = (value: string) => formDispatch({ type: 'field', field: 'homeLng', value })
  const setYearsExperience = (value: string) => formDispatch({ type: 'field', field: 'yearsExperience', value })
  const setProblemSpecializations = (value: string) => formDispatch({ type: 'field', field: 'problemSpecializations', value })
  const setServiceRadiusKm = (value: string) => formDispatch({ type: 'field', field: 'serviceRadiusKm', value })
  const setBankName = (value: string) => formDispatch({ type: 'field', field: 'bankName', value })
  const setBankAccount = (value: string) => formDispatch({ type: 'field', field: 'bankAccount', value })
  const setSubmitError = (error: string | null) => formDispatch({ type: 'submit_error', error })
  const setSubmitting = (submittingValue: boolean) => formDispatch({ type: 'submitting', submitting: submittingValue })
  const setDistrictsFromText = (value: string) => {
    setDistricts(value)
    setHomeLat('')
    setHomeLng('')
    setSubmitError(null)
  }
  const selectedDistrictSlug = normalizeDistrict(districts.split(',')[0] ?? '')
  const parsedRadiusValue = Number.parseInt(serviceRadiusKm.replace(/[^\d]/g, ''), 10)
  const radiusValue = Math.min(30, Math.max(1, Number.isFinite(parsedRadiusValue) ? parsedRadiusValue : 8))
  const setServiceAreaAnchor = (anchor: (typeof workerServiceAreaAnchors)[number]) => {
    setDistricts(HCMC_DISTRICTS[anchor.slug])
    setHomeLat(anchor.lat.toFixed(6))
    setHomeLng(anchor.lng.toFixed(6))
    setSubmitError(null)
  }
  const adjustServiceRadius = (delta: number) => {
    setServiceRadiusKm(String(Math.min(30, Math.max(1, radiusValue + delta))))
    setSubmitError(null)
  }
  const setRadiusPreset = (value: number) => {
    setServiceRadiusKm(String(value))
    setSubmitError(null)
  }

  useEffect(() => {
    if (!workerProfile) return
    formDispatch({ type: 'hydrate', profile: workerProfile })
  }, [workerProfile])

  const toggleService = (serviceType: ServiceType) => {
    formDispatch({ type: 'toggle_service', serviceType })
  }

  const pickVerificationFile = async (slot: WorkerVerificationFileSlot) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setSubmitError(verificationCopy.permissionError)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    formDispatch({
      type: 'file',
      slot,
      file: {
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
      },
    })
  }

  const submitVerification = async () => {
    const years = Number.parseInt(yearsExperience.replace(/[^\d]/g, ''), 10)
    const radius = Number.parseInt(serviceRadiusKm.replace(/[^\d]/g, ''), 10)
    const parsedHomeLat = homeLat.trim() ? Number(homeLat.trim()) : null
    const parsedHomeLng = homeLng.trim() ? Number(homeLng.trim()) : null
    const specializationList = problemSpecializations.split(',').flatMap((item) => {
      const specialization = item.trim()
      return specialization ? [specialization] : []
    })
    const districtList = districts.split(',').flatMap((item) => {
      const district = item.trim()
      return district ? [district] : []
    })
    if (legalName.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
      setSubmitError(verificationCopy.errors.identity)
      return
    }
    if (!Number.isFinite(years) || years < 0 || districtList.length === 0 || serviceTypes.length === 0) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (!Number.isFinite(radius) || radius < 1 || radius > 30) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (
      (parsedHomeLat !== null || parsedHomeLng !== null) &&
      (
        parsedHomeLat === null ||
        parsedHomeLng === null ||
        !Number.isFinite(parsedHomeLat) ||
        !Number.isFinite(parsedHomeLng) ||
        Math.abs(parsedHomeLat) > 90 ||
        Math.abs(parsedHomeLng) > 180
      )
    ) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (!bankName.trim() || bankAccount.trim().length < 6) {
      setSubmitError(verificationCopy.errors.bank)
      return
    }
    if (!files.cccdFront || !files.cccdBack || !files.selfie) {
      setSubmitError(verificationCopy.errors.files)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    const uploaded = await uploadWorkerVerificationDrafts({
      cccdFront: files.cccdFront,
      cccdBack: files.cccdBack,
      selfie: files.selfie,
    })
    if (!uploaded.success) {
      setSubmitting(false)
      setSubmitError(verificationCopy.uploadError)
      return
    }

    const input: WorkerRegisterInput = {
      legal_name: legalName.trim(),
      date_of_birth: dateOfBirth.trim(),
      service_types: serviceTypes,
      years_experience: years,
      districts: districtList,
      home_lat: parsedHomeLat ?? undefined,
      home_lng: parsedHomeLng ?? undefined,
      service_radius_km: radius,
      problem_specializations: specializationList,
      bank_account: bankAccount.trim(),
      bank_name: bankName.trim(),
      ...uploaded.urls,
    }
    const saved = await actions.workerSubmitRegistration(input)
    setSubmitting(false)
    if (!saved) {
      setSubmitError(verificationCopy.errors.submit)
      return
    }
    formDispatch({ type: 'reset_bank_account' })
    Alert.alert(verificationCopy.savedTitle, verificationCopy.savedBody)
  }

  return (
    <View style={[styles.verificationCard, workerProfilePanelSurface(tokens)]} testID="worker-verification-submit-card">
      <WorkerProfileMaterialChrome testID="worker-profile-verification-crisp-shell" variant="form" />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{verificationCopy.kicker}</Text>
          <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{verificationCopy.title}</Text>
        </View>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} testID="worker-verification-status">
          {localizedWorkerVerificationStatus(status, language)}
        </Text>
      </View>
      <TextInput accessibilityLabel={verificationCopy.legalName} autoCapitalize="words" onChangeText={setLegalName} placeholder={verificationCopy.legalName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-legal-name" value={legalName} />
      <View style={styles.verificationGrid}>
        <TextInput accessibilityLabel={verificationCopy.dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-date-of-birth" value={dateOfBirth} />
        <TextInput accessibilityLabel={verificationCopy.yearsExperience} keyboardType="number-pad" onChangeText={setYearsExperience} placeholder={verificationCopy.yearsExperience} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-years" value={yearsExperience} />
      </View>
      <TextInput accessibilityLabel={verificationCopy.districts} onChangeText={setDistrictsFromText} placeholder={verificationCopy.districtsPlaceholder} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-districts" value={districts} />
      <WorkerServiceAreaPicker
        onAdjustRadius={adjustServiceRadius}
        onSelectAnchor={setServiceAreaAnchor}
        onSelectRadiusPreset={setRadiusPreset}
        radiusValue={radiusValue}
        selectedDistrictSlug={selectedDistrictSlug}
      />
      <TextInput accessibilityLabel={verificationCopy.problemSpecializations} onChangeText={setProblemSpecializations} placeholder={verificationCopy.problemSpecializations} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-problem-specializations" value={problemSpecializations} />
      <View style={styles.skillWrap} testID="worker-verification-service-types">
        {workerVerificationServices.map((serviceType) => {
          const selected = serviceTypes.includes(serviceType)
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.selectSkill} ${localizedServiceLabel(serviceType, language)}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              key={serviceType}
              onPress={() => toggleService(serviceType)}
              style={({ pressed }) => [
                styles.skillPill,
                { backgroundColor: selected ? tokens.primary : tokens.glassStrong, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-service-${serviceType}`}
            >
              <Text style={[styles.skillText, { color: selected ? tokens.primaryText : tokens.primary }]}>{localizedServiceLabel(serviceType, language)}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.verificationGrid}>
        <TextInput accessibilityLabel={verificationCopy.bankName} onChangeText={setBankName} placeholder={verificationCopy.bankName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-bank-name" value={bankName} />
        <TextInput accessibilityLabel={verificationCopy.bankAccount} keyboardType="number-pad" onChangeText={setBankAccount} placeholder={verificationCopy.bankAccount} placeholderTextColor={tokens.subtle} secureTextEntry style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-bank-account" value={bankAccount} />
      </View>
      <View style={styles.verificationFiles}>
        <VerificationFileButton file={files.cccdFront} label={verificationCopy.files.cccdFront} onPress={() => void pickVerificationFile('cccdFront')} testID="worker-verification-cccd-front" />
        <VerificationFileButton file={files.cccdBack} label={verificationCopy.files.cccdBack} onPress={() => void pickVerificationFile('cccdBack')} testID="worker-verification-cccd-back" />
        <VerificationFileButton file={files.selfie} label={verificationCopy.files.selfie} onPress={() => void pickVerificationFile('selfie')} testID="worker-verification-selfie" />
      </View>
      {submitError ? <Text style={[styles.bodyText, { color: tokens.copper }]} testID="worker-verification-error">{submitError}</Text> : null}
      <PressButton disabled={submitting} label={submitting ? verificationCopy.submitting : verificationCopy.submit} material="liquid" onPress={() => void submitVerification()} testID="worker-verification-submit" />
    </View>
  )
}

function WorkerServiceAreaPicker({
  onAdjustRadius,
  onSelectAnchor,
  onSelectRadiusPreset,
  radiusValue,
  selectedDistrictSlug,
}: {
  onAdjustRadius: (delta: number) => void
  onSelectAnchor: (anchor: (typeof workerServiceAreaAnchors)[number]) => void
  onSelectRadiusPreset: (value: number) => void
  radiusValue: number
  selectedDistrictSlug: DistrictSlug
}) {
  const { language, tokens } = useWorkerUi()
  const verificationCopy = workerVerificationCopy[language] as WorkerVerificationCopy

  return (
    <View style={[styles.serviceAreaPicker, workerProfileServiceAreaSurface(tokens)]} testID="worker-verification-service-area-picker">
      <WorkerProfileMaterialChrome testID="worker-profile-service-area-crisp-shell" variant="panel" />
      <View style={styles.titleStack}>
        <Text style={[styles.kicker, { color: tokens.primary }]}>{verificationCopy.serviceAreaTitle}</Text>
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{verificationCopy.serviceAreaBody}</Text>
      </View>
      <View style={styles.serviceAreaAnchorGrid} testID="worker-verification-service-area-anchors">
        {workerServiceAreaAnchors.map((anchor) => {
          const selected = selectedDistrictSlug === anchor.slug
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.serviceAreaTitle}: ${HCMC_DISTRICTS[anchor.slug]}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={anchor.slug}
              onPress={() => onSelectAnchor(anchor)}
              style={({ pressed }) => [
                styles.serviceAreaAnchorButton,
                { backgroundColor: selected ? tokens.primary : tokens.raised, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-service-area-${anchor.slug}`}
            >
              <Text style={[styles.serviceAreaAnchorText, { color: selected ? tokens.primaryText : tokens.primary }]}>{HCMC_DISTRICTS[anchor.slug]}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.serviceAreaRadiusRow} testID="worker-verification-radius-stepper">
        <Pressable
          accessibilityLabel={verificationCopy.radiusDecrease}
          accessibilityRole="button"
          onPress={() => onAdjustRadius(-1)}
          style={({ pressed }) => [
            styles.serviceAreaRadiusButton,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="worker-verification-radius-minus"
        >
          <Text style={[styles.serviceAreaRadiusControlText, { color: tokens.primary }]}>-</Text>
        </Pressable>
        <Text accessibilityLabel={verificationCopy.serviceRadius} style={[styles.serviceAreaRadiusValue, { color: tokens.ink }]} testID="worker-verification-service-radius">
          {radiusValue} km
        </Text>
        <Pressable
          accessibilityLabel={verificationCopy.radiusIncrease}
          accessibilityRole="button"
          onPress={() => onAdjustRadius(1)}
          style={({ pressed }) => [
            styles.serviceAreaRadiusButton,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="worker-verification-radius-plus"
        >
          <Text style={[styles.serviceAreaRadiusControlText, { color: tokens.primary }]}>+</Text>
        </Pressable>
      </View>
      <View style={styles.serviceAreaRadiusPresets}>
        {workerServiceRadiusPresets.map((value) => {
          const selected = radiusValue === value
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.radiusPreset} ${value} km`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={value}
              onPress={() => onSelectRadiusPreset(value)}
              style={({ pressed }) => [
                styles.serviceAreaAnchorButton,
                { backgroundColor: selected ? tokens.primary : tokens.raised, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-radius-${value}`}
            >
              <Text style={[styles.serviceAreaAnchorText, { color: selected ? tokens.primaryText : tokens.primary }]}>{value} km</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={[styles.verificationHint, { color: tokens.subtle }]} testID="worker-verification-home-geo">
        {verificationCopy.serviceAreaManual}
      </Text>
    </View>
  )
}

function VerificationFileButton({ file, label, onPress, testID }: { file?: LocalMediaUploadDraft; label: string; onPress: () => void; testID: string }) {
  const { language, tokens } = useWorkerUi()
  const fileCopy = workerVerificationCopy[language].files
  const selected = Boolean(file)
  return (
    <Pressable
      accessibilityLabel={file ? `${label}: ${file.fileName ?? fileCopy.selectedFallback}` : `${fileCopy.choose} ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.verificationFileButton,
        workerProfileFileButtonSurface(tokens, selected),
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <WorkerUtilityIcon frameSize={28} icon="document" size={28} small />
      <Text style={[styles.verificationFileText, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={2}>
        {file?.fileName ?? label}
      </Text>
    </Pressable>
  )
}
