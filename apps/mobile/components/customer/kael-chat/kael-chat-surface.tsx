import { useEffect, useMemo, useReducer, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { type ServiceType } from '@home-services/shared'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { localizedServiceLabel, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelChatService } from '@/lib/services'
import { AddressAutocomplete } from '@/components/customer/address-autocomplete'
import { takePendingKaelChatDraft } from './pending-intake'
import { createInitialKaelChatState, kaelChatReducer } from './state'
import { styles } from './styles'

const KAEL_CHAT_STACK_SCREEN_CONTRACT = 'KAEL_CHAT_STACK_SCREEN_CONTRACT: stack route uses kaelChatService only'
const KAEL_CHAT_SERVICE_WRAPPER_ONLY = 'KAEL_CHAT_SERVICE_WRAPPER_ONLY: UI does not call Supabase, fetch, or AI directly'
void KAEL_CHAT_STACK_SCREEN_CONTRACT
void KAEL_CHAT_SERVICE_WRAPPER_ONLY

const supportedServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const vndFormatter = new Intl.NumberFormat('vi-VN')
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

const copy = {
  vi: {
    attach: 'Ảnh',
    attachHint: 'Nếu cần ảnh, Kael sẽ yêu cầu bổ sung trong phiên này.',
    back: 'Đóng',
    chatTitle: 'Trung tâm Kael',
    chooseService: 'Chọn dịch vụ để Kael bắt đầu đúng luồng xử lý.',
    composerPlaceholder: 'Mô tả sự cố, vị trí trong căn hộ, dấu hiệu nguy hiểm...',
    confirm: 'Xác nhận tìm thợ',
    confirmArmed: 'Có, tìm thợ',
    confirmPrompt: 'Xác nhận tìm thợ với ước tính này?',
    confirmed: 'Đã tạo yêu cầu. Kael đang chuyển sang bước tìm thợ phù hợp.',
    confirming: 'Đang xác nhận',
    emptyTitle: 'Bắt đầu với điện, nước hoặc dọn dẹp',
    errorNoService: 'Chọn một dịch vụ trước khi gửi mô tả.',
    errorUnknown: 'Kael chưa thể cập nhật phiên này. Vui lòng thử lại.',
    estimateTitle: 'Ước tính của Kael',
    estimateProblemFallback: 'Kael đã phân loại vấn đề.',
    estimateDisclaimerFallback: 'Giá là ước tính tham khảo. Thợ xác nhận phạm vi và giá thực tế trước khi bắt đầu.',
    history: 'Xem hoạt động',
    loading: 'Đang tải phiên Kael',
    noWorkerConfirmed: 'Đã tạo yêu cầu. Hiện chưa có thợ phù hợp, Kael sẽ giữ trong hoạt động để tiếp tục theo dõi.',
    noEstimate: 'Kael cần thêm mô tả trước khi ước tính.',
    retry: 'Thử lại',
    send: 'Gửi',
    sending: 'Đang gửi',
    subtitle: 'Kael hỏi rõ vấn đề, tạo ước tính, rồi chỉ tìm thợ sau khi bạn xác nhận.',
    turnFallback: 'Kael đã cập nhật phiên.',
    unsupported: 'Dịch vụ chưa hỗ trợ',
    labels: {
      advisory: 'Lưu ý',
      complexity: 'Mức độ',
      confidence: 'Độ tin cậy',
      problem: 'Vấn đề',
      service: 'Dịch vụ',
      status: 'Trạng thái',
      price: 'Khoảng giá',
    },
    complexity: {
      small: 'Nhỏ',
      medium: 'Vừa',
      large: 'Lớn',
    },
    nextAction: {
      ask_photo: 'Kael có thể cần ảnh rõ hơn.',
      ask_video: 'Kael có thể cần video ngắn.',
      await_input: 'Mô tả thêm để Kael phân loại chính xác hơn.',
      budget_exceeded: 'Ước tính có thể vượt ngân sách ban đầu.',
      confirmed: 'Đã xác nhận tìm thợ.',
      estimate_ready: 'Ước tính đã sẵn sàng.',
      unsupported: 'Kael chưa hỗ trợ yêu cầu này.',
    },
  },
  en: {
    attach: 'Photo',
    attachHint: 'If a photo is needed, Kael will ask for it in this session.',
    back: 'Close',
    chatTitle: 'Kael Command Home',
    chooseService: 'Choose a service so Kael can start the right intake.',
    composerPlaceholder: 'Describe the issue, apartment location, safety signs...',
    confirm: 'Confirm worker search',
    confirmArmed: 'Yes, find worker',
    confirmPrompt: 'Confirm worker search with this estimate?',
    confirmed: 'Request created. Kael is moving to worker search.',
    confirming: 'Confirming',
    emptyTitle: 'Start with electrical, plumbing, or cleaning',
    errorNoService: 'Choose a service before sending details.',
    errorUnknown: 'Kael could not update this session. Please try again.',
    estimateTitle: 'Kael estimate',
    estimateProblemFallback: 'Kael classified the issue.',
    estimateDisclaimerFallback: 'This is a reference estimate. The worker confirms scope and actual price before starting.',
    history: 'View activity',
    loading: 'Loading Kael session',
    noWorkerConfirmed: 'Request created. No suitable worker is available yet, so Kael will keep tracking it in Activity.',
    noEstimate: 'Kael needs more detail before estimating.',
    retry: 'Try again',
    send: 'Send',
    sending: 'Sending',
    subtitle: 'Kael clarifies the issue, builds an estimate, then searches only after you confirm.',
    turnFallback: 'Kael updated the session.',
    unsupported: 'Unsupported service',
    labels: {
      advisory: 'Advisory',
      complexity: 'Complexity',
      confidence: 'Confidence',
      problem: 'Problem',
      service: 'Service',
      status: 'Status',
      price: 'Price range',
    },
    complexity: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
    },
    nextAction: {
      ask_photo: 'Kael may need a clearer photo.',
      ask_video: 'Kael may need a short video.',
      await_input: 'Add more detail so Kael can classify the issue.',
      budget_exceeded: 'The estimate may exceed the initial budget.',
      confirmed: 'Worker search confirmed.',
      estimate_ready: 'Estimate is ready.',
      unsupported: 'Kael does not support this request yet.',
    },
  },
} as const

