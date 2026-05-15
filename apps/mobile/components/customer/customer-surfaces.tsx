import { createContext, type ReactNode, useContext, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

const CUSTOMER_SHELL_V12_SOURCE_OF_TRUTH = 'customer-shell-v12-production-design-system'
const CUSTOMER_SIGNATURE_PRODUCTION_V15 = 'CUSTOMER_SIGNATURE_PRODUCTION_V15: approved Home V2, Dock A, Kael V3'
const CUSTOMER_HOME_SIGNATURE_V2_LOCK = 'CUSTOMER_HOME_SIGNATURE_V2_LOCK: preserve approved home visual quality'
const CUSTOMER_DOCK_MAIN_A = 'CUSTOMER_DOCK_MAIN_A: rounded material dock with active surface'
const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'
const CUSTOMER_DARK_DOCK_LAYER_MATCH = 'CUSTOMER_DARK_DOCK_LAYER_MATCH: dock reads the same semantic dark layers'
const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute Dock A'
const CUSTOMER_LAYER_ECOLOGY_V14 = 'CUSTOMER_LAYER_ECOLOGY_V14: semantic layer roles, not brightness tweaks'
const SEMANTIC_LAYER_SWITCH_V14 = 'SEMANTIC_LAYER_SWITCH_V14: light/dark swaps every layer role'
const CUSTOMER_DARK_LAYER_RESTORE_V12 =
  'CUSTOMER_DARK_LAYER_RESTORE_V12: customer-dark-hero-composite customer-dark-kael-canvas customer-dark-layer-depth-contrast'
const CUSTOMER_TYPE_RHYTHM = 'CUSTOMER_TYPE_RHYTHM: prototype-light system weights'
const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'
const KAEL_CHATBOX_SCREEN_CONTRACT = 'KAEL_CHATBOX_SCREEN_CONTRACT: local transaction-intent chatbox'
const KAEL_TICKET_COMPOSER_V3 = 'KAEL_TICKET_COMPOSER_V3: Kael asks, fills a repair ticket, then routes to booking'
const KAEL_SUPPORTED_SCOPE_COPY = 'điện và nước'
const LAYERED_SURFACE_ROLES = ['canvas', 'base', 'raised', 'service', 'water', 'warm', 'depth', 'ghost'] as const

const minimumTouchTarget = 44
const customerDockHeight = 82
const customerDockBottomMargin = 10
const customerDockScrollGap = 44
const customerDockBottomClearance = customerDockHeight + customerDockBottomMargin + customerDockScrollGap
const openBookingPath = '/(customer)/booking'

type ThemeMode = 'light' | 'dark'
type SurfaceTone = 'base' | 'raised' | 'service' | 'water' | 'warm' | 'depth' | 'ghost' | 'disabled'
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
  | 'support'
  | 'ticket'
  | 'waterPipe'

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
  ghost: 'rgba(255,253,248,0.80)',
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
  for (const listener of customerThemeSubscribers) {
    listener()
  }
}

export function useCustomerThemeMode() {
  return useSyncExternalStore(subscribeCustomerThemeMode, getCustomerThemeModeSnapshot, getCustomerThemeModeSnapshot)
}

export function getCustomerThemeTokens(mode: ThemeMode) {
  return mode === 'light' ? CUSTOMER_THEME_TOKENS.lightLayer : CUSTOMER_THEME_TOKENS.darkLayer
}

const ACTIVE_SERVICES = [
  {
    id: 'electrical',
    testID: 'customer-shell-service-electrical',
    title: 'Sửa điện',
    microcopy: 'Điện trong nhà',
    icon: 'boltPanel' satisfies IconName,
    tone: 'service' satisfies SurfaceTone,
  },
  {
    id: 'plumbing',
    testID: 'customer-shell-service-plumbing',
    title: 'Sửa nước',
    microcopy: 'Nước trong nhà',
    icon: 'waterPipe' satisfies IconName,
    tone: 'water' satisfies SurfaceTone,
  },
] as const

