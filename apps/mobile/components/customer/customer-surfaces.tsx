import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

const CUSTOMER_V4_PRODUCTION_STANDARD = 'CUSTOMER_V4_PRODUCTION_STANDARD: accepted customer V4 production standard'
const CUSTOMER_V4_VISUAL_CONTRACT = 'CUSTOMER_V4_VISUAL_CONTRACT: production surfaces replace old customer UI'
const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'
const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute V4 dock'
const CUSTOMER_LAYER_ECOLOGY_V4 = 'CUSTOMER_LAYER_ECOLOGY_V4: glass mint surfaces, warm orb, compact copy'
const SEMANTIC_LAYER_SWITCH_V4 = 'SEMANTIC_LAYER_SWITCH_V4: light/dark swaps semantic V4 layers'
const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'
const KAEL_CHATBOX_SCREEN_CONTRACT = 'KAEL_CHATBOX_SCREEN_CONTRACT: local transaction-intent chatbox'
const KAEL_TICKET_COMPOSER_V3 = 'KAEL_TICKET_COMPOSER_V3: Kael asks, fills a repair ticket, then routes to booking'
const CUSTOMER_THEME_STORAGE_KEY = 'customer.theme.mode.v4'
const CUSTOMER_LANGUAGE_STORAGE_KEY = 'customer.language.mode.v4'
const customerDockHeight = 70
const customerDockBottomMargin = 10
const customerDockBottomClearance = customerDockHeight + customerDockBottomMargin + 44
const customerFrameHorizontalPadding = 16
const openBookingPath = '/(customer)/booking'
const kaelModel8A = require('../../assets/kael-model-8a.png')
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')

type ThemeMode = 'light' | 'dark'
export type CustomerLanguageMode = 'vi' | 'en'
type CustomerDockActive = 'activity' | 'booking' | 'home' | 'kael' | 'profile'
type SurfaceTone = 'base' | 'raised' | 'service' | 'water' | 'warm' | 'depth' | 'ghost' | 'disabled'
type PaymentMode = 'bank' | 'cod'
type IconName =
  | 'apartment'
  | 'boltPanel'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'document'
  | 'estimate'
  | 'filter'
  | 'history'
  | 'kael'
  | 'map'
  | 'notification'
  | 'payment'
  | 'person'
  | 'privacy'
  | 'review'
  | 'send'
  | 'support'
  | 'ticket'
  | 'waterPipe'

let lastCustomerDockActive: CustomerDockActive = 'home'

type CustomerThemeTokens = {
  mode: ThemeMode
  canvas: string
  base: string
  raised: string
  service: string
  water: string
  warm: string
  depthSurface: string
  ghost: string
  glass: string
  glassStrong: string
  glassWarm: string
  glassBorder: string
  glassHighlight: string
  glassShadow: string
  glassFloatShadow: string
  disabled: string
  border: string
  borderStrong: string
  text: string
  muted: string
  subtleText: string
  primary: string
  primaryText: string
  aqua: string
  copper: string
  danger: string
}

const lightLayer: CustomerThemeTokens = {
  mode: 'light',
  canvas: '#F4FAF7',
  base: '#FFFDF8',
  raised: '#FFFFFF',
  service: '#DCF3EC',
  water: '#E6F8F6',
  warm: '#FFF0DE',
  depthSurface: '#EAF6F1',
  ghost: 'rgba(255,253,248,0.78)',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 24px 70px rgba(13,70,65,0.18)',
  glassFloatShadow: '0 20px 52px rgba(13,70,65,0.14)',
  disabled: '#E5EEEA',
  border: '#D2E8E1',
  borderStrong: '#A9D9CF',
  text: '#102B2D',
  muted: '#667D7A',
  subtleText: '#829A95',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#51BBC0',
  copper: '#BB743D',
  danger: '#C94F45',
}

const darkLayer: CustomerThemeTokens = {
  mode: 'dark',
  canvas: '#071312',
  base: '#10201F',
  raised: '#162B28',
  service: '#173B35',
  water: '#15363A',
  warm: '#3B291B',
  depthSurface: '#0D1B1A',
  ghost: 'rgba(237,248,244,0.12)',
  glass: 'rgba(14,32,32,0.62)',
  glassStrong: 'rgba(19,43,42,0.74)',
  glassWarm: 'rgba(24,34,31,0.72)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassShadow: '0 24px 70px rgba(0,0,0,0.34)',
  glassFloatShadow: '0 20px 52px rgba(0,0,0,0.30)',
  disabled: '#172927',
  border: '#294A45',
  borderStrong: '#3B6A62',
  text: '#F0FBF7',
  muted: '#9AB6B0',
  subtleText: '#85A59E',
  primary: '#69DEC6',
  primaryText: '#071312',
  aqua: '#76DCE3',
  copper: '#E0A06B',
  danger: '#F29A8D',
}

export const CUSTOMER_THEME_TOKENS = {
  lightLayer,
  darkLayer,
}

const CustomerThemeContext = createContext<CustomerThemeTokens>(lightLayer)
let customerThemeMode: ThemeMode = 'light'
let customerThemeSubscribers: Array<() => void> = []
let customerThemeHydrated = false
let customerLanguageMode: CustomerLanguageMode = 'vi'
let customerLanguageSubscribers: Array<() => void> = []
let customerLanguageHydrated = false

function getCustomerThemeModeSnapshot() {
  return customerThemeMode
}

function subscribeCustomerThemeMode(listener: () => void) {
  customerThemeSubscribers = [...customerThemeSubscribers, listener]
  return () => {
    customerThemeSubscribers = customerThemeSubscribers.filter((item) => item !== listener)
  }
}

export function setCustomerThemeMode(nextMode: ThemeMode) {
  if (customerThemeMode === nextMode) return
  customerThemeMode = nextMode
  AsyncStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, nextMode).catch(() => undefined)
  for (const listener of customerThemeSubscribers) listener()
}

export function useCustomerThemeMode() {
  useEffect(() => {
    if (customerThemeHydrated) return
    customerThemeHydrated = true
    AsyncStorage.getItem(CUSTOMER_THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setCustomerThemeMode(stored)
      })
      .catch(() => undefined)
  }, [])

  return useSyncExternalStore(subscribeCustomerThemeMode, getCustomerThemeModeSnapshot, getCustomerThemeModeSnapshot)
}

export function getCustomerThemeTokens(mode: ThemeMode) {
  return mode === 'light' ? CUSTOMER_THEME_TOKENS.lightLayer : CUSTOMER_THEME_TOKENS.darkLayer
}

function getCustomerLanguageModeSnapshot() {
  return customerLanguageMode
}

function subscribeCustomerLanguageMode(listener: () => void) {
  customerLanguageSubscribers = [...customerLanguageSubscribers, listener]
  return () => {
    customerLanguageSubscribers = customerLanguageSubscribers.filter((item) => item !== listener)
  }
}

export function setCustomerLanguageMode(nextMode: CustomerLanguageMode) {
  if (customerLanguageMode === nextMode) return
  customerLanguageMode = nextMode
  AsyncStorage.setItem(CUSTOMER_LANGUAGE_STORAGE_KEY, nextMode).catch(() => undefined)
  for (const listener of customerLanguageSubscribers) listener()
}

export function useCustomerLanguageMode() {
  useEffect(() => {
    if (customerLanguageHydrated) return
    customerLanguageHydrated = true
    AsyncStorage.getItem(CUSTOMER_LANGUAGE_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'vi' || stored === 'en') setCustomerLanguageMode(stored)
      })
      .catch(() => undefined)
  }, [])

  return useSyncExternalStore(subscribeCustomerLanguageMode, getCustomerLanguageModeSnapshot, getCustomerLanguageModeSnapshot)
}