export function KaelChatSurface() {
  const { replace } = useRouter()
  const params = useLocalSearchParams()
  const language = useAppLanguage()
  const text = copy[language]
  const { actions } = useFrontendWorkflow()
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const routeService = useMemo(() => parseServiceType(firstParam(params.serviceType)), [params.serviceType])
  const routeSessionId = useMemo(() => firstParam(params.sessionId), [params.sessionId])
  const [state, dispatch] = useReducer(kaelChatReducer, routeService, createInitialKaelChatState)
  const addressDistrictRef = useRef<string | null>(null)
  const {
    addressLabel,
    confirmArmed,
    confirmedMessage,
    confirming,
    draft,
    error,
    loading,
    selectedService,
    sending,
    session,
  } = state
  const estimate = session?.session.estimate ?? session?.turns.find((turn) => turn.estimate)?.estimate ?? null
  const turns = session?.turns ?? []
  const historyTarget = session?.session.job_id ? `/(customer)/history?job_id=${encodeURIComponent(session.session.job_id)}` : '/(customer)/history'

  useEffect(() => {
    dispatch({ type: 'syncRouteService', service: routeService, routeSessionId })
  }, [routeService, routeSessionId])

  useEffect(() => {
    if (routeSessionId) return
    const pendingDraft = takePendingKaelChatDraft()
    if (!pendingDraft) return
    dispatch({
      type: 'applyPendingDraft',
      service: pendingDraft.serviceType ?? null,
      message: pendingDraft.message,
    })
  }, [routeSessionId])

  useEffect(() => {
    if (!routeSessionId) return
    let cancelled = false
    dispatch({ type: 'loadSessionStarted' })

    void kaelChatService
      .get(routeSessionId)
      .then((result) => {
        if (cancelled) return
        if (result.success) {
          dispatch({ type: 'loadSessionSucceeded', session: result.data })
        } else {
          dispatch({ type: 'loadSessionFailed', error: localizedKaelChatError(result.error, language) })
        }
      })
      .catch((unknownError: unknown) => {
        if (cancelled) return
        dispatch({
          type: 'loadSessionFailed',
          error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
        })
      })

    return () => {
      cancelled = true
    }
  }, [language, routeSessionId, text.errorUnknown])

  const sendTurn = async () => {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    if (!selectedService && !session) {
      dispatch({ type: 'showTransientError', error: text.errorNoService })
      return
    }

    dispatch({ type: 'sendStarted' })

    try {
      const addressPayload = addressLabel.trim()
      const addressFields = {
        address_label: addressPayload || undefined,
        address_district: addressDistrictRef.current ?? undefined,
      }
      const result = session
        ? await kaelChatService.sendTurn(session.session.id, { message: trimmed, photo_urls: [], ...addressFields })
        : await kaelChatService.create({
            service_type: selectedService as ServiceType,
            message: trimmed,
            problem_chips: [],
            photo_urls: [],
            ...addressFields,
          })

      if (result.success) {
        dispatch({ type: 'sendSucceeded', session: result.data })
      } else {
        dispatch({ type: 'sendFailed', error: localizedKaelChatError(result.error, language) })
      }
    } catch (unknownError: unknown) {
      dispatch({
        type: 'sendFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    }
  }

  const confirmSearch = async () => {
    if (!session || !estimate || confirming) return
    if (!confirmArmed) {
      dispatch({ type: 'confirmArmed' })
      return
    }
    dispatch({ type: 'confirmStarted' })

    try {
      const result = await kaelChatService.confirm(session.session.id)
      if (result.success) {
        const confirmationFallback = result.data.broadcast_sent ? text.confirmed : text.noWorkerConfirmed
        dispatch({
          type: 'confirmSucceeded',
          message: localizedGeneratedText(result.data.message || confirmationFallback, language, confirmationFallback),
          jobId: result.data.job_id,
          status: result.data.status,
        })
        await actions.hydrateRemoteJobById(result.data.job_id)
      } else {
        dispatch({ type: 'confirmFailed', error: localizedKaelChatError(result.error, language) })
      }
    } catch (unknownError: unknown) {
      dispatch({
        type: 'confirmFailed',
        error: localizedKaelChatError(errorMessage(unknownError, text.errorUnknown), language),
      })
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.canvas }]} testID="customer-kael-chat-stack-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={text.back} accessibilityRole="button" onPress={() => replace('/(customer)/kael')} style={({ pressed }) => [styles.closeButton, { borderColor: tokens.border, backgroundColor: tokens.raised }, pressed ? styles.pressed : null]} testID="customer-kael-chat-close">
            <ChatBackIcon color={tokens.primary} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
              {text.chatTitle}
            </Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]} numberOfLines={2}>
              {text.subtitle}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.summaryCard, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-service-picker">
            <Text style={[styles.sectionTitle, { color: tokens.text }]} numberOfLines={2}>
              {selectedService ? localizedServiceLabel(selectedService, language) : text.emptyTitle}
            </Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
              {text.chooseService}
            </Text>
            <View style={styles.chipRow}>
              {supportedServices.map((service) => {
                const selected = selectedService === service
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={service}
                    onPress={() => {
                      dispatch({ type: 'selectService', service })
                    }}
                    style={({ pressed }) => [
                      styles.serviceChip,
                      {
                        backgroundColor: selected ? tokens.primary : tokens.service,
                        borderColor: selected ? tokens.primary : tokens.border,
                      },
                      pressed ? styles.pressed : null,
                    ]}
                    testID={`customer-kael-chat-service-${service}`}
                  >
                    <Text style={[styles.chipText, { color: selected ? tokens.primaryText : tokens.text }]} numberOfLines={1}>
                      {localizedServiceLabel(service, language)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <AddressAutocomplete
              language={language}
              onChange={(value, district) => {
                dispatch({ type: 'setAddress', value })
                addressDistrictRef.current = district
              }}
              value={addressLabel}
            />
          </View>

          {loading ? (
            <View style={[styles.stateCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.bodyText, { color: tokens.muted }]}>{text.loading}</Text>
            </View>
          ) : null}

          <View style={styles.turnList} testID="customer-kael-chat-history">
            {turns.length === 0 && !loading ? (
              <View style={[styles.stateCard, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>{text.noEstimate}</Text>
                <Text style={[styles.bodyText, { color: tokens.muted }]}>{text.attachHint}</Text>
              </View>
            ) : null}
            {turns.map((turn) => (
              <ChatTurn key={turn.id} language={language} turn={turn} />
            ))}
          </View>

          {estimate ? (
            <EstimateCard estimate={estimate} language={language} onConfirm={confirmSearch} confirming={confirming} confirmed={session?.session.next_action === 'confirmed'} confirmArmed={confirmArmed} />
          ) : null}

          {confirmedMessage ? (
            <View style={[styles.stateCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-confirmed">
              <Text style={[styles.sectionTitle, { color: tokens.text }]}>{confirmedMessage}</Text>
              <Pressable accessibilityRole="button" onPress={() => replace(historyTarget)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: tokens.primary }, pressed ? styles.pressed : null]} testID="customer-kael-chat-history-action">
                <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]}>{text.history}</Text>
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.errorCard, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-error">
              <Text style={[styles.errorText, { color: tokens.text }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
          <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'showTransientError', error: text.attachHint })} style={({ pressed }) => [styles.attachButton, { borderColor: tokens.border, backgroundColor: tokens.service }, pressed ? styles.pressed : null]} testID="customer-kael-chat-attach">
            <Text style={[styles.attachText, { color: tokens.text }]}>{text.attach}</Text>
          </Pressable>
          <TextInput
            multiline
            onChangeText={(value) => {
              dispatch({
                type: 'setDraft',
                value,
                clearTransientError: error === text.errorNoService || error === text.attachHint,
              })
            }}
            placeholder={text.composerPlaceholder}
            placeholderTextColor={tokens.subtleText}
            style={[styles.input, { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.base }]}
            testID="customer-kael-chat-input"
            value={draft}
          />
          <Pressable accessibilityRole="button" disabled={sending || draft.trim().length === 0} onPress={sendTurn} style={({ pressed }) => [styles.sendButton, { backgroundColor: draft.trim().length > 0 ? tokens.primary : tokens.disabled }, pressed ? styles.pressed : null]} testID="customer-kael-chat-send">
            <Text style={[styles.sendText, { color: draft.trim().length > 0 ? tokens.primaryText : tokens.subtleText }]}>{sending ? text.sending : text.send}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ChatBackIcon({ color }: { color: string }) {
  return (
    <Svg accessible={false} width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18 9 12l6-6" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatTurn({ language, turn }: { language: AppLanguage; turn: KaelChatTurn }) {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const text = copy[language]
  const isCustomer = turn.role === 'customer'
  const rawBody = turn.text_content ?? turn.estimate?.problem_summary ?? text.turnFallback
  const body = isCustomer ? rawBody : localizedGeneratedText(rawBody, language, text.turnFallback)

  return (
    <View style={[styles.turnBubble, isCustomer ? styles.customerTurn : styles.kaelTurn, { backgroundColor: isCustomer ? tokens.service : tokens.raised, borderColor: tokens.border }]} testID={`customer-kael-chat-turn-${turn.role}`}>
      <Text style={[styles.turnRole, { color: isCustomer ? tokens.muted : tokens.primary }]}>{isCustomer ? localizedRoleCustomer(language) : 'Kael'}</Text>
      <Text style={[styles.turnText, { color: tokens.text }]}>{body}</Text>
      {turn.estimate ? <EstimateInline estimate={turn.estimate} language={language} /> : null}
    </View>
  )
}

function EstimateInline({
  estimate,
  language,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
}) {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const text = copy[language]

  return (
    <View style={[styles.inlineEstimate, { borderColor: tokens.border }]}>
      <Text style={[styles.inlineEstimateText, { color: tokens.muted }]}>
        {text.labels.price}: {formatPriceRange(estimate.price_min, estimate.price_max)}
      </Text>
    </View>
  )
}

function EstimateCard({
  confirming,
  confirmed,
  confirmArmed,
  estimate,
  language,
  onConfirm,
}: {
  confirming: boolean
  confirmed: boolean
  confirmArmed: boolean
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  onConfirm: () => void
}) {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const text = copy[language]
  const problem = localizedGeneratedText(estimate.problem_summary || estimate.problem_category, language, text.estimateProblemFallback)
  const advisory = localizedOptionalGeneratedText(estimate.advisory, language)
  const disclaimer = localizedGeneratedText(estimate.disclaimer, language, text.estimateDisclaimerFallback)

  return (
    <View style={[styles.estimateCard, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-estimate-card">
      <View style={styles.estimateHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{text.estimateTitle}</Text>
        <Text style={[styles.statusPill, { color: tokens.primary, borderColor: tokens.border, backgroundColor: tokens.service }]}>{text.nextAction.estimate_ready}</Text>
      </View>
      <InfoRow label={text.labels.service} value={localizedServiceLabel(estimate.service_type, language)} />
      <InfoRow label={text.labels.problem} value={problem} />
      <InfoRow label={text.labels.price} value={formatPriceRange(estimate.price_min, estimate.price_max)} />
      <InfoRow label={text.labels.complexity} value={text.complexity[estimate.complexity]} />
      <InfoRow label={text.labels.confidence} value={`${Math.round(estimate.confidence * 100)}%`} />
      {advisory ? <InfoRow label={text.labels.advisory} value={advisory} /> : null}
      <Text style={[styles.disclaimer, { color: tokens.muted }]} testID="customer-kael-chat-price-disclaimer">
        {disclaimer}
      </Text>
      {confirmArmed && !confirmed ? (
        <View style={[styles.confirmPrompt, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-inline-confirmation">
          <Text style={[styles.confirmPromptText, { color: tokens.text }]}>{text.confirmPrompt}</Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" disabled={confirmed || confirming} onPress={onConfirm} style={({ pressed }) => [styles.primaryButton, { backgroundColor: confirmed ? tokens.disabled : tokens.primary }, pressed ? styles.pressed : null]} testID="customer-kael-chat-confirm">
        <Text style={[styles.primaryButtonText, { color: confirmed ? tokens.subtleText : tokens.primaryText }]}>{confirming ? text.confirming : confirmed ? text.nextAction.confirmed : confirmArmed ? text.confirmArmed : text.confirm}</Text>
      </Pressable>
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: tokens.text }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  )
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseServiceType(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}

function formatPriceRange(min: number, max: number) {
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback
}

function localizedRoleCustomer(language: AppLanguage) {
  return language === 'en' ? 'You' : 'Bạn'
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

function localizedOptionalGeneratedText(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return null
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return null
  return trimmed
}

function localizedKaelChatError(error: string, language: AppLanguage) {
  const hasVietnameseSignal = vietnameseSignalPattern.test(error)
  if (language === 'en' && hasVietnameseSignal) {
    return 'Kael could not update this session. Please try again.'
  }
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(error)) {
    return 'Kael chưa thể cập nhật phiên này. Vui lòng thử lại.'
  }
  return error
}