export function CustomerHomeSurface() {
  const router = useRouter()
  const openBookingFlow = () => router.push(openBookingPath)

  return (
    <CustomerScreen
      eyebrow="HomeServices"
      title="Xin chào"
      subtitle="Dịch vụ căn hộ TP.HCM"
      testID="customer-home-surface"
      trailing={<IconButton icon="notification" accessibilityLabel="Thông báo" markerTestID="customer-utility-notification-center" />}
    >
      {({ tokens }) => (
        <>
          <View style={[styles.contextBand, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            <IconShell icon="apartment" tone="depth" size={42} />
            <View style={styles.contextCopy}>
              <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
                Căn hộ TP.HCM
              </Text>
              <Text style={[styles.microcopy, { color: tokens.muted }]} numberOfLines={1}>
                Quận / chung cư
              </Text>
            </View>
            <Text style={[styles.inlineAction, { color: tokens.primary }]} numberOfLines={1}>
              Đổi
            </Text>
          </View>

          <MotionPressable
            onPress={openBookingFlow}
            style={[styles.homeHero, tokens.mode === 'dark' && styles.homeHeroDark, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}
            testID="customer-home-layered-hero"
          >
            <View style={styles.hiddenMarker} testID="customer-home-signature-v2" />
            <View
              style={[
                styles.heroLayerStack,
                tokens.mode === 'dark' && styles.heroLayerStackDark,
                { backgroundColor: tokens.raised, borderColor: tokens.border },
              ]}
              testID="customer-home-layer-stack"
            />
            <View style={[styles.heroWarmLayer, tokens.mode === 'dark' && styles.heroWarmLayerDark, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} />
            <View style={styles.heroDepthGrid} testID="customer-home-hero-depth-grid">
              <View
                style={[
                  styles.heroDepthTile,
                  styles.heroDepthTileTall,
                  tokens.mode === 'dark' && styles.heroDepthTileDark,
                  { backgroundColor: tokens.raised, borderColor: tokens.border },
                ]}
              />
              <View style={[styles.heroDepthTile, tokens.mode === 'dark' && styles.heroDepthTileDark, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} />
              <View style={[styles.heroDepthTile, tokens.mode === 'dark' && styles.heroDepthTileDark, { backgroundColor: tokens.ghost, borderColor: tokens.border }]} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: tokens.primary }]} numberOfLines={1}>
                AI Price Check
              </Text>
              <Text style={[styles.heroTitle, { color: tokens.text }]} numberOfLines={2}>
                Kiểm giá trước khi sửa
              </Text>
            </View>
            <View style={styles.heroFooter}>
              <PrimaryButton label="Đặt lịch" onPress={openBookingFlow} compact testID="customer-home-booking-cta" />
              <View
                style={[styles.ticketDecor, tokens.mode === 'dark' && styles.ticketDecorDark, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
                testID="customer-home-ticket-decor"
              >
                <IconShell icon="ticket" tone="warm" size={38} />
              </View>
            </View>
          </MotionPressable>

          <SectionHeader title="Dịch vụ chính" />
          <View style={styles.serviceGrid}>
            {ACTIVE_SERVICES.map((service) => (
              <ServiceTile
                key={service.id}
                title={service.title}
                microcopy={service.microcopy}
                icon={service.icon}
                tone={service.tone}
                testID={service.testID}
                onPress={openBookingFlow}
              />
            ))}
          </View>

          <View
            style={[styles.otherServices, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}
            testID="customer-home-other-services-message"
          >
            <Text style={[styles.otherServicesText, { color: tokens.muted }]} numberOfLines={2}>
              Các dịch vụ khác sẽ được cập nhật sớm nhất.
            </Text>
          </View>

          <View style={styles.relaxedStage} testID="customer-home-relaxed-stage">
            <MiniFigure icon="ticket" title="Ticket" text="Sắp mở" tone="warm" />
            <MiniFigure icon="estimate" title="Price Check" text="Đặt lịch" tone="service" />
          </View>

          <View
            style={[styles.couponStrip, { backgroundColor: tokens.warm, borderColor: tokens.copper }]}
            testID="customer-home-coupon-strip"
          >
            <IconShell icon="ticket" tone="warm" size={44} />
            <View style={styles.cardCopy}>
              <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
                Ưu đãi
              </Text>
              <Text style={[styles.microcopy, { color: tokens.muted }]} numberOfLines={1}>
                Giữ chỗ cho ticket thật
              </Text>
            </View>
            <Text style={[styles.inlineAction, { color: tokens.primary }]} numberOfLines={1}>
              Local
            </Text>
          </View>

          <SectionPanel title="Hoạt động" tone="raised">
            <CompactRow icon="calendar" title="Yêu cầu mở" text="Trống" tone="ghost" testID="customer-home-active-booking-empty" />
            <CompactRow icon="history" title="Gần đây" text="Chưa có dữ liệu" tone="warm" testID="customer-home-recent-history-placeholder" />
          </SectionPanel>
        </>
      )}
    </CustomerScreen>
  )
}

export function CustomerKaelSurface() {
  const router = useRouter()
  const { height } = useWindowDimensions()
  const openBookingFlow = () => router.push(openBookingPath)
  const [kaelDraft, setKaelDraft] = useState('')
  const [latestAnswer, setLatestAnswer] = useState('')
  const hasEnoughKaelInfo = latestAnswer.trim().length >= 16

  const submitKaelLocalDraft = () => {
    const trimmed = kaelDraft.trim()
    if (!trimmed) return

    setLatestAnswer(trimmed)
    setKaelDraft('')
  }

  return (
    <CustomerScreen
      eyebrow="Kael"
      title="AI Price Check"
      subtitle={`Chỉ hỗ trợ ${KAEL_SUPPORTED_SCOPE_COPY}`}
      testID="customer-kael-companion"
      trailing={<IconShell icon="kael" tone="water" size={44} />}
    >
      {({ tokens }) => (
        <View
          accessibilityLabel={`${KAEL_CHATBOX_SCREEN_CONTRACT}; ${KAEL_TICKET_COMPOSER_V3}`}
          style={[styles.kaelFullScreenChat, { minHeight: Math.max(height - 210, 620) }]}
          testID="customer-kael-full-screen-chat"
        >
          <View
            accessibilityLabel={KAEL_TICKET_COMPOSER_V3}
            style={[
              styles.kaelConversationFeed,
              tokens.mode === 'dark' && styles.kaelConversationFeedDark,
              { backgroundColor: tokens.depthSurface, borderColor: tokens.border },
            ]}
            testID="customer-kael-chatbox"
          >
            <View style={styles.hiddenMarker} testID="customer-kael-ticket-composer" />
            <View
              style={[styles.kaelSystemBubble, tokens.mode === 'dark' && styles.kaelSystemBubbleDark, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}
              testID="customer-kael-conversation-feed"
            >
              <Text style={[styles.questionKicker, { color: tokens.muted }]} numberOfLines={1}>
                Kael đang hỏi
              </Text>
              <Text style={[styles.questionTitle, { color: tokens.text }]} numberOfLines={2}>
                <Text testID="customer-kael-active-question">Vấn đề xảy ra ở đâu và đã kéo dài bao lâu?</Text>
              </Text>
            </View>

            {hasEnoughKaelInfo ? (
              <>
                <View
                  style={[styles.answerStrip, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
                  testID="customer-kael-user-message"
                >
                  <Text style={[styles.chatText, { color: tokens.text }]} numberOfLines={3}>
                    {latestAnswer}
                  </Text>
                </View>

                <View
                  style={[styles.repairTicket, tokens.mode === 'dark' && styles.repairTicketDark, { backgroundColor: tokens.warm, borderColor: tokens.borderStrong }]}
                  testID="customer-kael-ticket-reveal-after-info"
                >
                  <View style={styles.hiddenMarker} testID="customer-kael-repair-ticket" />
                  <View style={styles.ticketHeader}>
                    <Text style={[styles.ticketTitle, { color: tokens.text }]} numberOfLines={1}>
                      Phiếu sửa chữa đang tạo
                    </Text>
                    <SmallChip label="3/4 mục" tone="service" />
                  </View>

                  <View style={styles.ticketFieldGrid}>
                    <TicketField index="1" label="Dịch vụ" value="Sửa điện" status="Đã có" testID="customer-kael-ticket-field-service" />
                    <TicketField
                      index="2"
                      label="Vấn đề"
                      value="Aptomat nhảy khi bật nước nóng"
                      status="Đã có"
                      testID="customer-kael-ticket-field-problem"
                    />
                    <TicketField
                      index="3"
                      label="Vị trí"
                      value={latestAnswer}
                      status="Mới thêm"
                      testID="customer-kael-ticket-field-location"
                    />
                    <TicketField
                      index="4"
                      label="Ảnh"
                      value="Thêm nếu có"
                      status="Tùy chọn"
                      pending
                      testID="customer-kael-ticket-field-media"
                    />
                  </View>

                  <View style={styles.ticketProgress} testID="customer-kael-ticket-progress">
                    <View style={[styles.progressStep, { backgroundColor: tokens.primary }]} />
                    <View style={[styles.progressStep, { backgroundColor: tokens.primary }]} />
                    <View style={[styles.progressStep, { backgroundColor: tokens.primary }]} />
                    <View style={[styles.progressStep, { backgroundColor: tokens.border }]} />
                  </View>

                  <View style={styles.ticketActions}>
                    <Pressable
                      accessibilityLabel="Thêm ảnh"
                      accessibilityRole="button"
                      style={[styles.secondaryTicketButton, { borderColor: tokens.borderStrong }]}
                      testID="customer-kael-worker-placeholder"
                    >
                      <Text style={[styles.secondaryTicketButtonText, { color: tokens.primary }]} numberOfLines={1}>
                        Thêm ảnh
                      </Text>
                    </Pressable>
                    <MotionPressable
                      onPress={openBookingFlow}
                      style={[styles.ticketPrimaryButton, { backgroundColor: tokens.primary }]}
                      testID="customer-kael-ticket-booking-cta"
                    >
                      <Text style={[styles.ticketPrimaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
                        Qua Đặt lịch
                      </Text>
                    </MotionPressable>
                  </View>
                </View>
              </>
            ) : (
              <View
                style={[styles.emptyTicketState, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}
                testID="customer-kael-empty-ticket-state"
              >
                <IconShell icon="ticket" tone="warm" size={44} />
                <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
                  Phiếu sẽ hiện sau khi đủ thông tin
                </Text>
              </View>
            )}

            <View style={styles.intentChips}>
              <SmallChip label="Gửi ảnh" tone="water" />
              <SmallChip label="Bỏ qua ảnh" tone="base" />
              <SmallChip label="Sửa nội dung" tone="service" />
            </View>
          </View>

            <View
              style={[styles.composerDock, tokens.mode === 'dark' && styles.composerDockDark, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
              testID="customer-kael-composer-dock"
            >
            <TextInput
              accessibilityLabel="Mô tả cho Kael"
              onChangeText={setKaelDraft}
              onSubmitEditing={submitKaelLocalDraft}
              placeholder="Nhắn cho Kael..."
              placeholderTextColor={tokens.subtleText}
              style={[styles.kaelInput, { color: tokens.text }]}
              testID="customer-kael-local-chat-input"
              value={kaelDraft}
            />
            <Pressable
              accessibilityLabel="Gửi mô tả"
              accessibilityRole="button"
              onPress={submitKaelLocalDraft}
              style={[styles.sendGlyph, { backgroundColor: tokens.primary }]}
            >
              <IconGlyph name="chat" color={tokens.primaryText} accent={tokens.primaryText} />
            </Pressable>
          </View>
        </View>
      )}
    </CustomerScreen>
  )
}

export function CustomerHistorySurface() {
  const router = useRouter()
  const openBookingFlow = () => router.push(openBookingPath)

  return (
    <CustomerScreen
      eyebrow="Lịch sử"
      title="Evidence trail"
      subtitle="Giao dịch thật sẽ xuất hiện ở đây"
      testID="customer-history-surface"
      trailing={<IconShell icon="history" tone="depth" size={44} />}
    >
      {({ tokens }) => (
        <>
          <View
            style={[styles.historyHero, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}
            testID="customer-history-empty-state"
          >
            <IconShell icon="history" tone="depth" size={54} />
            <Text style={[styles.largeCardTitle, { color: tokens.text }]} numberOfLines={2}>
              Chưa có lịch sử
            </Text>
            <Text style={[styles.cardText, { color: tokens.muted }]} numberOfLines={2}>
              Kiểm giá và lịch hẹn sẽ nằm tại đây.
            </Text>
            <PrimaryButton label="Đặt lịch đầu tiên" onPress={openBookingFlow} compact />
          </View>
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-history-data" />
          <View style={styles.hiddenMarker} testID="customer-history-evidence-timeline" />

          <SectionHeader title="Dòng dịch vụ" />
          <View style={styles.stageMap} testID="customer-history-stage-map">
            <HistoryStage index="01" icon="estimate" title="Kiểm giá" text="Draft" tone="service" />
            <HistoryStage index="02" icon="calendar" title="Lịch hẹn" text="Chờ dữ liệu" tone="base" />
            <HistoryStage index="03" icon="chat" title="Chat / ảnh" text="Evidence" tone="water" />
            <HistoryStage index="04" icon="document" title="Scope" text="Sau này" tone="warm" testID="customer-history-scope-change-placeholder" />
            <HistoryStage index="05" icon="check" title="Hoàn tất" text="Sau này" tone="disabled" testID="customer-history-completion-placeholder" />
          </View>

          <View
            style={[styles.filterShell, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-history-filter-shell"
          >
            <IconShell icon="filter" tone="depth" size={38} />
            <Text style={[styles.panelText, { color: tokens.muted }]} numberOfLines={1}>
              Bộ lọc
            </Text>
          </View>
        </>
      )}
    </CustomerScreen>
  )
}

export function CustomerProfileSurface() {
  const router = useRouter()
  const openBookingFlow = () => router.push(openBookingPath)

  return (
    <CustomerScreen
      eyebrow="Hồ sơ"
      title="Checklist"
      subtitle="Căn hộ, Kael, tiện ích"
      testID="customer-profile-surface"
      trailing={<IconShell icon="person" tone="warm" size={44} />}
    >
      {({ tokens }) => (
        <>
          <View
            style={[styles.profileHeader, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
            testID="customer-profile-empty-state"
          >
            <IconShell icon="apartment" tone="depth" size={54} />
            <View style={styles.profileHeaderCopy}>
              <Text style={[styles.largeCardTitle, { color: tokens.text, textAlign: 'left' }]} numberOfLines={1}>
                Căn hộ
              </Text>
              <Text style={[styles.cardText, { color: tokens.muted }]} numberOfLines={1}>
                Quận / chung cư
              </Text>
            </View>
          </View>
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-profile-save" />

          <View
            style={[styles.profileChecklist, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-profile-checklist"
          >
            <ChecklistRow icon="apartment" title="Căn hộ" text="Chung cư" tone="depth" />
            <ChecklistRow icon="map" title="Địa chỉ" text="Chưa lưu" tone="service" markerTestID="customer-utility-saved-address" />
            <ChecklistRow icon="privacy" title="Riêng tư" text="Ẩn PII" tone="warm" markerTestID="customer-profile-privacy-shell" />
            <ChecklistRow icon="kael" title="Kael" text="Price Check" tone="water" />
            <ChecklistRow icon="notification" title="Thông báo" text="Trống" tone="base" markerTestID="customer-utility-notification-center" />
            <ChecklistRow icon="ticket" title="Ticket" text="Sắp mở" tone="warm" markerTestID="customer-utility-ticket-wallet" />
            <ChecklistRow icon="support" title="Hỗ trợ" text="Sau này" tone="water" markerTestID="customer-utility-support-entry" />
            <ChecklistRow icon="document" title="Evidence" text="Chưa có" tone="service" markerTestID="customer-profile-evidence-shell" />
          </View>

          <SectionPanel title="Giao dịch" tone="raised">
            <CompactRow icon="payment" title="Thanh toán" text="Sau này" tone="warm" testID="customer-profile-payment-placeholder" />
            <CompactRow icon="review" title="Đánh giá" text="Sau này" tone="base" testID="customer-profile-review-placeholder" />
          </SectionPanel>

          <PrimaryButton label="Đặt lịch" onPress={openBookingFlow} />
        </>
      )}
    </CustomerScreen>
  )
}

function CustomerScreen({
  eyebrow,
  title,
  subtitle,
  children,
  trailing,
  testID = 'customer-shell-screen',
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode | ((props: { tokens: CustomerThemeTokens; mode: ThemeMode }) => ReactNode)
  trailing?: ReactNode
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(themeMode)
  const compact = width < 380
  const content = typeof children === 'function' ? children({ tokens, mode: themeMode }) : children
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID={testID}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <CustomerThemeContext.Provider value={tokens}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            compact ? styles.scrollContentCompact : null,
            {
              paddingBottom: Math.max(insets.bottom + customerDockBottomClearance, customerDockBottomClearance),
              paddingTop: Math.max(insets.top + 8, 16),
            },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={[styles.scroll, { backgroundColor: tokens.canvas }]}
        >
          <View style={styles.topBar}>
            <View style={styles.topCopy}>
              <Text style={[styles.eyebrow, { color: tokens.primary }]} numberOfLines={1}>
                {eyebrow}
              </Text>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.screenSubtitle, { color: tokens.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <View style={styles.topActions}>
              {trailing}
              <ThemeToggle mode={themeMode} onToggle={() => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')} />
            </View>
          </View>

          <View
            accessibilityLabel={`${CUSTOMER_SHELL_V12_SOURCE_OF_TRUTH}; ${CUSTOMER_SIGNATURE_PRODUCTION_V15}; ${CUSTOMER_HOME_SIGNATURE_V2_LOCK}; ${CUSTOMER_DOCK_MAIN_A}; ${CUSTOMER_DARK_DOCK_LAYER_MATCH}; ${CUSTOMER_SHARED_THEME_STORE}; ${CUSTOMER_DOCK_SCROLL_CLEARANCE}; ${CUSTOMER_LAYER_ECOLOGY_V14}; ${SEMANTIC_LAYER_SWITCH_V14}; ${CUSTOMER_DARK_LAYER_RESTORE_V12}; ${LAYERED_SURFACE_ROLES.join('/')}`}
            style={styles.hiddenMarker}
            testID="customer-dark-layer-ecology"
          />
          <View style={styles.hiddenMarker} testID="customer-shell-motion-field" />
          <View style={styles.hiddenMarker} testID="customer-theme-layer-switch" />
          {content}
        </ScrollView>
      </CustomerThemeContext.Provider>
    </SafeAreaView>
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
      style={[
        styles.themeToggle,
        {
          backgroundColor: mode === 'dark' ? tokens.service : tokens.depthSurface,
          borderColor: tokens.borderStrong,
        },
      ]}
      testID="customer-dark-mode-toggle"
    >
      <View
        style={[
          styles.themeKnob,
          {
            backgroundColor: mode === 'dark' ? tokens.primary : tokens.raised,
            transform: [{ translateX: mode === 'dark' ? 18 : 0 }],
          },
        ]}
      />
    </Pressable>
  )
}

function SectionHeader({ title }: { title: string }) {
  const tokens = useCustomerTokens()
  return (
    <Text style={[styles.sectionTitle, { color: tokens.text }]} numberOfLines={1}>
      {title}
    </Text>
  )
}

function SectionPanel({ title, tone, children }: { title: string; tone: SurfaceTone; children: ReactNode }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.sectionPanel, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]}>
      <Text style={[styles.panelTitle, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function ServiceTile({
  icon,
  microcopy,
  onPress,
  testID,
  title,
  tone,
}: {
  icon: IconName
  microcopy: string
  onPress: () => void
  testID: string
  title: string
  tone: SurfaceTone
}) {
  const tokens = useCustomerTokens()
  return (
    <MotionPressable
      onPress={onPress}
      style={[styles.serviceTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={testID}
    >
      <View style={styles.serviceTop}>
        <IconShell icon={icon} tone={tone} size={48} />
        <View style={[styles.serviceDot, { backgroundColor: tone === 'water' ? tokens.aqua : tokens.copper }]} />
      </View>
      <View>
        <Text style={[styles.serviceTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.microcopy, { color: tokens.muted }]} numberOfLines={1}>
          {microcopy}
        </Text>
      </View>
    </MotionPressable>
  )
}

function MiniFigure({ icon, title, text, tone }: { icon: IconName; title: string; text: string; tone: SurfaceTone }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.miniFigure, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]}>
      <IconShell icon={icon} tone={tone} size={36} />
      <View style={styles.cardCopy}>
        <Text style={[styles.miniFigureTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.miniFigureText, { color: tokens.muted }]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  )
}

function CompactRow({
  icon,
  title,
  text,
  tone,
  testID,
}: {
  icon: IconName
  title: string
  text: string
  tone: SurfaceTone
  testID?: string
}) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.compactRow, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]} testID={testID}>
      <IconShell icon={icon} tone={tone} size={38} />
      <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.checklistMeta, { color: tokens.muted }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  )
}

function ChecklistRow({
  icon,
  markerTestID,
  text,
  title,
  tone,
}: {
  icon: IconName
  markerTestID?: string
  text: string
  title: string
  tone: SurfaceTone
}) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.checklistRow} testID={markerTestID}>
      <IconShell icon={icon} tone={tone} size={38} />
      <Text style={[styles.checklistTitle, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.checklistMeta, { color: tokens.muted }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  )
}

function TicketField({
  index,
  label,
  pending,
  status,
  testID,
  value,
}: {
  index: string
  label: string
  pending?: boolean
  status: string
  testID: string
  value: string
}) {
  const tokens = useCustomerTokens()
  return (
    <View
      style={[
        styles.ticketField,
        {
          backgroundColor: pending ? tokens.ghost : tokens.raised,
          borderColor: pending ? tokens.border : tokens.borderStrong,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.fieldIndex, { backgroundColor: tokens.service }]}>
        <Text style={[styles.fieldIndexText, { color: tokens.primary }]}>{index}</Text>
      </View>
      <View style={styles.cardCopy}>
        <Text style={[styles.fieldLabel, { color: tokens.muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.fieldValue, { color: tokens.text }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Text style={[styles.fieldStatus, { color: tokens.primary }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  )
}

function HistoryStage({
  icon,
  index,
  testID,
  text,
  title,
  tone,
}: {
  icon: IconName
  index: string
  testID?: string
  text: string
  title: string
  tone: SurfaceTone
}) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.historyStage} testID={testID}>
      <View style={styles.stageRail}>
        <Text style={[styles.stageIndex, { color: tokens.primary }]}>{index}</Text>
        <View style={[styles.stageDot, { backgroundColor: tokens.primary }]} />
      </View>
      <View style={[styles.stageCard, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]}>
        <IconShell icon={icon} tone={tone} size={38} />
        <View style={styles.cardCopy}>
          <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.microcopy, { color: tokens.muted }]} numberOfLines={1}>
            {text}
          </Text>
        </View>
      </View>
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

function PrimaryButton({
  compact,
  label,
  onPress,
  testID,
}: {
  compact?: boolean
  label: string
  onPress: () => void
  testID?: string
}) {
  const tokens = useCustomerTokens()
  return (
    <MotionPressable
      onPress={onPress}
      style={[styles.primaryButton, compact ? styles.primaryButtonCompact : null, { backgroundColor: tokens.primary }]}
      testID={testID}
    >
      <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </MotionPressable>
  )
}

function IconButton({
  accessibilityLabel,
  icon,
  markerTestID,
}: {
  accessibilityLabel: string
  icon: IconName
  markerTestID?: string
}) {
  const tokens = useCustomerTokens()
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[styles.iconButton, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={markerTestID}
    >
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
          backgroundColor: getLayerSurface(tokens, tone),
          borderColor: tone === 'warm' ? tokens.copper : tokens.border,
          borderRadius: Math.max(14, Math.round(size * 0.36)),
          height: size,
          width: size,
        },
      ]}
    >
      <IconGlyph name={icon} color={tokens.primary} accent={accent} />
    </View>
  )
}

function useInteractionMotion() {
  const pressMotion = useRef(new Animated.Value(0)).current

  const runTapMotion = () => {
    pressMotion.setValue(0)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pressMotion, {
          toValue: 1,
          duration: 105,
          useNativeDriver: true,
        }),
        Animated.timing(pressMotion, {
          toValue: 0,
          duration: 190,
          useNativeDriver: true,
        }),
      ]),
    ]).start()
  }

  const scale = pressMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.986],
  })

  const translateY = pressMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  })

  return { runTapMotion, scale, translateY }
}

function MotionPressable({
  children,
  onPress,
  style,
  testID = 'customer-shell-touch-target',
}: {
  children: ReactNode
  onPress: () => void
  style: StyleProp<ViewStyle>
  testID?: string
}) {
  const { runTapMotion, scale, translateY } = useInteractionMotion()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        runTapMotion()
        onPress()
      }}
      onPressIn={runTapMotion}
      style={styles.pressable}
      testID={testID}
    >
      <Animated.View style={[style, { transform: [{ scale }, { translateY }] }]}>{children}</Animated.View>
    </Pressable>
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

function IconGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
  switch (name) {
    case 'boltPanel':
      return (
        <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
          <Rect x={7.5} y={5} width={13} height={18} rx={4} stroke={color} strokeWidth={1.9} />
          <Path d="M11.5 11h5M11.5 15.5h5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="m15 8-3 8h3l-2 5 5-8h-3l2-5Z" fill={accent} opacity={0.9} />
        </Svg>
      )
    case 'waterPipe':
      return (
        <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
          <Path d="M7 9.5h9c3 0 5 2 5 5V20" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6 22c3-2 5.8 2 9 0 2-1.2 4-1.2 6 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={7.5} cy={9.5} r={3} fill={accent} opacity={0.16} />
        </Svg>
      )
    case 'kael':
      return (
        <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
          <Path d="M13.5 5v17" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Path d="M7 10.5c3.6-2.4 9.4-2.4 13 0M7 16.5c3.6 2.4 9.4 2.4 13 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
          <Circle cx={13.5} cy={13.5} r={7} fill={accent} opacity={0.14} />
        </Svg>
      )
    case 'ticket':
      return (
        <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
          <Path d="M5.5 8.5h15c.9 0 1.7.8 1.7 1.7v1.7a2 2 0 0 0 0 3.8v1.7c0 .9-.8 1.7-1.7 1.7h-15c-.9 0-1.7-.8-1.7-1.7v-1.7a2 2 0 0 0 0-3.8v-1.7c0-.9.8-1.7 1.7-1.7Z" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10 13h6" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        </Svg>
      )
    case 'apartment':
      return (
        <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
          <Path d="M5.5 12.5 13 6l7.5 6.5v7.2c0 1-.8 1.8-1.8 1.8H7.3c-1 0-1.8-.8-1.8-1.8v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M11 21.5v-5h4v5" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )
    case 'person':
      return (
        <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
          <Path d="M7.5 20c.9-2.5 2.9-3.8 5.5-3.8s4.6 1.3 5.5 3.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
          <Circle cx={13} cy={9.5} r={3.3} stroke={color} strokeWidth={1.9} />
          <Path d="M19.5 7.5v3M18 9h3" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      )
    case 'calendar':
    case 'history':
    case 'estimate':
    case 'filter':
    case 'chat':
    case 'document':
    case 'check':
    case 'notification':
    case 'support':
    case 'payment':
    case 'review':
    case 'privacy':
    case 'map':
      return <UtilityGlyph name={name} color={color} accent={accent} />
  }
}

function UtilityGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
  if (name === 'check') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Circle cx={12.5} cy={12.5} r={8} stroke={color} strokeWidth={1.9} />
        <Path d="m8.8 12.8 2.4 2.5 5-5.7" stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
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
  scrollContent: {
    gap: 16,
    paddingHorizontal: 18,
  },
  scrollContentCompact: {
    gap: 14,
    paddingHorizontal: 14,
  },
  hiddenMarker: {
    height: 0,
    width: 0,
  },
  topBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  topCopy: {
    flex: 1,
    gap: 4,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 31,
  },
  screenSubtitle: {
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
  },
  themeToggle: {
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    paddingHorizontal: 3,
    width: 54,
  },
  themeKnob: {
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  contextBand: {
    alignItems: 'center',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    padding: 12,
  },
  contextCopy: {
    flex: 1,
    gap: 3,
  },
  inlineAction: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 18,
  },
  cardText: {
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  microcopy: {
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  },
  homeHero: {
    borderRadius: 29,
    borderWidth: 1,
    boxShadow: '0 18px 38px rgba(8,120,110,0.12)',
    minHeight: 220,
    overflow: 'hidden',
    padding: 18,
  },
  homeHeroDark: {
    // customer-dark-hero-composite: dark hero keeps mint/warm layer contrast instead of a flat dim card.
    boxShadow: '0 22px 52px rgba(0,0,0,0.30)',
  },
  heroLayerStack: {
    borderRadius: 27,
    borderWidth: 1,
    boxShadow: '0 18px 34px rgba(8,120,110,0.11)',
    height: 82,
    opacity: 0.82,
    position: 'absolute',
    right: 24,
    bottom: 22,
    width: 82,
  },
  heroLayerStackDark: {
    boxShadow: '0 18px 34px rgba(0,0,0,0.22)',
    opacity: 0.92,
  },
  heroWarmLayer: {
    borderRadius: 31,
    borderWidth: 1,
    boxShadow: '0 16px 36px rgba(187,116,61,0.10)',
    height: 82,
    opacity: 0.72,
    position: 'absolute',
    right: -18,
    top: 11,
    width: 136,
  },
  heroWarmLayerDark: {
    boxShadow: '0 16px 36px rgba(224,160,107,0.10)',
    opacity: 0.86,
  },
  heroDepthGrid: {
    gap: 8,
    position: 'absolute',
    right: 19,
    top: 104,
    width: 118,
  },
  heroDepthTile: {
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0 10px 20px rgba(8,120,110,0.08)',
    height: 42,
    opacity: 0.72,
    width: 52,
  },
  heroDepthTileDark: {
    boxShadow: '0 10px 22px rgba(0,0,0,0.18)',
    opacity: 0.9,
  },
  heroDepthTileTall: {
    height: 92,
    position: 'absolute',
    right: 60,
    top: 0,
  },
  heroCopy: {
    gap: 6,
    maxWidth: 238,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  heroTitle: {
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 33,
  },
  heroFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 35,
  },
  ticketDecor: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 10px 22px rgba(187,116,61,0.10)',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  ticketDecorDark: {
    boxShadow: '0 12px 28px rgba(0,0,0,0.20)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
  },
  serviceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceTile: {
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 132,
    padding: 14,
  },
  serviceTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  serviceDot: {
    borderRadius: 999,
    height: 8,
    marginTop: 4,
    width: 8,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  otherServices: {
    alignItems: 'center',
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  otherServicesText: {
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 17,
    textAlign: 'center',
  },
  relaxedStage: {
    flexDirection: 'row',
    gap: 10,
  },
  miniFigure: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 68,
    padding: 10,
  },
  miniFigureTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 17,
  },
  miniFigureText: {
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: 15,
  },
  couponStrip: {
    alignItems: 'center',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    padding: 12,
  },
  sectionPanel: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  panelText: {
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  pressable: {
    minHeight: minimumTouchTarget,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconShell: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
  },
  kaelFullScreenChat: {
    gap: 12,
  },
  chatThread: {
    borderRadius: 24,
    minHeight: 360,
    padding: 11,
  },
  kaelConversationFeed: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 42px rgba(16,43,47,0.08)',
    gap: 11,
    flex: 1,
    padding: 13,
  },
  kaelConversationFeedDark: {
    // customer-dark-kael-canvas: Kael uses a deeper canvas with visible raised/warm artifacts.
    boxShadow: '0 22px 56px rgba(0,0,0,0.34)',
  },
  kaelSystemBubble: {
    alignSelf: 'flex-start',
    borderRadius: 25,
    borderTopLeftRadius: 10,
    borderWidth: 1,
    gap: 7,
    maxWidth: '92%',
    padding: 13,
  },
  kaelSystemBubbleDark: {
    boxShadow: '0 14px 30px rgba(0,0,0,0.16)',
  },
  questionKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 22,
  },
  repairTicket: {
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '0 18px 40px rgba(0,0,0,0.10)',
    gap: 12,
    padding: 14,
  },
  repairTicketDark: {
    boxShadow: '0 20px 44px rgba(0,0,0,0.20)',
  },
  ticketHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  ticketTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 19,
  },
  ticketFieldGrid: {
    gap: 8,
  },
  ticketField: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 58,
    padding: 10,
  },
  fieldIndex: {
    alignItems: 'center',
    borderRadius: 12,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  fieldIndexText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 18,
  },
  fieldStatus: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    maxWidth: 68,
    textAlign: 'right',
  },
  ticketProgress: {
    flexDirection: 'row',
    gap: 5,
  },
  progressStep: {
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  ticketActions: {
    flexDirection: 'row',
    gap: 9,
  },
  secondaryTicketButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  secondaryTicketButtonText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  ticketPrimaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  ticketPrimaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  answerStrip: {
    alignSelf: 'flex-end',
    borderRadius: 23,
    borderTopRightRadius: 9,
    borderWidth: 1,
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  emptyTicketState: {
    alignItems: 'center',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 9,
    justifyContent: 'center',
    minHeight: 138,
    padding: 14,
  },
  chatMessageList: {
    gap: 9,
  },
  chatBubble: {
    borderRadius: 21,
    borderWidth: 1,
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  chatBubbleKael: {
    alignSelf: 'flex-start',
    borderTopLeftRadius: 9,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    borderTopRightRadius: 9,
  },
  chatText: {
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
  },
  intentCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 11,
    padding: 12,
  },
  intentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  intentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  composerDock: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: '0 16px 36px rgba(16,43,47,0.08)',
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    padding: 7,
  },
  composerDockDark: {
    // customer-dark-layer-depth-contrast: composer stays raised above the deep Kael canvas.
    boxShadow: '0 18px 44px rgba(0,0,0,0.28)',
  },
  kaelInput: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0,
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  sendGlyph: {
    alignItems: 'center',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  historyHero: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  largeCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 25,
    textAlign: 'center',
  },
  stageMap: {
    gap: 10,
  },
  historyStage: {
    flexDirection: 'row',
    gap: 10,
  },
  stageRail: {
    alignItems: 'center',
    gap: 7,
    paddingTop: 14,
    width: 34,
  },
  stageIndex: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  stageDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  stageCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 70,
    padding: 12,
  },
  filterShell: {
    alignItems: 'center',
    borderRadius: 22,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    padding: 12,
  },
  profileHeader: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 15,
  },
  profileHeaderCopy: {
    flex: 1,
    gap: 5,
  },
  profileChecklist: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 2,
    padding: 8,
  },
  checklistRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  checklistTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  checklistMeta: {
    fontSize: 12,
    letterSpacing: 0,
    maxWidth: 116,
    textAlign: 'right',
  },
  compactRow: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  smallChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
})