export function CustomerHomeSurface() {
  const router = useRouter()
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cod')
  const openBookingFlow = () => router.push(openBookingPath)

  return (
    <V4Frame active="home" testID="customer-home-surface">
      {({ tokens }) => (
        <>
          <V4MapBackdrop />
          <View style={styles.v4Content}>
            <Pressable style={[styles.searchPill, glassSurface(tokens, 'strong')]} onPress={openBookingFlow} testID="customer-home-search-entry">
              <GlassSheen />
              <IconGlyph name="estimate" color={tokens.primary} accent={tokens.copper} />
              <Text style={[styles.searchText, { color: tokens.muted }]} numberOfLines={1}>
                Bạn cần sửa gì?
              </Text>
            </Pressable>

            <View style={styles.homeMapSpace} />
            <View style={[styles.homeSheet, glassSurface(tokens, 'warm')]}>
              <GlassSheen />
              <View style={styles.hiddenMarker} testID="customer-home-signature-v4" />
              <View style={styles.hiddenMarker} testID="customer-home-layer-stack" />
              <View style={styles.hiddenMarker} testID="customer-home-hero-depth-grid" />
              <View style={styles.hiddenMarker} testID="customer-utility-notification-center" />
              <View style={styles.twoCol}>
                <V4ServiceCard icon="boltPanel" title="Sửa điện" testID="customer-shell-service-electrical" onPress={openBookingFlow} />
                <V4ServiceCard icon="waterPipe" title="Sửa nước" testID="customer-shell-service-plumbing" onPress={openBookingFlow} water />
              </View>
              <HomePaymentSection selectedMode={paymentMode} onSelectMode={setPaymentMode} />
              <View style={styles.sectionTitle}>
                <Text style={[styles.sectionHeading, { color: tokens.text }]} numberOfLines={1}>
                  Dịch vụ khác
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                  Đang khóa
                </Text>
              </View>
              <View style={styles.smallServiceGrid}>
                {['Điều hòa', 'Vệ sinh', 'Thiết bị', 'Sửa vặt'].map((label) => (
                  <View key={label} style={[styles.smallService, glassSurface(tokens)]}>
                    <GlassSheen />
                    <IconGlyph name="privacy" color={tokens.subtleText} accent={tokens.subtleText} />
                    <Text style={[styles.smallServiceText, { color: tokens.subtleText }]} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
              <Pressable style={[styles.promoCard, glassSurface(tokens, 'warm')]} onPress={openBookingFlow} testID="customer-home-layered-hero">
                <GlassSheen />
                <View style={[styles.promoMintCloud, { backgroundColor: tokens.aqua }]} />
                <View style={[styles.promoWarmCloud, { backgroundColor: tokens.copper }]} />
                <View style={[styles.promoOrb, { backgroundColor: tokens.raised, borderColor: tokens.border }]} />
                <Text style={[styles.promoTitle, { color: tokens.text }]} numberOfLines={4}>
                  Không biết giá chính là cái giá đắt nhất!
                </Text>
                <View style={styles.hiddenMarker} testID="customer-home-ticket-decor" />
              </Pressable>
              <View style={styles.hiddenMarker} testID="customer-home-other-services-message" />
              <View style={styles.hiddenMarker} testID="customer-home-relaxed-stage" />
              <View style={styles.hiddenMarker} testID="customer-home-coupon-strip" />
            </View>
          </View>
        </>
      )}
    </V4Frame>
  )
}

export function CustomerKaelSurface() {
  const router = useRouter()
  const [kaelDraft, setKaelDraft] = useState('')
  const [latestAnswer, setLatestAnswer] = useState('')
  const hasAnyKaelInfo = latestAnswer.trim().length > 0
  const hasEnoughKaelInfo = latestAnswer.trim().length >= 16
  const submitKaelLocalDraft = () => {
    const trimmed = kaelDraft.trim()
    if (!trimmed) return
    setLatestAnswer(trimmed)
    setKaelDraft('')
  }

  return (
    <V4Frame active="kael" testID="customer-kael-companion">
      {({ tokens }) => (
        <View style={styles.plainContent} accessibilityLabel={`${KAEL_CHATBOX_SCREEN_CONTRACT}; ${KAEL_TICKET_COMPOSER_V3}`}>
          <View style={[styles.kaelCard, glassSurface(tokens, 'depth')]} testID="customer-kael-chatbox">
            <GlassSheen />
            <View style={styles.hiddenMarker} testID="customer-kael-ticket-composer" />
            <View style={[styles.kaelChatStage, glassSurface(tokens, 'water'), !hasAnyKaelInfo ? styles.kaelChatStageEmpty : null]} testID="customer-kael-conversation-feed">
              <GlassSheen />
              <View style={styles.hiddenMarker} testID="customer-kael-empty-chat-state" />
              {!hasAnyKaelInfo ? (
                <View style={styles.kaelBlankCanvas} testID="customer-kael-empty-chat-canvas">
                  <View style={[styles.kaelCanvasOrbLarge, { backgroundColor: tokens.aqua }]} />
                  <View style={[styles.kaelCanvasOrbWarm, { backgroundColor: tokens.copper }]} />
                </View>
              ) : (
                <>
                  <View style={[styles.kaelUserBubble, glassSurface(tokens, 'strong')]} testID="customer-kael-user-message">
                    <Text style={[styles.bubbleTitle, styles.kaelUserText, { color: tokens.text }]} numberOfLines={3}>
                      {latestAnswer}
                    </Text>
                  </View>
                  {hasEnoughKaelInfo ? (
                    <View style={[styles.ticketCard, styles.kaelSummaryTicket, glassSurface(tokens, 'warm')]} testID="customer-kael-ticket-reveal-after-info">
                      <GlassSheen />
                      <View style={styles.hiddenMarker} testID="customer-kael-repair-ticket" />
                      <View style={styles.sectionTitle}>
                        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                          Phiếu tóm tắt
                        </Text>
                        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                          Gửi thợ sau xác nhận
                        </Text>
                      </View>
                      <View style={styles.twoCol}>
                        <V4TicketCell label="Dịch vụ" value="Sửa điện" testID="customer-kael-ticket-field-service" />
                        <V4TicketCell label="Rủi ro" value="Ổ nóng" testID="customer-kael-ticket-field-problem" />
                      </View>
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-field-location" />
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-field-media" />
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-progress" />
                      <PrimaryButton label="Qua Kiểm giá" onPress={() => router.push(openBookingPath)} compact testID="customer-kael-ticket-booking-cta" />
                    </View>
                  ) : null}
                </>
              )}
              <KaelComposer draft={kaelDraft} onChangeDraft={setKaelDraft} onSubmit={submitKaelLocalDraft} />
            </View>
            {hasEnoughKaelInfo ? (
              <View style={styles.chipRow}>
                <SmallChip label="Gửi ảnh" tone="water" />
                <SmallChip label="Bỏ qua ảnh" tone="base" />
                <SmallChip label="Sửa nội dung" tone="service" />
              </View>
            ) : null}
          </View>
          <View style={styles.hiddenMarker} testID="customer-kael-worker-placeholder" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerHistorySurface() {
  const router = useRouter()
  return (
    <V4Frame active="activity" testID="customer-history-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={[styles.filterRow, glassSurface(tokens, 'strong')]} testID="customer-history-filter-shell">
            <GlassSheen />
            {['Sửa', 'Kiểm giá', 'Trò chuyện', 'Xong'].map((label, index) => (
              <View key={label} style={[styles.filterChip, index === 0 ? { backgroundColor: tokens.primary } : { backgroundColor: tokens.raised }]}>
                <Text style={[styles.filterText, { color: index === 0 ? tokens.primaryText : tokens.muted }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.flowCard, glassSurface(tokens)]} testID="customer-history-empty-state">
            <GlassSheen />
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                Phiếu nháp
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                Nháp
              </Text>
            </View>
            <PrimaryButton label="Tiếp tục" onPress={() => router.push(openBookingPath)} compact />
          </View>
          <View style={[styles.flowCard, glassSurface(tokens, 'service')]} testID="customer-history-worker-placeholder">
            <GlassSheen />
            <View style={styles.workerCard}>
              <View style={[styles.workerAvatar, { backgroundColor: tokens.water, borderColor: tokens.glassBorder }]} />
              <View style={styles.listCopy}>
                <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
                  Chờ ghép thợ
                </Text>
                <View style={styles.workerMetaRow}>
                  {['Rating', 'Số việc', 'ETA'].map((label) => (
                    <Text key={label} style={[styles.workerMetaPill, { color: tokens.primary, backgroundColor: tokens.glassStrong }]} numberOfLines={1}>
                      {label}
                    </Text>
                  ))}
                </View>
              </View>
              <PrimaryButton label="Chat" onPress={() => router.push('/(customer)/kael')} compact />
            </View>
          </View>
          <View style={[styles.flowCard, glassSurface(tokens)]}>
            <GlassSheen />
            <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
              Trạng thái việc
            </Text>
            {['Đã đặt', 'Thợ đang đến', 'Đã đến', 'Đang kiểm tra', 'Đang sửa', 'Hoàn tất'].map((label, index) => (
              <View key={label} style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: index < 3 ? tokens.primary : tokens.borderStrong }]} />
                <Text style={[styles.timelineText, { color: tokens.text }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.flowCard, glassSurface(tokens, 'warm')]}>
            <GlassSheen />
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                Xác nhận đổi phạm vi
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                Chờ bạn
              </Text>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label="Cũ" value="Ổ cắm nóng" />
              <V4TicketCell label="Mới" value="Dây lỏng" />
            </View>
          </View>
          <View style={[styles.flowCard, glassSurface(tokens)]}>
            <GlassSheen />
            <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
              Hoàn tất & bằng chứng
            </Text>
            <View style={styles.twoCol}>
              <View style={[styles.evidenceTile, glassSurface(tokens, 'strong')]}>
                <Text style={[styles.evidenceText, { color: tokens.muted }]} numberOfLines={1}>Ảnh trước</Text>
              </View>
              <View style={[styles.evidenceTile, glassSurface(tokens, 'strong')]}>
                <Text style={[styles.evidenceText, { color: tokens.muted }]} numberOfLines={1}>Ảnh sau</Text>
              </View>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label="Giá cuối" value="Chờ xác nhận" />
              <V4TicketCell label="Trạng thái" value="Pending" />
            </View>
          </View>
          <View style={[styles.flowCard, glassSurface(tokens)]}>
            <GlassSheen />
            <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
              Thanh toán & đánh giá
            </Text>
            <View style={styles.twoCol}>
              <V4TicketCell label="Thanh toán" value="Tiền mặt" />
              <V4TicketCell label="Trạng thái" value="Chờ xác nhận" />
            </View>
            <View style={[styles.ratingGlass, glassSurface(tokens, 'warm')]}>
              <RatingStarGlass />
            </View>
            <View style={styles.chipRow}>
              <SmallChip label="Đúng giờ" tone="water" />
              <SmallChip label="Rõ giá" tone="service" />
              <SmallChip label="Giải thích rõ" tone="base" />
            </View>
          </View>
          <View style={[styles.flowCard, glassSurface(tokens)]}>
            <GlassSheen />
            <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
              Các trạng thái
            </Text>
            <View style={styles.stateGrid}>
              {['Đang tải', 'Trống', 'Lỗi', 'Thành công'].map((label) => (
                <View key={label} style={[styles.statePill, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}>
                  <View style={[styles.stateDot, { backgroundColor: tokens.subtleText }]} />
                  <Text style={[styles.stateText, { color: tokens.muted }]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-history-data" />
          <View style={styles.hiddenMarker} testID="customer-history-evidence-timeline" />
          <View style={styles.hiddenMarker} testID="customer-history-stage-map" />
          <View style={styles.hiddenMarker} testID="customer-history-scope-change-placeholder" />
          <View style={styles.hiddenMarker} testID="customer-history-completion-placeholder" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerProfileSurface() {
  const themeMode = useCustomerThemeMode()
  const languageMode = useCustomerLanguageMode()
  const toggleLanguage = () => setCustomerLanguageMode(languageMode === 'vi' ? 'en' : 'vi')
  const toggleTheme = () => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')

  return (
    <V4Frame active="profile" testID="customer-profile-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={[styles.profileHead, glassSurface(tokens)]} testID="customer-profile-empty-state">
            <GlassSheen />
            <KaelMascot variant="head" size={58} />
            <Text style={[styles.profileName, { color: tokens.text }]} numberOfLines={1}>
              Phan Mạnh Tú
            </Text>
            <View style={[styles.profileButton, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}>
              <Text style={[styles.profileButtonText, { color: tokens.primary }]} numberOfLines={1}>
                Hồ sơ
              </Text>
            </View>
          </View>
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-profile-save" />
          <View style={[styles.statusCard, glassSurface(tokens, 'service')]} testID="customer-profile-status-card">
            <GlassSheen />
            <View style={[styles.statusOrb, { backgroundColor: tokens.raised }]} />
            <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
              CĂN HỘ
            </Text>
            <Text style={[styles.statusTitle, { color: tokens.text }]} numberOfLines={1}>
              Sẵn sàng
            </Text>
            <View style={styles.metricRow}>
              <V4Metric label="Phiếu nháp" value="Có" />
              <V4Metric label="Dịch vụ" value="Điện/nước" />
              <V4Metric label="Dữ liệu" value="Ẩn" />
            </View>
          </View>
          <View style={styles.quickGrid}>
            <QuickCard icon="payment" title="Thanh toán sau" />
            <QuickCard icon="apartment" title="Căn hộ" />
            <QuickCard icon="privacy" title="Riêng tư" testID="customer-profile-privacy-shell" />
          </View>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.profileActionsScroll}>
            <View style={[styles.listCard, glassSurface(tokens)]} testID="customer-profile-checklist">
              <GlassSheen />
              <View style={styles.hiddenMarker} testID="customer-profile-unified-functions" />
              <ListRow icon="map" title="Địa chỉ" meta="Chưa lưu" testID="customer-utility-saved-address" />
              <ListRow icon="kael" title="Quản Gia Kael" meta="Điện / nước" />
              <ListRow icon="history" title="Lịch sử" meta="Trống" testID="customer-profile-evidence-shell" />
              <ListRow icon="ticket" title="Phiếu dịch vụ" meta="Sắp mở" testID="customer-utility-ticket-wallet" />
              <ListRow icon="support" title="Hỗ trợ" meta="Sau này" testID="customer-utility-support-entry" />
              <SwitchRow icon="person" title="Ngôn ngữ" meta={languageMode === 'vi' ? 'Tiếng Việt' : 'English'} active={languageMode === 'en'} onPress={toggleLanguage} testID="customer-language-toggle" />
              <SwitchRow icon="privacy" title="Giao diện" meta={themeMode === 'light' ? 'Sáng' : 'Tối'} active={themeMode === 'dark'} onPress={toggleTheme} testID="customer-dark-mode-toggle-profile" />
              <View style={styles.hiddenMarker} testID="customer-profile-payment-placeholder" />
              <View style={styles.hiddenMarker} testID="customer-profile-review-placeholder" />
            </View>
          </ScrollView>
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerV4DockOverlay({ active }: { active: CustomerDockActive }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const frameWidth = Math.min(width, 430)

  return (
    <CustomerThemeContext.Provider value={tokens}>
      <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} screenWidth={width} />
    </CustomerThemeContext.Provider>
  )
}

function V4Frame({
  active,
  children,
  testID,
}: {
  active: CustomerDockActive
  children: (props: { tokens: CustomerThemeTokens; mode: ThemeMode }) => ReactNode
  testID: string
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const frameWidth = Math.min(width, 430)
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage:
      themeMode === 'dark'
        ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.16), transparent 30%), linear-gradient(180deg, #071312 0%, #141B18 100%)'
        : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.35), transparent 28%), linear-gradient(180deg, #f2fbf7 0%, #fff9ee 100%)',
  } as any

  return (
    <SafeAreaView style={[styles.safeArea, canvasLayer]} testID={testID}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <CustomerThemeContext.Provider value={tokens}>
        <AmbientGlassField frameWidth={frameWidth} screenWidth={width} />
        <ScrollView
          contentContainerStyle={[
            styles.v4Scroll,
            {
              alignSelf: 'center',
              maxWidth: 430,
              minHeight: '100%',
              paddingBottom: Math.max(insets.bottom + customerDockBottomClearance, customerDockBottomClearance),
              paddingTop: Math.max(insets.top + 8, 20),
              width: Math.max(0, frameWidth - customerFrameHorizontalPadding * 4),
            },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={[styles.scroll, { backgroundColor: tokens.canvas }]}
        >
          <View
            accessibilityLabel={`${CUSTOMER_V4_PRODUCTION_STANDARD}; ${CUSTOMER_V4_VISUAL_CONTRACT}; ${CUSTOMER_SHARED_THEME_STORE}; ${CUSTOMER_DOCK_SCROLL_CLEARANCE}; ${CUSTOMER_LAYER_ECOLOGY_V4}; ${SEMANTIC_LAYER_SWITCH_V4}; ${COPY_DENSITY_COMPACT}`}
            style={styles.hiddenMarker}
            testID="customer-dark-layer-ecology"
          />
          <View style={styles.hiddenMarker} testID="customer-shell-motion-field" />
          <View style={styles.hiddenMarker} testID="customer-theme-layer-switch" />
          {children({ tokens, mode: themeMode })}
        </ScrollView>
        <MotionSweep frameWidth={frameWidth} screenWidth={width} />
        <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} screenWidth={width} />
      </CustomerThemeContext.Provider>
    </SafeAreaView>
  )
}

function V4Dock({
  active,
  bottomInset,
  frameWidth,
  screenWidth,
}: {
  active: CustomerDockActive
  bottomInset: number
  frameWidth: number
  screenWidth: number
}) {
  const router = useRouter()
  const tokens = useCustomerTokens()
  const dockPulse = useSharedValue(0)
  const dockSweep = useSharedValue(0)
  const dockWidth = Math.max(0, frameWidth - 82)
  const dockLeft = Math.max((screenWidth - frameWidth) / 2 + 41, 41)
  const bottom = Math.max(bottomInset + customerDockBottomMargin, customerDockBottomMargin)
  const items = [
    { key: 'home' as const, icon: 'apartment' as const, path: '/(customer)/home' as const },
    { key: 'booking' as const, icon: 'document' as const, path: openBookingPath },
    { key: 'kael' as const, icon: 'kael' as const, path: '/(customer)/kael' as const },
    { key: 'activity' as const, icon: 'history' as const, path: '/(customer)/history' as const },
    { key: 'profile' as const, icon: 'person' as const, path: '/(customer)/profile' as const },
  ]
  const activeIndex = Math.max(items.findIndex((item) => item.key === active), 0)
  const previousActiveIndex = Math.max(items.findIndex((item) => item.key === lastCustomerDockActive), 0)
  const slotWidth = dockWidth / items.length
  const liquidLeft = activeIndex * slotWidth + slotWidth / 2 - 40
  const previousLiquidLeft = previousActiveIndex * slotWidth + slotWidth / 2 - 40
  const liquidX = useSharedValue(previousLiquidLeft)
  const liquidWake = useSharedValue(1)

  useEffect(() => {
    dockPulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true)
    dockSweep.value = withRepeat(withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.quad) }), -1, false)
  }, [dockPulse, dockSweep])

  useEffect(() => {
    liquidX.value = withSpring(liquidLeft, { damping: 15, mass: 0.72, stiffness: 132 })
    liquidWake.value = 0
    liquidWake.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    lastCustomerDockActive = active
  }, [active, liquidLeft, liquidWake, liquidX])

  const dockHaloStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + dockPulse.value * 0.2,
    transform: [{ scaleX: 0.98 + dockPulse.value * 0.045 }, { scaleY: 0.94 + dockPulse.value * 0.06 }],
  }))
  const dockSheenStyle = useAnimatedStyle(() => ({
    opacity: dockSweep.value < 0.08 ? dockSweep.value * 2.4 : dockSweep.value > 0.92 ? (1 - dockSweep.value) * 2.4 : 0.22,
    transform: [{ translateX: -70 + dockSweep.value * (dockWidth + 140) }, { rotate: '11deg' }],
  }))
  const activeGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + dockPulse.value * 0.22,
    transform: [{ scale: 0.92 + dockPulse.value * 0.16 }],
  }))
  const liquidPoolStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + dockPulse.value * 0.18,
    transform: [{ translateX: liquidX.value }, { scaleX: 0.94 + dockPulse.value * 0.16 }, { scaleY: 0.86 + dockPulse.value * 0.12 }],
  }))
  const liquidWakeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - liquidWake.value) * 0.24,
    transform: [{ translateX: liquidX.value - 8 + liquidWake.value * 16 }, { scaleX: 0.82 + liquidWake.value * 0.5 }, { scaleY: 0.74 + liquidWake.value * 0.18 }],
  }))

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, left: dockLeft, width: dockWidth }]}>
      <Animated.View pointerEvents="none" style={[styles.dockGlassAura, { backgroundColor: tokens.aqua }, dockHaloStyle]} testID="customer-dock-glass-aura" />
      <View pointerEvents="none" style={[styles.dockWarmAura, { backgroundColor: tokens.copper }]} />
      <View style={[styles.glassDock, glassSurface(tokens, 'strong')]}>
        <GlassSheen />
        <Animated.View pointerEvents="none" style={[styles.dockLiquidWake, { backgroundColor: tokens.primary }, liquidWakeStyle]} testID="customer-dock-liquid-wake" />
        <Animated.View pointerEvents="none" style={[styles.dockLiquidPool, { backgroundColor: tokens.aqua }, liquidPoolStyle]} testID="customer-dock-liquid-pool" />
        <View pointerEvents="none" style={[styles.dockBottomReflection, { backgroundColor: tokens.glassHighlight }]} />
        <Animated.View pointerEvents="none" style={[styles.dockMotionSheen, { backgroundColor: tokens.glassHighlight }, dockSheenStyle]} testID="customer-dock-motion-sheen" />
        {items.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.key}
            onPress={() => router.push(item.path)}
            style={[styles.dockItem, active === item.key ? styles.dockItemActive : null]}
            testID={`customer-v4-dock-${item.key}`}
          >
            {active === item.key ? <Animated.View pointerEvents="none" style={[styles.dockActiveGlow, { backgroundColor: tokens.aqua }, activeGlowStyle]} /> : null}
            {item.icon === 'kael' ? (
              <Image resizeMode="contain" source={kaelModel8AHead} style={styles.dockKaelImage} />
            ) : (
              <IconGlyph name={item.icon} color={active === item.key ? tokens.primary : tokens.subtleText} accent={active === item.key ? tokens.copper : tokens.subtleText} />
            )}
            {active === item.key ? <View style={[styles.dockDot, { backgroundColor: tokens.primary }]} /> : null}
          </Pressable>
        ))}
      </View>
      <View pointerEvents="none" style={[styles.floatingAward, glassSurface(tokens, 'warm')]}>
        <GlassSheen />
        <IconGlyph name="privacy" color={tokens.primary} accent={tokens.copper} />
      </View>
    </View>
  )
}

function MotionSweep({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }), -1, false)
  }, [progress])

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.14 ? progress.value * 1.4 : progress.value > 0.86 ? (1 - progress.value) * 1.4 : 0.16,
    transform: [{ translateX: -120 + progress.value * (frameWidth + 240) }, { rotate: '8deg' }],
  }))
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return <Animated.View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.glassHighlight, left }, sweepStyle]} />
}

function AmbientGlassField({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const drift = useSharedValue(0)

  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 6200, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [drift])

  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.13 + drift.value * 0.08,
    transform: [{ translateY: -10 + drift.value * 18 }, { scale: 0.98 + drift.value * 0.04 }],
  }))
  const lineStyle = useAnimatedStyle(() => ({
    opacity: 0.11 + drift.value * 0.06,
    transform: [{ rotate: '-12deg' }, { translateX: -12 + drift.value * 24 }],
  }))
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return (
    <View pointerEvents="none" style={[styles.ambientGlassField, { left, width: frameWidth }]} testID="customer-section-glass-field">
      <Animated.View style={[styles.ambientOrbMint, { backgroundColor: tokens.aqua }, orbStyle]} />
      <View style={[styles.ambientOrbWarm, { backgroundColor: tokens.copper }]} />
      <Animated.View style={[styles.ambientGlassLine, { backgroundColor: tokens.borderStrong }, lineStyle]} />
    </View>
  )
}

function V4MapBackdrop() {
  const tokens = useCustomerTokens()
  const pulse = useSharedValue(0)
  const route = useSharedValue(0)

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true)
    route.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [pulse, route])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.26 + pulse.value * 0.22,
    transform: [{ translateX: -59 }, { scale: 0.96 + pulse.value * 0.12 }],
  }))
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -9 }, { scale: 1 + pulse.value * 0.08 }],
  }))
  const routeStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + route.value * 0.38,
    transform: [{ rotate: '-19deg' }, { scaleX: 0.72 + route.value * 0.28 }],
  }))
  const vehicleStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + route.value * 0.24,
    transform: [{ translateX: -54 + route.value * 108 }, { translateY: -10 + route.value * 22 }, { scale: 0.94 + pulse.value * 0.04 }],
  }))

  return (
    <View pointerEvents="none" style={styles.mapBackdrop}>
      <Animated.View style={[styles.mapGlow, { backgroundColor: tokens.aqua }, glowStyle]} />
      <Animated.View style={[styles.mapRoute, { backgroundColor: tokens.primary }, routeStyle]} />
      <View style={[styles.mapRouteSoft, { backgroundColor: tokens.aqua }]} />
      <Animated.View style={[styles.mapVehicle, glassSurface(tokens, 'strong'), vehicleStyle]}>
        <IconGlyph name="estimate" color={tokens.primary} accent={tokens.copper} />
      </Animated.View>
      <View style={[styles.mapLine, styles.mapLineOne, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineTwo, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineThree, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomOne, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomTwo, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomThree, { borderColor: tokens.borderStrong }]} />
      <Animated.View style={[styles.mapPin, { backgroundColor: tokens.primary, borderColor: tokens.glassBorder }, pinStyle]} />
      <View style={[styles.mapNode, styles.mapNodeElectric, glassSurface(tokens, 'strong')]}>
        <IconGlyph name="boltPanel" color={tokens.primary} accent={tokens.copper} />
      </View>
      <View style={[styles.mapNode, styles.mapNodeWater, glassSurface(tokens, 'strong')]}>
        <IconGlyph name="waterPipe" color={tokens.primary} accent={tokens.aqua} />
      </View>
    </View>
  )
}

function V4ServiceCard({ icon, onPress, testID, title, water }: { icon: IconName; onPress: () => void; testID: string; title: string; water?: boolean }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.serviceCard, glassSurface(tokens, water ? 'water' : 'service')]}
      testID={testID}
    >
      <GlassSheen />
      <View pointerEvents="none" style={[styles.glassRing, { borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(8,120,110,0.10)' }]} />
      <IconShell icon={icon} tone={water ? 'water' : 'service'} size={50} />
      <Text style={[styles.serviceTitle, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  )
}

function V4TicketCell({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.ticketCell, glassSurface(tokens, 'strong')]} testID={testID}>
      <GlassSheen />
      <Text style={[styles.ticketLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.ticketValue, { color: tokens.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function HomePaymentSection({ onSelectMode, selectedMode }: { onSelectMode: (mode: PaymentMode) => void; selectedMode: PaymentMode }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.paymentRail, glassSurface(tokens, 'service')]} testID="customer-home-payment-section">
      <GlassSheen />
      <View style={[styles.paymentWarmHalo, { backgroundColor: tokens.copper }]} />
      <View style={styles.sectionTitle}>
        <Text style={[styles.sectionHeading, { color: tokens.text }]} numberOfLines={1}>
          Thanh toán
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          Tùy chọn
        </Text>
      </View>
      <View style={styles.paymentOptions}>
        <PaymentOption
          active={selectedMode === 'bank'}
          icon="payment"
          meta="Kết nối"
          onPress={() => onSelectMode('bank')}
          testID="customer-home-bank-connect"
          title="Ngân hàng"
        />
        <PaymentOption
          active={selectedMode === 'cod'}
          icon="ticket"
          meta="Tiền mặt"
          onPress={() => onSelectMode('cod')}
          testID="customer-home-cod-payment"
          title="COD"
        />
      </View>
      <View style={styles.hiddenMarker} testID="customer-home-payment-local-only" />
    </View>
  )
}

function PaymentOption({ active, icon, meta, onPress, testID, title }: { active: boolean; icon: IconName; meta: string; onPress: () => void; testID: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.paymentOption,
        glassSurface(tokens, active ? 'strong' : 'default'),
        {
          borderColor: active ? tokens.borderStrong : tokens.glassBorder,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.paymentIconBubble, { backgroundColor: active ? tokens.service : tokens.raised, borderColor: tokens.border }]}>
        <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      </View>
      <View style={styles.paymentCopy}>
        <Text style={[styles.paymentTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.paymentMeta, { color: active ? tokens.primary : tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  )
}

function V4Metric({ label, value }: { label: string; value: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: tokens.primary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function QuickCard({ icon, testID, title }: { icon: IconName; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.quickCard, glassSurface(tokens)]} testID={testID}>
      <GlassSheen />
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <Text style={[styles.quickTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function ListRow({ icon, meta, testID, title }: { icon: IconName; meta: string; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.listRow} testID={testID}>
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
        ›
      </Text>
    </View>
  )
}

function SwitchRow({
  active,
  icon,
  meta,
  onPress,
  testID,
  title,
}: {
  active: boolean
  icon: IconName
  meta: string
  onPress: () => void
  testID: string
  title: string
}) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={onPress} style={styles.listRow} testID={testID}>
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={[styles.switchTrack, { backgroundColor: active ? tokens.service : tokens.disabled, borderColor: tokens.border }]}>
        <View style={[styles.switchKnob, { backgroundColor: active ? tokens.primary : tokens.raised, transform: [{ translateX: active ? 24 : 0 }] }]} />
      </View>
    </Pressable>
  )
}

function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable
      accessibilityLabel="Đổi giao diện sáng tối"
      accessibilityRole="switch"
      accessibilityState={{ checked: mode === 'dark' }}
      onPress={onToggle}
      style={[styles.themeToggle, { backgroundColor: mode === 'dark' ? tokens.service : tokens.depthSurface, borderColor: tokens.borderStrong }]}
      testID="customer-dark-mode-toggle"
    >
      <View style={[styles.themeKnob, { backgroundColor: mode === 'dark' ? tokens.primary : tokens.raised, transform: [{ translateX: mode === 'dark' ? 18 : 0 }] }]} />
    </Pressable>
  )
}

function IconButton({ accessibilityLabel, icon, markerTestID }: { accessibilityLabel: string; icon: IconName; markerTestID?: string }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" style={[styles.iconButton, glassSurface(tokens, 'strong')]} testID={markerTestID}>
      <GlassSheen />
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
    </Pressable>
  )
}

function IconShell({ icon, tone = 'service', size = 46 }: { icon: IconName; tone?: SurfaceTone; size?: number }) {
  const tokens = useCustomerTokens()
  const accent = tone === 'water' ? tokens.aqua : tone === 'warm' ? tokens.copper : tokens.copper
  return (
    <View
      style={[
        styles.iconShell,
        {
          ...glassSurface(tokens, tone === 'warm' ? 'warm' : tone === 'water' ? 'water' : 'service'),
          borderRadius: Math.max(14, Math.round(size * 0.36)),
          height: size,
          width: size,
        },
      ]}
    >
      <GlassSheen />
      <IconGlyph name={icon} color={tokens.primary} accent={accent} />
    </View>
  )
}

function KaelMascot({ size, variant }: { size: number; variant: 'head' | 'full' }) {
  const tokens = useCustomerTokens()
  const source = variant === 'head' ? kaelModel8AHead : kaelModel8A
  return (
    <View
      style={[
        styles.kaelMascotFrame,
        {
          ...glassSurface(tokens, 'water'),
          borderRadius: Math.round(size * 0.32),
          height: size,
          width: size,
        },
      ]}
      testID={variant === 'head' ? 'kael-model-8a-head.png' : 'kael-model-8a.png'}
    >
      <GlassSheen />
      <Image resizeMode="contain" source={source} style={{ height: variant === 'head' ? size * 0.9 : size * 1.1, width: variant === 'head' ? size * 0.9 : size * 1.05 }} />
    </View>
  )
}

function PrimaryButton({ compact, label, onPress, testID }: { compact?: boolean; label: string; onPress: () => void; testID?: string }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.primaryButton, compact ? styles.primaryButtonCompact : null, { backgroundColor: tokens.primary }]} testID={testID}>
      <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function KaelComposer({
  draft,
  onChangeDraft,
  onSubmit,
}: {
  draft: string
  onChangeDraft: (value: string) => void
  onSubmit: () => void
}) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.composer, styles.kaelComposerInline, glassSurface(tokens, 'strong')]} testID="customer-kael-composer-dock">
      <GlassSheen />
      <Pressable accessibilityLabel="Thêm ảnh" accessibilityRole="button" style={[styles.composerTool, { borderColor: tokens.border }]}>
        <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
          +
        </Text>
      </Pressable>
      <TextInput
        onChangeText={onChangeDraft}
        onSubmitEditing={onSubmit}
        placeholder="Mô tả vấn đề..."
        placeholderTextColor={tokens.subtleText}
        returnKeyType="send"
        style={[styles.composerInput, { color: tokens.text }]}
        testID="customer-kael-local-chat-input"
        value={draft}
      />
      <Pressable accessibilityLabel="Gửi" accessibilityRole="button" onPress={onSubmit} style={[styles.sendButton, { backgroundColor: tokens.primary }]}>
        <IconGlyph name="send" color={tokens.primaryText} accent={tokens.primaryText} />
      </Pressable>
    </View>
  )
}

function SmallChip({ label, tone = 'base' }: { label: string; tone?: SurfaceTone }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.smallChip, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]}>
      <Text style={[styles.smallChipText, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function RatingStarGlass() {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.ratingStarWrap} testID="customer-rating-glass-stars">
      <View style={[styles.ratingScorePill, { backgroundColor: tokens.glassStrong, borderColor: tokens.glassBorder }]}>
        <Text style={[styles.ratingScoreText, { color: tokens.copper }]} numberOfLines={1}>
          5.0
        </Text>
      </View>
      <View style={styles.ratingStarRow}>
        {[0, 1, 2, 3, 4].map((star) => (
          <View key={star} style={[styles.ratingStarShell, { backgroundColor: tokens.glassWarm, borderColor: tokens.glassBorder }]}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="m12 3.7 2.2 4.45 4.9.72-3.55 3.45.84 4.88L12 14.9l-4.39 2.3.84-4.88L4.9 8.87l4.9-.72L12 3.7Z"
                fill={tokens.copper}
                opacity={star === 0 ? 1 : 0.88}
              />
              <Path
                d="m12 3.7 2.2 4.45 4.9.72-3.55 3.45.84 4.88L12 14.9l-4.39 2.3.84-4.88L4.9 8.87l4.9-.72L12 3.7Z"
                stroke={tokens.glassHighlight}
                strokeLinejoin="round"
                strokeWidth={1.1}
              />
            </Svg>
          </View>
        ))}
      </View>
    </View>
  )
}

function useCustomerTokens(): CustomerThemeTokens {
  return useContext(CustomerThemeContext)
}

function getLayerSurface(tokens: CustomerThemeTokens, tone: SurfaceTone) {
  switch (tone) {
    case 'base':
      return tokens.base
    case 'raised':
      return tokens.raised
    case 'service':
      return tokens.service
    case 'water':
      return tokens.water
    case 'warm':
      return tokens.warm
    case 'depth':
      return tokens.depthSurface
    case 'ghost':
      return tokens.ghost
    case 'disabled':
      return tokens.disabled
  }
}

function glassSurface(tokens: CustomerThemeTokens, tone: 'default' | 'strong' | 'warm' | 'service' | 'water' | 'depth' = 'default') {
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.20)' : 'rgba(255,184,102,0.23)'
  const softWarmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,184,102,0.14)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.17)' : 'rgba(183,246,231,0.34)'
  const backgroundColor =
    tone === 'strong'
      ? tokens.glassStrong
      : tone === 'warm'
        ? tokens.glassWarm
        : tone === 'service'
          ? tokens.mode === 'dark'
            ? 'rgba(23,59,53,0.72)'
            : 'rgba(220,243,236,0.68)'
          : tone === 'water'
            ? tokens.mode === 'dark'
              ? 'rgba(21,54,58,0.72)'
              : 'rgba(232,249,251,0.68)'
            : tone === 'depth'
              ? tokens.mode === 'dark'
                ? 'rgba(13,27,26,0.70)'
                : 'rgba(234,246,241,0.70)'
              : tokens.glass

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    backdropFilter: 'blur(24px) saturate(1.18)',
    boxShadow: tokens.glassFloatShadow,
    experimental_backgroundImage:
      tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(201,248,237,0.62), rgba(255,243,205,0.48))`
        : tone === 'service'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(22,185,168,0.26), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,248,241,0.56))`
          : tone === 'water'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(33,165,177,0.28), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,249,247,0.58))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(224,248,242,0.34))`,
    shadowColor: '#0D4641',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.28 : 0.13,
    shadowRadius: 28,
  }
}

function GlassSheen() {
  const tokens = useCustomerTokens()
  return (
    <>
      <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
      <View pointerEvents="none" style={[styles.glassSheen, { backgroundColor: tokens.glassHighlight }]} />
    </>
  )
}

function IconGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
  if (name === 'boltPanel') {
    return (
      <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Rect x={7.5} y={5} width={13} height={18} rx={4} stroke={color} strokeWidth={1.9} />
        <Path d="M11.5 11h5M11.5 15.5h5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="m15 8-3 8h3l-2 5 5-8h-3l2-5Z" fill={accent} opacity={0.9} />
      </Svg>
    )
  }

  if (name === 'waterPipe') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M7 9.5h9c3 0 5 2 5 5V20" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M6 22c3-2 5.8 2 9 0 2-1.2 4-1.2 6 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={7.5} cy={9.5} r={3} fill={accent} opacity={0.16} />
      </Svg>
    )
  }

  if (name === 'apartment') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M5.5 12.5 13 6l7.5 6.5v7.2c0 1-.8 1.8-1.8 1.8H7.3c-1 0-1.8-.8-1.8-1.8v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M11 21.5v-5h4v5" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'person') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M7.5 20c.9-2.5 2.9-3.8 5.5-3.8s4.6 1.3 5.5 3.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={13} cy={9.5} r={3.3} stroke={color} strokeWidth={1.9} />
      </Svg>
    )
  }

  if (name === 'chat') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M6.5 6.5h12c1 0 1.8.8 1.8 1.8v7.2c0 1-.8 1.8-1.8 1.8h-6l-4 3v-3h-2c-1 0-1.8-.8-1.8-1.8V8.3c0-1 .8-1.8 1.8-1.8Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M9.5 11h6" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'send') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 12.8 19.4 5.8l-4.3 13.4-3.1-5.2-6.6-1.2Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'payment') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 9.5 12.5 5l7.1 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M7 10.5h11M8.2 10.5v6.2M12.5 10.5v6.2M16.8 10.5v6.2M6.5 18.5h12" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        <Path d="M12.5 7.8h.1" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'ticket') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.8 8.5c0-1 .8-1.8 1.8-1.8h9.8c1 0 1.8.8 1.8 1.8v2.2a2 2 0 0 0 0 3.6v2.2c0 1-.8 1.8-1.8 1.8H7.6c-1 0-1.8-.8-1.8-1.8v-2.2a2 2 0 0 0 0-3.6V8.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M9.4 12.5h6.2" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'privacy' || name === 'check') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M12.5 4.8 18.5 7v4.6c0 3.6-2.2 6.5-6 7.7-3.8-1.2-6-4.1-6-7.7V7l6-2.2Z" stroke={color} strokeWidth={1.8} />
        <Path d="m10 12.2 1.6 1.6 3.5-4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      <Rect x={6} y={6} width={13} height={13} rx={3.2} stroke={color} strokeWidth={1.9} />
      <Path d="M9.5 11h6M9.5 15h4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  v4Scroll: {
    gap: 12,
    paddingHorizontal: customerFrameHorizontalPadding,
  },
  hiddenMarker: {
    height: 0,
    width: 0,
  },
  glassTopHighlight: {
    height: 1,
    left: 16,
    opacity: 0.82,
    position: 'absolute',
    right: 16,
    top: 0,
    zIndex: 0,
  },
  glassSheen: {
    height: '170%',
    left: -72,
    opacity: 0.42,
    position: 'absolute',
    top: -46,
    transform: [{ rotate: '11deg' }],
    width: 58,
    zIndex: 0,
  },
  glassRing: {
    borderRadius: 999,
    borderWidth: 2,
    height: 88,
    opacity: 0.88,
    position: 'absolute',
    right: -30,
    top: 34,
    width: 88,
  },
  motionSweep: {
    bottom: -40,
    position: 'absolute',
    top: -40,
    width: 44,
    zIndex: 24,
  },
  ambientGlassField: {
    bottom: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    zIndex: 0,
  },
  ambientOrbMint: {
    borderRadius: 999,
    height: 230,
    opacity: 0.2,
    position: 'absolute',
    right: -78,
    top: 138,
    width: 230,
  },
  ambientOrbWarm: {
    borderRadius: 999,
    bottom: 150,
    height: 170,
    left: -62,
    opacity: 0.1,
    position: 'absolute',
    width: 170,
  },
  ambientGlassLine: {
    height: 1,
    left: -20,
    opacity: 0.15,
    position: 'absolute',
    top: 300,
    width: 360,
  },
  dockWrap: {
    minHeight: customerDockHeight,
    position: 'absolute',
    zIndex: 30,
  },
  dockGlassAura: {
    borderRadius: 999,
    bottom: -14,
    filter: 'blur(18px)',
    height: 70,
    left: 18,
    position: 'absolute',
    right: 18,
    zIndex: -1,
  },
  dockWarmAura: {
    borderRadius: 999,
    bottom: -6,
    filter: 'blur(18px)',
    height: 46,
    opacity: 0.11,
    position: 'absolute',
    right: -12,
    width: 88,
    zIndex: -1,
  },
  glassDock: {
    alignItems: 'center',
    borderRadius: 29,
    borderWidth: 1,
    boxShadow: '0 18px 50px rgba(13,70,65,0.18), inset 0 1px 0 rgba(255,255,255,0.76)',
    flexDirection: 'row',
    gap: 4,
    minHeight: 64,
    overflow: 'hidden',
    padding: 7,
  },
  dockLiquidPool: {
    borderRadius: 999,
    bottom: 7,
    filter: 'blur(13px)',
    height: 52,
    left: 0,
    opacity: 0.24,
    position: 'absolute',
    width: 80,
    zIndex: 0,
  },
  dockLiquidWake: {
    borderRadius: 999,
    bottom: 4,
    filter: 'blur(16px)',
    height: 56,
    left: 0,
    position: 'absolute',
    width: 88,
    zIndex: 0,
  },
  dockBottomReflection: {
    borderRadius: 999,
    bottom: 8,
    height: 15,
    left: 36,
    opacity: 0.16,
    position: 'absolute',
    right: 36,
    zIndex: 0,
  },
  dockMotionSheen: {
    bottom: -18,
    filter: 'blur(1px)',
    position: 'absolute',
    top: -18,
    width: 44,
    zIndex: 0,
  },
  dockItem: {
    alignItems: 'center',
    borderRadius: 21,
    flex: 1,
    height: 50,
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  dockItemActive: {
    backgroundColor: 'rgba(216,247,239,0.82)',
    boxShadow: '0 12px 28px rgba(64,197,187,0.18), inset 0 1px 0 rgba(255,255,255,0.68)',
    transform: [{ translateY: -1 }],
  },
  dockActiveGlow: {
    borderRadius: 999,
    filter: 'blur(10px)',
    height: 48,
    opacity: 0.3,
    position: 'absolute',
    width: 48,
  },
  dockDot: {
    borderRadius: 999,
    bottom: 6,
    height: 4,
    position: 'absolute',
    width: 4,
  },
  dockKaelImage: {
    height: 36,
    width: 36,
  },
  floatingAward: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    bottom: -6,
    height: 36,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: -4,
    width: 36,
    zIndex: 34,
  },
  v4Content: {
    minHeight: 760,
    position: 'relative',
  },
  plainContent: {
    gap: 12,
  },
  mapBackdrop: {
    bottom: 0,
    left: 0,
    opacity: 0.76,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapGlow: {
    borderRadius: 999,
    height: 118,
    left: '50%',
    opacity: 0.42,
    position: 'absolute',
    top: 150,
    transform: [{ translateX: -59 }],
    width: 118,
  },
  mapRoute: {
    borderRadius: 999,
    height: 12,
    left: 78,
    opacity: 0.5,
    position: 'absolute',
    top: 222,
    transformOrigin: 'left center',
    width: 232,
  },
  mapRouteSoft: {
    borderRadius: 999,
    height: 54,
    left: 70,
    opacity: 0.12,
    position: 'absolute',
    top: 200,
    transform: [{ rotate: '-19deg' }],
    width: 246,
  },
  mapVehicle: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    left: '50%',
    overflow: 'hidden',
    position: 'absolute',
    top: 214,
    width: 42,
    zIndex: 2,
  },
  mapLine: {
    height: 1,
    opacity: 0.34,
    position: 'absolute',
    width: 280,
  },
  mapLineOne: {
    top: 110,
    transform: [{ rotate: '-10deg' }],
  },
  mapLineTwo: {
    right: -40,
    top: 210,
    transform: [{ rotate: '25deg' }],
  },
  mapLineThree: {
    left: -28,
    top: 286,
    transform: [{ rotate: '-32deg' }],
  },
  mapRoom: {
    borderRadius: 18,
    borderWidth: 2,
    opacity: 0.42,
    position: 'absolute',
  },
  mapRoomOne: {
    height: 132,
    left: 42,
    top: 138,
    width: 150,
  },
  mapRoomTwo: {
    height: 118,
    right: 35,
    top: 188,
    width: 138,
  },
  mapRoomThree: {
    height: 108,
    left: 68,
    top: 318,
    width: 196,
  },
  mapPin: {
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    left: '50%',
    opacity: 0.9,
    position: 'absolute',
    top: 205,
    transform: [{ translateX: -9 }],
    width: 18,
  },
  mapNode: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    opacity: 0.95,
    position: 'absolute',
    width: 44,
  },
  mapNodeElectric: {
    left: 50,
    top: 170,
  },
  mapNodeWater: {
    right: 52,
    top: 246,
  },
  searchPill: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: '0 18px 44px rgba(13,70,65,0.12)',
    flexDirection: 'row',
    gap: 10,
    marginTop: 0,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  searchText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
  },
  homeMapSpace: {
    height: 176,
  },
  homeSheet: {
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 -20px 56px rgba(13,70,65,0.16)',
    gap: 15,
    minHeight: 520,
    overflow: 'hidden',
    padding: 16,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  serviceCard: {
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 24px 52px rgba(13,70,65,0.16), inset 0 1px 0 rgba(255,255,255,0.72)',
    flex: 1,
    gap: 15,
    minHeight: 126,
    overflow: 'hidden',
    padding: 15,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 22,
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
  },
  smallServiceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  smallService: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 78,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 9,
  },
  smallServiceText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
  },
  paymentRail: {
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 20px 48px rgba(13,70,65,0.12), inset 0 1px 0 rgba(255,255,255,0.68)',
    gap: 10,
    minHeight: 128,
    overflow: 'hidden',
    padding: 13,
  },
  paymentWarmHalo: {
    borderRadius: 999,
    height: 88,
    opacity: 0.12,
    position: 'absolute',
    right: -26,
    top: -24,
    width: 88,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentOption: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  paymentIconBubble: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  paymentCopy: {
    flex: 1,
    gap: 2,
  },
  paymentTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  paymentMeta: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
  promoCard: {
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 24px 52px rgba(13,70,65,0.13)',
    minHeight: 138,
    overflow: 'hidden',
    paddingHorizontal: 17,
    paddingVertical: 17,
  },
  promoTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 24,
    maxWidth: 188,
    position: 'relative',
    zIndex: 2,
  },
  promoMintCloud: {
    borderRadius: 999,
    height: 136,
    left: -42,
    opacity: 0.14,
    position: 'absolute',
    top: 18,
    width: 136,
  },
  promoWarmCloud: {
    borderRadius: 999,
    height: 160,
    opacity: 0.22,
    position: 'absolute',
    right: -44,
    top: -20,
    width: 160,
  },
  promoOrb: {
    borderRadius: 26,
    borderWidth: 1,
    height: 82,
    opacity: 0.8,
    position: 'absolute',
    right: 18,
    top: 28,
    transform: [{ rotate: '-8deg' }],
    width: 82,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 31,
  },
  cardHeadline: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
  },
  kaelCard: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 42px rgba(16,43,47,0.08)',
    gap: 12,
    minHeight: 568,
    padding: 14,
  },
  kaelChatStage: {
    borderRadius: 25,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 488,
    overflow: 'hidden',
    padding: 12,
  },
  kaelChatStageEmpty: {
    opacity: 0.92,
  },
  kaelBlankCanvas: {
    flex: 1,
    minHeight: 338,
    overflow: 'hidden',
    position: 'relative',
  },
  kaelCanvasOrbLarge: {
    borderRadius: 999,
    height: 168,
    left: -48,
    opacity: 0.09,
    position: 'absolute',
    top: 46,
    width: 168,
  },
  kaelCanvasOrbWarm: {
    borderRadius: 999,
    bottom: 42,
    height: 126,
    opacity: 0.08,
    position: 'absolute',
    right: -34,
    width: 126,
  },
  kaelUserBubble: {
    alignSelf: 'flex-end',
    borderRadius: 22,
    borderTopRightRadius: 8,
    borderWidth: 1,
    maxWidth: '82%',
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  kaelUserText: {
    fontSize: 14,
    lineHeight: 19,
  },
  kaelSummaryTicket: {
    width: '100%',
  },
  kaelBubble: {
    borderRadius: 25,
    borderTopLeftRadius: 10,
    borderWidth: 1,
    gap: 6,
    overflow: 'hidden',
    padding: 14,
  },
  bubbleKicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  bubbleTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 25,
  },
  ticketCard: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  ticketCell: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    minHeight: 68,
    overflow: 'hidden',
    padding: 12,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
  ticketValue: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  emptyTicket: {
    alignItems: 'center',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 148,
    overflow: 'hidden',
    padding: 16,
  },
  emptyTicketText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  composer: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 16px 36px rgba(16,43,47,0.08)',
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    overflow: 'hidden',
    padding: 7,
  },
  kaelComposerInline: {
    flexShrink: 0,
    minHeight: 64,
  },
  composerTool: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  composerToolText: {
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 0,
    lineHeight: 28,
  },
  composerInput: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 17,
    flexShrink: 0,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  filterRow: {
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    overflow: 'hidden',
    padding: 6,
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 8,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  flowCard: {
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: '0 14px 32px rgba(13,70,65,0.08)',
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 25,
  },
  timelineDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  timelineText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  workerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  workerAvatar: {
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    width: 48,
  },
  workerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  workerMetaPill: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  evidenceTile: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 76,
    overflow: 'hidden',
  },
  evidenceText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  ratingGlass: {
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 66,
    overflow: 'hidden',
    padding: 9,
  },
  ratingStarWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  ratingScorePill: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 54,
  },
  ratingScoreText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  ratingStarRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 6,
    justifyContent: 'flex-end',
  },
  ratingStarShell: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 38,
  },
  stateGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statePill: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 56,
    justifyContent: 'center',
  },
  stateDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  stateText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
  },
  profileHead: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    overflow: 'hidden',
    padding: 15,
  },
  profileName: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
  },
  profileButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  profileButtonText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  statusCard: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 42px rgba(8,120,110,0.10)',
    gap: 26,
    minHeight: 154,
    overflow: 'hidden',
    padding: 18,
  },
  statusOrb: {
    borderRadius: 999,
    height: 140,
    opacity: 0.36,
    position: 'absolute',
    right: -34,
    top: 20,
    width: 140,
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 31,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 14,
  },
  metric: {
    flex: 1,
    gap: 5,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minHeight: 88,
    overflow: 'hidden',
    padding: 13,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 2,
    overflow: 'hidden',
    padding: 8,
  },
  profileActionsScroll: {
    borderRadius: 24,
    maxHeight: 188,
    overflow: 'hidden',
  },
  listRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  listCopy: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  listMeta: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  switchTrack: {
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 62,
  },
  switchKnob: {
    borderRadius: 999,
    height: 26,
    width: 26,
  },
  themeToggle: {
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 60,
  },
  themeKnob: {
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  iconShell: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  kaelMascotFrame: {
    alignItems: 'center',
    borderWidth: 1,
    boxShadow: '0 14px 32px rgba(8,120,110,0.14)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButtonCompact: {
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  smallChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
})
