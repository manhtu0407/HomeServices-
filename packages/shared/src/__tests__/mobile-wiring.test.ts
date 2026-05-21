import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MOBILE_ROOT = resolve(__dirname, '../../../../apps/mobile')
const read = (rel: string) => readFileSync(resolve(MOBILE_ROOT, rel), 'utf-8')
const exists = (rel: string) => existsSync(resolve(MOBILE_ROOT, rel))
const countOccurrences = (source: string, value: string) => source.split(value).length - 1

// ===================================================================
// Navigation skeleton - must match STRUCTURES.md exactly
// ===================================================================

describe('screen files existence (STRUCTURES.md mapping)', () => {
  const authScreens = ['login.tsx', 'verify-otp.tsx']
  const customerScreens = ['home.tsx', 'booking.tsx', 'kael.tsx', 'history.tsx', 'profile.tsx']
  const workerScreens = ['home.tsx', 'jobs.tsx', 'chat.tsx', 'earnings.tsx', 'profile.tsx']

  it.each(authScreens)('(auth)/%s exists', (file) => {
    expect(exists(`app/(auth)/${file}`)).toBe(true)
  })

  it('does not ship the removed auth onboarding route', () => {
    expect(exists('app/(auth)/onboard.tsx')).toBe(false)
  })

  it.each(customerScreens)('(customer)/%s exists', (file) => {
    expect(exists(`app/(customer)/${file}`)).toBe(true)
  })

  it.each(workerScreens)('(worker)/%s exists', (file) => {
    expect(exists(`app/(worker)/${file}`)).toBe(true)
  })

  it('root _layout.tsx exists', () => {
    expect(exists('app/_layout.tsx')).toBe(true)
  })

  it('root index.tsx exists (splash redirect)', () => {
    expect(exists('app/index.tsx')).toBe(true)
  })

  it('each group has _layout.tsx', () => {
    expect(exists('app/(auth)/_layout.tsx')).toBe(true)
    expect(exists('app/(customer)/_layout.tsx')).toBe(true)
    expect(exists('app/(worker)/_layout.tsx')).toBe(true)
  })
})

// ===================================================================
// Screen files export default (Expo Router requirement)
// ===================================================================

describe('all screens export default function', () => {
  const allScreens = [
    'app/_layout.tsx',
    'app/index.tsx',
    'app/(auth)/_layout.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/verify-otp.tsx',
    'app/(customer)/_layout.tsx',
    'app/(customer)/home.tsx',
    'app/(customer)/booking.tsx',
    'app/(customer)/kael.tsx',
    'app/(customer)/history.tsx',
    'app/(customer)/profile.tsx',
    'app/(worker)/_layout.tsx',
    'app/(worker)/home.tsx',
    'app/(worker)/jobs.tsx',
    'app/(worker)/chat.tsx',
    'app/(worker)/earnings.tsx',
    'app/(worker)/profile.tsx',
  ]

  it.each(allScreens)('%s has default export', (file) => {
    const src = read(file)
    expect(src).toMatch(/export\s+default\s+function/)
  })
})

// ===================================================================
// Customer tabs - STRUCTURES.md A1: Trang chủ | Đặt lịch | Kael | Lịch sử | Hồ sơ
// ===================================================================

describe('customer tab labels (STRUCTURES.md A1)', () => {
  const src = read('app/(customer)/_layout.tsx')

  it('has exactly 5 Tabs.Screen entries', () => {
    const matches = src.match(/Tabs\.Screen/g) ?? []
    expect(matches.length).toBe(5)
  })

  it('tab route: home', () => {
    expect(src).toContain('name="home"')
  })

  it('tab route: booking uses V4 price-check role', () => {
    expect(src).toContain('name="booking"')
    expect(src).toContain('tabBarLabel')
  })

  it('tab route: kael', () => {
    expect(src).toContain('name="kael"')
  })

  it('tab route: history uses V4 activity role', () => {
    expect(src).toContain('name="history"')
    expect(src).toContain('tabBarLabel')
  })

  it('tab route: profile', () => {
    expect(src).toContain('name="profile"')
  })

  it('uses Tabs from expo-router', () => {
    expect(src).toMatch(/import\s+\{.*Tabs.*\}\s+from\s+['"]expo-router['"]/)
  })

  it('keeps hidden native tab icon accessibility labels user-facing', () => {
    expect(src).toContain('CUSTOMER_TAB_COPY')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain("home: 'Trang chủ'")
    expect(src).toContain("bookingA11y: 'Đặt dịch vụ'")
    expect(src).toContain("historyA11y: 'Lịch sử'")
    expect(src).toContain("booking: 'Price check'")
    expect(src).toContain("historyA11y: 'History'")
    expect(src).not.toContain('accessibilityLabel={accessibilityMarker}')
    expect(src).not.toContain('accessibilityLabel={CUSTOMER_DOCK')
  })
})

// ===================================================================
// Customer frontend shell - production static/local surfaces around Price Check
// ===================================================================

describe('customer frontend shell surfaces', () => {
  const shellPath = 'components/customer/customer-surfaces.tsx'
  const shell = () => (exists(shellPath) ? read(shellPath) : '')
  const customerLayout = () => read('app/(customer)/_layout.tsx')
  const customerRoutes = [
    ['home', 'CustomerHomeSurface'],
    ['kael', 'CustomerKaelSurface'],
    ['history', 'CustomerHistorySurface'],
    ['profile', 'CustomerProfileSurface'],
  ] as const

  it('defines the four public customer shell surface exports', () => {
    const src = shell()
    expect(exists(shellPath)).toBe(true)
    expect(src).toContain('export function CustomerHomeSurface')
    expect(src).toContain('export function CustomerKaelSurface')
    expect(src).toContain('export function CustomerHistorySurface')
    expect(src).toContain('export function CustomerProfileSurface')
  })

  it.each(customerRoutes)('wires (customer)/%s to %s', (route, exportName) => {
    const src = read(`app/(customer)/${route}.tsx`)
    expect(src).toContain(exportName)
    expect(src).toContain('@/components/customer/customer-surfaces')
    expect(src).not.toContain('ClientPriceCheckPrototype')
    expect(src).not.toContain('client-price-check-prototype')
  })

  it('keeps booking as the only full production price-check flow route', () => {
    const bookingRoute = read('app/(customer)/booking.tsx')
    const src = shell()
    expect(bookingRoute).toContain('ClientPriceCheckFlow')
    expect(bookingRoute).toContain('@/components/client-price-check/client-price-check-flow')
    expect(src).not.toContain('ClientPriceCheckFlow')
    expect(src).not.toContain('production-price-check-flow')
  })

  it('keeps customer shell frontend-only with no backend, AI, or workflow mutations', () => {
    const files = [
      shellPath,
      'app/(customer)/home.tsx',
      'app/(customer)/kael.tsx',
      'app/(customer)/history.tsx',
      'app/(customer)/profile.tsx',
    ]

    for (const file of files) {
      const src = exists(file) ? read(file) : ''
      expect(src).not.toContain('fetch(')
      expect(src).not.toContain('createClient')
      expect(src).not.toContain('supabase.')
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
      expect(src).not.toContain('callAI')
      expect(src).not.toContain('ANTHROPIC_API_KEY')
      expect(src).not.toContain('PERPLEXITY_API_KEY')
      expect(src).not.toContain('DEEPSEEK_API_KEY')
      expect(src).not.toContain('payment_pending')
      expect(src).not.toContain('customer_confirmed_booking_search')
    }

    expect(shell()).toContain('useFrontendWorkflow')
  })

  it('limits active customer services to electrical, plumbing, and cleaning entries', () => {
    const src = shell()
    expect(src).toContain('customer-shell-service-electrical')
    expect(src).toContain('customer-shell-service-plumbing')
    expect(src).toContain('customer-shell-service-cleaning')
    expect(src).toContain('customer-home-other-services-message')
    expect(src).toContain('CUSTOMER_V4_VISUAL_CONTRACT')
    expect(src).not.toMatch(/ac repair|appliance|handyman/i)
  })

  it('implements the V4 customer quality system markers', () => {
    const src = shell()
    const layout = customerLayout()
    expect(src).toContain('CUSTOMER_V4_PRODUCTION_STANDARD')
    expect(src).not.toContain('CUSTOMER_V4_PRODUCTION_SOURCE')
    expect(src).toContain('CUSTOMER_V4_VISUAL_CONTRACT')
    expect(layout).toContain('CUSTOMER_DOCK_MAIN_A')
    expect(src).toContain('CUSTOMER_SHARED_THEME_STORE')
    expect(layout).toContain('CUSTOMER_DARK_DOCK_LAYER_MATCH')
    expect(src).toContain('KAEL_TICKET_COMPOSER_V3')
    expect(src).toContain('CUSTOMER_LAYER_ECOLOGY_V4')
    expect(src).toContain('SEMANTIC_LAYER_SWITCH_V4')
    expect(src).toContain('COPY_DENSITY_COMPACT')
    expect(src).toContain('CUSTOMER_THEME_TOKENS')
    expect(src).toContain('useSyncExternalStore')
    expect(src).toContain('setCustomerThemeMode')
    expect(src).toContain('subscribeCustomerThemeMode')
    expect(src).toContain('getCustomerThemeTokens')
    expect(src).toContain('getLayerSurface')
    expect(src).toContain('depthSurface')
    expect(src).toContain('customer-theme-layer-switch')
    expect(src).toContain('customer-dark-layer-ecology')
    expect(src).toContain('customer-dark-mode-toggle')
    expect(src).toContain('FloatingGlassTabBar')
    expect(src).toContain('useGlassAccessibility')
    expect(src).toContain('mode={tokens.mode}')
    expect(src).toContain('const experimentalBackgroundImage')
    expect(src).toContain('linear-gradient(145deg, rgba(22,43,40,0.78), rgba(12,26,25,0.68))')
    expect(src).toContain('lightLayer')
    expect(src).toContain('darkLayer')
    expect(src).not.toContain('shadowColor')
    expect(src).not.toContain('shadowOpacity')
  })

  it('implements V4 production customer language/theme persistence and Kael 8A assets', () => {
    const src = shell()
    const layout = customerLayout()
    expect(src).toContain('CUSTOMER_V4_PRODUCTION_STANDARD')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain('setAppLanguage')
    expect(src).toContain('CUSTOMER_THEME_STORAGE_KEY')
    expect(src).toContain('AsyncStorage')
    expect(src).toContain('localizedServiceLabel')
    expect(src).toContain('localizedStatusLabel')
    expect(src).toContain('customer-language-toggle')
    expect(src).toContain('customer-profile-unified-functions')
    expect(src).toContain('kael-model-8a.png')
    expect(src).toContain('kael-model-8a-head.png')
    expect(src).toContain('Image')
    expect(layout).toContain('customer-tab-kael-mascot-8a')
  })

  it('keeps design-lab artifacts out of production customer source references', () => {
    expect(exists('../../.tmp/design-lab/customer-app-v1')).toBe(false)
    expect(exists('../../.tmp/design-lab/customer-app-v2')).toBe(false)
    expect(shell()).not.toContain('.tmp/design-lab')
  })

  it('keeps V4 dark mode as a semantic layer switch instead of a separate redesign', () => {
    const src = shell()
    const layout = customerLayout()
    expect(src).toContain('SEMANTIC_LAYER_SWITCH_V4')
    expect(src).toContain('customer-dark-layer-ecology')
    expect(src).toContain("canvas: '#071312'")
    expect(src).toContain("base: '#10201F'")
    expect(src).toContain("raised: '#162B28'")
    expect(src).toContain("service: '#173B35'")
    expect(src).toContain("water: '#15363A'")
    expect(src).toContain("warm: '#3B291B'")
    expect(src).toContain("primary: '#69DEC6'")
    expect(src).toContain("copper: '#E0A06B'")
    expect(src).toContain('ThemeToggle')
    expect(src).toContain('setCustomerThemeMode')
    expect(layout).toContain('CUSTOMER_DARK_DOCK_LAYER_V4')
    expect(layout).toContain('customer-dock-shadow-layer')
    expect(layout).toContain("boxShadow: 'none'")
    expect(layout).toContain("display: 'none'")
    expect(layout).toContain('tabBarActiveBackgroundColor: tokens.service')
  })

  it('preserves V4 prototype section-level figures beyond static wiring', () => {
    const src = shell()
    expect(src).toContain('customer-home-layered-hero')
    expect(src).toContain('customer-home-layer-stack')
    expect(src).toContain('customer-home-signature-v4')
    expect(src).toContain('customer-home-hero-depth-grid')
    expect(src).not.toContain('customer-home-payment-section')
    expect(src).not.toContain('customer-home-bank-connect')
    expect(src).not.toContain('customer-home-cod-payment')
    expect(src).not.toContain('customer-home-payment-local-only')
    expect(src).toContain('customer-home-relaxed-stage')
    expect(src).toContain('customer-home-ticket-decor')
    expect(src).not.toContain('customer-home-coupon-strip')
    expect(src).toContain('customer-home-kael-command')
    expect(src).toContain('const homeCommandTarget = canStartNewDeal ? openKaelPath : activeDealRoute')
    expect(src).toContain('onPress={() => replace(homeCommandTarget)}')
    expect(src).toContain('customer-home-apartment-context')
    expect(src).toContain('customer-home-real-shortcuts')
    expect(src).toContain('customer-kael-conversation-feed')
    expect(src).toContain('customer-kael-empty-chat-state')
    expect(src).toContain('customer-kael-empty-chat-canvas')
    expect(src).toContain('customer-kael-service-intake-hub')
    expect(src).toContain('customer-kael-hub-quick-services')
    expect(src).toContain('customer-kael-assistant-guidance')
    expect(src).toContain('copy.kael.assistantMoreDetail')
    expect(src).toContain('copy.kael.assistantMoreDetailHint')
    expect(src).toContain('copy.kael.unsupportedSummary')
    expect(src).toContain('copy.kael.unsupportedHint')
    expect(src).not.toContain('Phiên intake')
    expect(src).not.toContain('localKaelDraft?.unsupportedServiceLabel ?? copy.kael.unsupportedHint')
    expect(src).toContain('shouldRevealKaelTicket')
    expect(src).toContain('hasEnoughKaelInfo && !isUnsupportedKaelService')
    expect(src).toContain('<KaelMascot variant="head" size={58} material="opaque" />')
    expect(src).toContain('<KaelMascot variant="full" size={96} material="opaque" />')
    expect(src).toContain('customer-kael-ticket-reveal-after-info')
    expect(src).toContain('customer-kael-user-message')
    expect(src).toContain('hasEnoughKaelInfo')
    expect(src).toContain('hasAnyKaelInfo')
    expect(src).toContain('displayedKaelAnswer.trim().length >= 16')
    expect(src).toContain('customer-kael-ticket-composer')
    expect(src).toContain('customer-kael-repair-ticket')
    expect(src).toContain('customer-kael-ticket-field-service')
    expect(src).toContain('customer-kael-ticket-field-problem')
    expect(src).toContain('customer-kael-ticket-field-location')
    expect(src).toContain('customer-kael-ticket-field-media')
    expect(src).toContain('customer-kael-ticket-progress')
    expect(src).toContain('customer-kael-ticket-booking-cta')
    expect(src).toContain('customer-kael-composer-dock')
    expect(src).toContain('customer-kael-local-chat-input')
    expect(src).toContain('customer-history-stage-map')
    expect(src).toContain('customer-history-filter-shell')
    expect(src).toContain('customer-profile-unified-functions')
    expect(src).toContain('customer-profile-privacy-shell')
    expect(src).toContain('customer-profile-evidence-shell')
  })

  it('keeps Kael as a local price-check chatbox without backend or AI calls', () => {
    const src = shell()
    expect(src).toContain('KAEL_CHATBOX_SCREEN_CONTRACT')
    expect(src).toContain('KAEL_TICKET_COMPOSER_V3')
    expect(src).toContain('customer-kael-companion')
    expect(src).toContain('customer-kael-chatbox')
    expect(src).toContain('customer-kael-empty-chat-state')
    expect(src).toContain('customer-kael-empty-chat-canvas')
    expect(src).toContain('customer-kael-ticket-reveal-after-info')
    expect(src).toContain('customer-kael-ticket-composer')
    expect(src).toContain('customer-kael-repair-ticket')
    expect(src).not.toContain('customer-rating-glass-stars')
    expect(src).toContain('customer-kael-worker-placeholder')
    expect(src).toContain('submitKaelLocalDraft')
    expect(src).toContain('TextInput')
    expect(src).toContain('customer-kael-local-chat-input')
    expect(src).not.toContain('TransactionIntentCard')
    expect(src).not.toContain('sendMessage')
    expect(src).not.toContain('Draft Price Check')
    expect(src).not.toContain('customer-kael-conversation-phone')
    expect(src).not.toContain('kaelPhone')
    expect(src).not.toContain('callAI')
    expect(src).not.toContain('fetch(')
  })

  it('uses a custom customer tab icon set instead of default tab indicators', () => {
    const src = customerLayout()
    expect(src).toContain('CUSTOMER_DOCK_MAIN_A')
    expect(src).toContain('CUSTOMER_DARK_DOCK_LAYER_MATCH')
    expect(src).toContain('customer-tab-dock-main-a')
    expect(src).toContain('customer-tab-dock-active-surface')
    expect(src).toContain('customer-tab-dark-layer-match')
    expect(src).toContain('customerDockHeight = 82')
    expect(src).toContain('customerDockBottomMargin = 10')
    expect(src).toContain('useCustomerThemeMode')
    expect(src).toContain('getCustomerThemeTokens')
    expect(src).toContain('tabBarActiveTintColor: tokens.primary')
    expect(src).toContain('tabBarInactiveTintColor: tokens.subtleText')
    expect(src).toContain("rgba(255,253,248,0.72)")
    expect(src).toContain("rgba(255,255,255,0.88)")
    expect(src).toContain('CustomerTabIcon')
    expect(src).toContain('customer-tab-icon-home')
    expect(src).toContain('customer-tab-icon-booking')
    expect(src).toContain('customer-tab-kael-mascot-8a')
    expect(src).toContain('customer-tab-icon-history')
    expect(src).toContain('customer-tab-icon-profile')
    expect(src).toContain('tabBarIcon')
    expect(src).toContain('react-native-svg')
  })

  it('keeps customer shell visible copy compact and structure-first', () => {
    const src = shell()
    expect(src).toContain('COPY_DENSITY_COMPACT')
    expect(src).toContain('customer-profile-checklist')
    expect(src).not.toContain('Chỉ lưu ngữ cảnh chung')
    expect(src).not.toContain('Giá thực tế do thợ xác nhận trước khi bắt đầu.')
    expect(src).not.toContain('Name/building/floor')
    expect(src).not.toContain('Không bịa ngày')
    expect(src).not.toContain('Chưa lưu backend')
    expect(src).not.toContain('Không fake worker')
    expect(src).not.toContain('Bộ lọc sẽ mở')
    expect(src).not.toContain('Không đánh dấu đã thanh toán')
  })

  it('uses mobile production V4 frame markers and dock-safe scrolling', () => {
    const src = shell()
    expect(src).toContain('V4Frame')
    expect(src).toContain('customer-home-surface')
    expect(src).toContain('customer-kael-companion')
    expect(src).toContain('customer-history-surface')
    expect(src).toContain('customer-profile-surface')
    expect(src).toContain('CUSTOMER_DOCK_SCROLL_CLEARANCE')
    expect(src).toContain('customerDockBottomClearance')
    expect(src).toContain('paddingBottom: Math.max(insets.bottom + customerDockBottomClearance')
    expect(src).toContain('SafeAreaView')
    expect(src).toContain('useSafeAreaInsets')
    expect(src).toContain('ScrollView')
    expect(src).toContain('Pressable')
    expect(src).toContain('numberOfLines')
    expect(src).toContain('customer-shell-motion-field')
    expect(src).toContain('customer-section-glass-field')
    expect(src).toContain('customer-dock-glass-aura')
    expect(src).toContain('customer-liquid-glass-dock')
    expect(src).toContain('GlassCard')
    expect(src).toContain('customer-home-layered-hero')
    expect(src).toContain('SubtleGlassHighlight')
    expect(src).toContain('MotionSweep')
    expect(src).toContain('V4MapBackdrop')
    expect(src).toContain('customerMessageSurface')
    expect(src).toContain('customerOpaqueSurface')
    expect(src).toContain('styles.mapVehicle, customerOpaqueSurface(tokens)')
    expect(src).toContain('styles.mapNode, styles.mapNodeElectric, customerOpaqueSurface(tokens)')
    expect(src).not.toContain('styles.mapVehicle, glassSurface(tokens')
    expect(src).not.toContain('styles.mapNode, styles.mapNodeElectric, glassSurface(tokens')
    expect(src).toContain('styles.kaelCard, customerOpaqueSurface(tokens)')
    expect(src).toContain('styles.listCard, customerOpaqueSurface(tokens)]} testID="customer-profile-checklist"')
    expect(src).not.toContain('styles.kaelCard, glassSurface(tokens')
    expect(src).not.toContain('styles.kaelChatStage, glassSurface(tokens')
    expect(src).toContain('getReducedTransparencyCustomerTokens')
    expect(src).toContain('reduceTransparency ? getReducedTransparencyCustomerTokens')
    expect(src).toContain('experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage')
    expect(src).toContain("if (tokens.glassHighlight === 'transparent') return null")
    expect(src).not.toContain('useSharedValue')
    expect(src).not.toContain('useAnimatedStyle')
    expect(src).not.toContain('react-native-reanimated')
    expect(src).not.toContain('withRepeat')
    expect(src).not.toContain('withSpring')
    expect(src).not.toContain('backdropFilter')
    expect(src).not.toContain("filter: 'blur")
    expect(src).not.toContain('Animated.loop')
    expect(src).not.toContain('onHoverIn')
  })

  it('uses V4 utility and transaction shell placeholders without fabricated backend state', () => {
    const src = shell()
    expect(src).toContain('customer-utility-notification-center')
    expect(src).toContain('customer-utility-ticket-wallet')
    expect(src).toContain('customer-utility-support-entry')
    expect(src).toContain('customer-utility-saved-address')
    expect(src).toContain('customer-profile-payment-placeholder')
    expect(src).toContain('customer-profile-review-placeholder')
    expect(src).toContain('customer-profile-unified-functions')
    expect(src).toContain('customer-history-evidence-timeline')
    expect(src).toContain('customer-history-scope-change-placeholder')
    expect(src).toContain('customer-history-completion-placeholder')
    expect(src).not.toContain('paid_success')
    expect(src).not.toContain('review_submitted')
    expect(src).not.toContain('workerAccepted')
  })

  it('uses honest empty states without fabricated transactions or profile data', () => {
    const src = shell()
    expect(src).toContain('customer-history-empty-state')
    expect(src).toContain('customer-profile-empty-state')
    expect(src).toContain('customer-shell-no-fake-history-data')
    expect(src).toContain('customer-shell-no-fake-profile-save')
    expect(src).not.toMatch(/090\d{7}|0\d{9}/)
    expect(src).not.toMatch(/\d{1,3}\.\d{3}\s?đ/)
  })

  it('routes customer shell entry points back to the booking tab', () => {
    const src = shell()
    expect(src).toContain('useRouter')
    expect(src).toContain('openBookingFlow')
    expect(src).toContain('/(customer)/booking')
  })

  it('hands customer home service cards into the local workflow with exact service types', () => {
    const src = shell()
    expect(src).toContain("dispatch({ type: 'start_home_service', serviceType })")
    expect(src).toContain("openBookingFlow('electrical')")
    expect(src).toContain("openBookingFlow('plumbing')")
    expect(src).toContain('customer-home-active-local-deal')
    expect(src).toContain('activeDealRoute')
    expect(src).toContain('canStartNewDeal')
    expect(src).toContain('canReplaceCustomerDeal(activeDeal.status)')
    expect(src).toContain('isTerminalCustomerDeal(activeDeal.status)')
    expect(src).toContain("if (!serviceType && isTerminalDeal) dispatch({ type: 'reset_workflow' })")
    expect(src).toContain('openHistoryPath')
  })

  it('keeps Kael ticket values derived from local draft instead of hardcoded electrical/outlet copy', () => {
    const src = shell()
    expect(src).toContain("dispatch({ type: 'submit_kael_draft', text: trimmed })")
    expect(src).toContain('displayedKaelAnswer')
    expect(src).toContain('kaelTicketService')
    expect(src).toContain('kaelTicketProblem')
    expect(src).toContain('localKaelDraft?.unsupportedServiceLabel')
    expect(src).toContain('copy.kael.unsupportedService')
    expect(src).toContain('Dịch vụ đang khóa')
    expect(src).not.toMatch(/const kaelTicketProblem = localKaelDraft\?\.unsupportedServiceLabel\s*\?\?/)
    expect(src).toContain('canStartKaelDraft')
    expect(src).toContain('customer-kael-active-deal-guard')
    expect(src).toContain('canReplaceCustomerDeal')
    expect(src).toContain("state.deal?.draft.source === 'kael'")
    expect(src).toContain('EMPTY_CUSTOMER_KAEL_DRAFT_STATE')
    expect(src).toContain('patchKaelDraft(EMPTY_CUSTOMER_KAEL_DRAFT_STATE)')
    expect(src).toContain('trimmed.length < 4')
    expect(src).toContain('maxLength={220}')
    expect(src).not.toContain('value="Sửa điện"')
    expect(src).not.toContain('value="Ổ nóng"')
  })
})

describe('frontend workflow provider wiring', () => {
  it('wraps Expo root below AuthProvider and above routed screens', () => {
    const src = read('app/_layout.tsx')
    expect(src).toContain('AuthProvider')
    expect(src).toContain('FrontendWorkflowProvider')
    expect(src.indexOf('<AuthProvider>')).toBeLessThan(src.indexOf('<FrontendWorkflowProvider>'))
    expect(src.indexOf('<FrontendWorkflowProvider>')).toBeLessThan(src.indexOf('<Slot />'))
  })

  it('keeps the approved workflow provider in memory only', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain('useReducer(localWorkflowReducer')
    expect(src).toContain('createInitialLocalWorkflowState')
    expect(src).not.toContain('AsyncStorage')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
    expect(src).not.toContain('fetch(')
  })

  it('resets local workflow when the authenticated user changes', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain('useAuth')
    expect(src).toContain('session?.user.id')
    expect(src).toContain("dispatch({ type: 'reset_workflow' })")
  })

  it('ticks local broadcasts in memory so waiting requests can expire without backend', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain("state.deal?.status !== 'broadcasting'")
    expect(src).toContain("broadcast?.status !== 'sent'")
    expect(src).toContain('setTimeout')
    expect(src).toContain("dispatch({ type: 'tick_broadcast' })")
    expect(src).toContain('clearTimeout')
  })

  it('only decrements notification unread count for items that were unread before local mark-read', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain('locallyReadNotificationIdsRef')
    expect(src).toContain("currentNotification.status !== 'read'")
    expect(src).toContain('!locallyReadNotificationIdsRef.current.has(notificationId)')
    expect(src).toContain("type: 'mark_read'")
    expect(src).toContain('shouldDecrementUnread,')
    expect(src).not.toContain('setNotificationUnreadCount')
  })
})

// ===================================================================
// Prototype runtime cleanup - store-build guard
// ===================================================================

const removedPrototypeRuntimePaths = [
  'app/prototype',
  'app/prototype/_layout.tsx',
  'app/prototype/client-price-check.tsx',
  'app/prototype/client-frontier.tsx',
  'app/prototype/fleets.tsx',
  'app/(auth)/onboard.tsx',
  'components/auth/auth-surfaces-v2.tsx',
  'components/worker/worker-surfaces-v3.tsx',
  'components/client-price-check/client-price-check-prototype.tsx',
  'components/customer/client-frontier-prototype.tsx',
  'components/fleets/fleets-prototype.tsx',
]

const removedMobilePublicMockups = [
  'public',
  'public/visionary-reset-v1.html',
  'public/reset-board-v1.html',
  'public/personal-homecare-prototype-v1.html',
  'public/homeservices-asker-v2-board.svg',
  'public/homebee-product-system-v1.html',
  'public/homebee-clickable-prototype-v1.html',
  'public/hammer-dock-v3.html',
  'public/hammer-dock-v2.html',
  'public/hammer-dock-v1.html',
  'public/client-btaskee-inspired-v1.html',
]

describe('prototype runtime cleanup', () => {
  it.each(removedPrototypeRuntimePaths)('removes %s from the mobile runtime', (file) => {
    expect(exists(file)).toBe(false)
  })

  it.each(removedMobilePublicMockups)('removes throwaway public mockup artifact %s', (file) => {
    expect(exists(file)).toBe(false)
  })

  it('keeps production customer routes free from prototype imports', () => {
    const productionRoutes = [
      'app/(customer)/home.tsx',
      'app/(customer)/booking.tsx',
      'app/(customer)/kael.tsx',
      'app/(customer)/history.tsx',
      'app/(customer)/profile.tsx',
    ]

    for (const file of productionRoutes) {
      const src = read(file)
      expect(src).not.toContain('ClientPriceCheckPrototype')
      expect(src).not.toContain('ClientFrontierPrototype')
      expect(src).not.toContain('FleetWorkerPrototype')
      expect(src).not.toContain('client-price-check-prototype')
      expect(src).not.toContain('client-frontier-prototype')
      expect(src).not.toContain('fleets-prototype')
      expect(src).not.toContain('@/components/client-price-check/client-price-check-prototype')
      expect(src).not.toContain('@/components/customer/client-frontier-prototype')
      expect(src).not.toContain('@/components/fleets/fleets-prototype')
    }
  })
})

// ===================================================================
// Worker tabs - STRUCTURES.md B1: Trang chủ | Công việc | Tin nhắn | Thu nhập | Hồ sơ
// ===================================================================
describe('worker tab labels (STRUCTURES.md B1)', () => {
  const src = read('app/(worker)/_layout.tsx')

  it('has exactly 5 Tabs.Screen entries', () => {
    const matches = src.match(/Tabs\.Screen/g) ?? []
    expect(matches.length).toBe(5)
  })

  it('tab: Trang chủ', () => {
    expect(src).toContain("'Trang chủ'")
  })

  it('tab: Công việc', () => {
    expect(src).toContain("'Công việc'")
  })

  it('tab: Tin nhắn', () => {
    expect(src).toContain("'Tin nhắn'")
  })

  it('tab: Thu nhập', () => {
    expect(src).toContain("'Thu nhập'")
  })

  it('tab: Hồ sơ', () => {
    expect(src).toContain("'Hồ sơ'")
  })

  it('keeps hidden native tab icon accessibility labels user-facing', () => {
    expect(src).toContain('WORKER_TAB_COPY')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain("home: 'Trang chủ'")
    expect(src).toContain("jobs: 'Công việc'")
    expect(src).toContain("earnings: 'Thu nhập'")
    expect(src).toContain("chat: 'Messages'")
    expect(src).toContain("earnings: 'Earnings'")
    expect(src).not.toContain('accessibilityLabel={WORKER_DOCK')
    expect(src).not.toContain('const accessibilityLabel = WORKER_DOCK_MAIN + WORKER_DOCK_XANHSM_LAYER_MATCH')
  })
})

describe('worker client-V4/XanhSM aligned shell surfaces', () => {
  const shellPath = 'components/worker/worker-surfaces.tsx'
  const shell = () => (exists(shellPath) ? read(shellPath) : '')
  const workerRoutes = [
    ['home', 'WorkerHomeSurface'],
    ['jobs', 'WorkerJobsSurface'],
    ['chat', 'WorkerChatSurface'],
    ['earnings', 'WorkerEarningsSurface'],
    ['profile', 'WorkerProfileSurface'],
  ] as const

  it('defines the five worker shell surface exports', () => {
    const src = shell()
    expect(exists(shellPath)).toBe(true)
    expect(src).toContain('export function WorkerHomeSurface')
    expect(src).toContain('export function WorkerJobsSurface')
    expect(src).toContain('export function WorkerChatSurface')
    expect(src).toContain('export function WorkerEarningsSurface')
    expect(src).toContain('export function WorkerProfileSurface')
  })

  it.each(workerRoutes)('wires (worker)/%s to %s', (route, exportName) => {
    const src = read(`app/(worker)/${route}.tsx`)
    expect(src).toContain(exportName)
    expect(src).toContain('@/components/worker/worker-surfaces')
    expect(src).not.toContain('@/components/worker/worker-surfaces-v3')
  })

  it('keeps the Worker production visual contract tied to customer V4 and XanhSM references', () => {
    const src = shell()
    expect(src).toContain('WORKER_XANHSM_REFERENCE_AUDIT')
    expect(src).toContain('WORKER_PRODUCTION_CONTRACT')
    expect(src).toContain('WORKER_CLIENT_BASELINE_AUDIT')
    expect(src).toContain('WORKER_DOCK_GLASS_MOTION')
    expect(src).toContain('WORKER_GLASSMORPHISM_MOTION_LAYER')
    expect(src).toContain('StatusBar')
    expect(src).toContain('SubtleGlassHighlight')
    expect(src).not.toContain('StaticGlassDepthLayer')
    expect(src).toContain('FloatingGlassTabBar')
    expect(src).toContain('GlassPressable')
    expect(src).toContain('useGlassAccessibility')
    expect(src).toContain('getReducedTransparencyWorkerTokens')
    expect(src).toContain('reduceTransparency ? getReducedTransparencyWorkerTokens')
    expect(src).toContain('experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage')
    expect(src).toContain("if (tokens.glassHighlight === 'transparent') return null")
    expect(src).not.toContain('GlassSheen')
    expect(src).not.toContain('GlassMotionLayer')
    expect(src).not.toContain('useSharedValue')
    expect(src).not.toContain('useAnimatedStyle')
    expect(src).not.toContain('react-native-reanimated')
    expect(src).not.toContain('verticalFlow.value')
    expect(src).toContain('WorkerSectionMotionField')
    expect(src).toContain('sectionMotionWash')
    expect(src).toContain('worker-section-glass-motion-home')
    expect(src).toContain('worker-section-glass-motion-jobs')
    expect(src).toContain('worker-section-glass-motion-chat')
    expect(src).toContain('worker-section-glass-motion-earnings')
    expect(src).toContain('worker-section-glass-motion-profile')
    expect(src).toContain('centered-metric-type')
    expect(src).toContain("textAlign: 'center'")
    expect(src).not.toContain('backdropFilter')
    expect(src).not.toContain("filter: 'blur")
    expect(src).toContain('experimental_backgroundImage')
    expect(src).toContain('worker-flexible-map-shell')
    expect(src).toContain('worker-map-google-ready')
    expect(src).toContain('mapCardsRow')
    expect(src).toContain('styles.mapStage, workerOpaqueCardSurface(tokens')
    expect(src).toContain('styles.mapFeatureCard, workerOpaqueCardSurface(tokens, tone)')
    expect(src).not.toContain('styles.mapStage, glassSurface(tokens')
    expect(src).not.toContain('styles.mapFeatureCard, glassSurface(tokens, tone)')
    expect(src).toContain('worker-liquid-glass-dock')
    expect(src).not.toContain('worker-dock-liquid-pool')
    expect(src).not.toContain('worker-dock-liquid-wake')
    expect(src).not.toContain('worker-dock-active-glow')
    expect(src).toContain('worker-dock-kael-brief-mascot')
    expect(src).not.toContain('withSpring')
    expect(src).not.toContain('withRepeat')
    expect(src).toContain('worker-profile-preference-toggles')
    expect(src).toContain('styles.preferenceCard, workerOpaqueCardSurface(tokens)')
    expect(src).not.toContain('styles.preferenceCard, glassSurface(tokens')
    expect(src).toContain('worker-verification-submit-card')
    expect(src).toContain("const workerVerificationServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']")
    expect(src).toContain('worker-verification-service-${serviceType}')
    expect(src).not.toContain('shadowColor')
    expect(src).not.toContain('shadowOpacity')
    expect(src).toContain('worker-verification-cccd-front')
    expect(src).toContain('worker-verification-selfie')
    expect(src).toContain('worker-kael-client-chatbox-parity')
    expect(src).toContain('worker-kael-composer-dock')
    expect(src).toContain('WORKER_JOBROOM_KAEL_HANDOFF')
    expect(src).toContain('worker-jobroom-kael-handoff')
    expect(src).toContain('worker-jobroom-waiting-room')
    expect(src).toContain('worker-jobroom-privacy-gate')
    expect(src).toContain('worker-unified-readiness-panel')
    expect(src).toContain('readinessNoProfile')
    expect(src).toContain('const availabilityLabel = !workerProfile')
    expect(src).toContain('worker-jobs-jobroom-entry')
    expect(src).toContain('worker-jobs-open-jobroom')
    expect(src).not.toContain('Đang online')
    expect(src).not.toContain('Đang offline')
    expect(src).toContain('const fullJobAddressLabel = selectors.canWorkerSeeFullAddress && deal?.draft.addressLabel')
    expect(src).toContain('const jobVisibleAreaLabel = fullJobAddressLabel ?? jobAreaLabel')
    expect(src).not.toContain('const jobAddressLabel = deal?.draft.addressLabel')
    expect(src).toContain('messageBubbleSurface')
    expect(src).toContain('workerOpaqueCardSurface')
    expect(src).toContain('styles.chatShell, workerOpaqueCardSurface(tokens')
    expect(src).toContain('styles.kaelBrief, workerOpaqueCardSurface(tokens')
    expect(src).not.toContain('styles.chatShell, glassSurface(tokens')
    expect(src).not.toContain('styles.kaelClientStage, glassSurface(tokens')
    expect(src).not.toContain('styles.kaelBrief, glassSurface(tokens')
    expect(src).toContain('styles.quickPanel, workerOpaqueCardSurface(tokens, tone)')
    expect(src).toContain('styles.timelineCard, workerOpaqueCardSurface(tokens)')
    expect(src).toContain('styles.listCard, workerOpaqueCardSurface(tokens)')
    expect(src).toContain('styles.verificationCard, workerOpaqueCardSurface(tokens)')
    expect(src).not.toContain('styles.quickPanel, glassSurface(tokens, tone)')
    expect(src).not.toContain('styles.verificationCard, glassSurface(tokens')
    expect(src).not.toContain('quickGrid')
    expect(src).not.toContain('dockLabel')
    expect(src).not.toContain('mapFeatureNote')
    expect(src).not.toContain('WORKER_XANHSM_PROTOTYPE_SOURCE')
    expect(src).not.toContain('worker-prototype-contract')
    expect(src).not.toContain('.tmp/design-lab/worker-xanhsm-v3')
    expect(src).not.toContain('worker-surfaces-v3')
    expect(src).not.toContain('worker-v2-')
    expect(src).not.toContain('worker-v3-')
  })

  it('keeps Worker scope to electrical, plumbing, and cleaning services only', () => {
    const src = shell()
    expect(src).toContain('electricianCard')
    expect(src).toContain('plumberCard')
    expect(src).toContain('cleaningCard')
    expect(src).toContain('const experimentalBackgroundImage')
    expect(src).toContain('linear-gradient(145deg, rgba(22,43,40,0.78), rgba(12,26,25,0.68))')
    expect(src).not.toMatch(/ac repair|appliance|handyman/i)
  })

  it('keeps Worker theme/language switching and Kael chat local-only', () => {
    const src = shell()
    expect(src).toContain('WORKER_THEME_LANGUAGE_STORE')
    expect(src).toContain('WorkerLanguageMode')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain('setAppLanguage')
    expect(src).toContain('WORKER_THEME_STORAGE_KEY')
    expect(src).toContain('worker-language-toggle')
    expect(src).toContain('worker-dark-mode-toggle')
    expect(src).toContain('worker-kael-empty-chat-state')
    expect(src).toContain('worker-kael-local-chat-input')
    expect(src).toContain('worker-jobroom-kael-handoff')
    expect(src).toContain('worker-jobroom-live-brief')
    expect(src).toContain('worker-jobroom-privacy-gate')
    expect(src).toContain('submitWorkerKaelLocalDraft')
    expect(src).not.toContain('buildWorkerDealChatSeed')
    expect(src).toContain('const renderedMessages = messages')
    expect(src).toContain('buildWorkerBroadcastBrief')
    expect(src).toContain('const fullAddressLabel = broadcast.fullAddressLabel ?? deal?.draft.addressLabel ?? null')
    expect(src).toContain('Address: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.')
    expect(src).toContain('Địa chỉ: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.')
    expect(src).toContain('localizedWorkerProblemSummary')
    expect(src).toContain('workerChatDealKey')
    expect(src).not.toContain('deal.broadcast.prebrief.slice(0, 2)')
  })

  it('keeps Worker shell behind provider actions with no direct backend, AI, or secrets', () => {
    const files = [
      shellPath,
      'app/(worker)/home.tsx',
      'app/(worker)/jobs.tsx',
      'app/(worker)/chat.tsx',
      'app/(worker)/earnings.tsx',
      'app/(worker)/profile.tsx',
    ]

    for (const file of files) {
      const src = exists(file) ? read(file) : ''
      expect(src).not.toContain('fetch(')
      expect(src).not.toContain('createClient')
      expect(src).not.toContain('supabase.')
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
      expect(src).not.toContain('callAI')
      expect(src).not.toContain('ANTHROPIC_API_KEY')
      expect(src).not.toContain('PERPLEXITY_API_KEY')
      expect(src).not.toContain('DEEPSEEK_API_KEY')
      expect(src).not.toContain('payment_pending')
    }
  })

  it('keeps Worker typography below extra-heavy weights', () => {
    const src = shell()
    expect(src).not.toContain("fontWeight: '800'")
    expect(src).not.toContain("fontWeight: '900'")
  })
})

// ===================================================================
// Auth layout - Stack navigator (A0: login -> verify-otp)
// ===================================================================


describe('auth layout wiring', () => {
  const src = read('app/(auth)/_layout.tsx')

  it('uses Stack from expo-router', () => {
    expect(src).toMatch(/import\s+\{.*Stack.*\}\s+from\s+['"]expo-router['"]/)
  })

  it('registers login screen', () => {
    expect(src).toContain('"login"')
  })

  it('registers verify-otp screen', () => {
    expect(src).toContain('"verify-otp"')
  })

  it('does not register the removed onboard screen', () => {
    expect(src).not.toContain('"onboard"')
  })
})

describe('auth production login surface', () => {
  const route = read('app/(auth)/login.tsx')
  const surfacePath = 'components/auth/auth-surfaces.tsx'
  const surface = read(surfacePath)

  it('wires login to the production auth surface', () => {
    expect(exists(surfacePath)).toBe(true)
    expect(route).toContain('@/components/auth/auth-surfaces')
    expect(route).not.toContain('auth-surfaces-v2')
    expect(surface).toContain('export function LoginRoleSurface')
  })

  it('keeps the role gate and removes onboarding runtime markers', () => {
    expect(surface).toContain('auth-role-gate-glass')
    expect(surface).toContain('auth-entry-role-first')
    expect(surface).toContain('auth-entry-role-customer')
    expect(surface).toContain('auth-entry-role-worker')
    expect(surface).toContain('auth-entry-role-change')
    expect(surface).toContain('auth-login-role-customer')
    expect(surface).toContain('auth-login-role-worker')
    expect(surface).not.toContain('OnboardingSurface')
    expect(surface).not.toContain('auth-onboarding')
    expect(surface).not.toContain('auth-v2')
    expect(surface).not.toContain('/(auth)/onboard')
  })

  it('requires role-first selection and email/password auth before role section routing', () => {
    expect(surface).toContain('loginRoleReducer')
    expect(surface).toContain('selectedEntryRole')
    expect(surface).toContain('!isAuthenticated && !selectedEntryRole')
    expect(surface).toContain("setSelectedEntryRole('customer')")
    expect(surface).toContain("setSelectedEntryRole('worker')")
    expect(surface).toContain('TextInput')
    expect(surface).toContain('secureTextEntry')
    expect(surface).toContain('signInWithPassword')
    expect(surface).toContain('auth-login-email-input')
    expect(surface).toContain('auth-login-password-input')
    expect(surface).toContain('auth-login-submit')
    expect(surface).toContain("setPassword('')")
    expect(surface).not.toContain('useState')
    expect(surface).not.toContain("onPress={() => router.replace('/(customer)/home')}")
    expect(surface).not.toContain("onPress={() => router.replace('/(worker)/home')}")
  })

  it('supports admin audit selection after authenticated profile role is loaded', () => {
    expect(surface).toContain("role === 'admin'")
    expect(surface).toContain('auth-login-admin-audit')
    expect(surface).toContain('auth-login-admin-audit-customer')
    expect(surface).toContain('auth-login-admin-audit-worker')
    expect(read('components/customer/customer-surfaces.tsx')).toContain('customer-admin-audit-switch')
    expect(read('components/worker/worker-surfaces.tsx')).toContain('worker-admin-audit-switch')
  })
})

// ===================================================================
// Root layout - AuthProvider wrapping
// ===================================================================


describe('root layout', () => {
  const src = read('app/_layout.tsx')

  it('imports AuthProvider', () => {
    expect(src).toContain('AuthProvider')
  })

  it('wraps children with AuthProvider', () => {
    expect(src).toContain('<AuthProvider>')
  })

  it('uses Slot from expo-router (not Stack)', () => {
    // Root should use Slot to let groups define their own navigators
    expect(src).toMatch(/import\s+\{.*Slot.*\}\s+from\s+['"]expo-router['"]/)
    expect(src).toContain('<Slot')
  })
})

// ===================================================================
// Index (splash redirect) - role-based routing
// ===================================================================

describe('index.tsx routing logic', () => {
  const src = read('app/index.tsx')

  it('imports useAuth hook', () => {
    expect(src).toContain('useAuth')
  })

  it('checks loading state', () => {
    expect(src).toContain('loading')
  })

  it('redirects to (auth)/login when no session', () => {
    expect(src).toContain('/(auth)/login')
    expect(src).not.toContain('/(auth)/onboard')
  })

  it('redirects to (worker)/home for worker role', () => {
    expect(src).toContain('/(worker)/home')
  })

  it('redirects to (customer)/home as default', () => {
    expect(src).toContain('/(customer)/home')
  })

  it('uses Redirect from expo-router (not router.push)', () => {
    expect(src).toContain('Redirect')
    expect(src).toMatch(/import\s+\{.*Redirect.*\}\s+from\s+['"]expo-router['"]/)
  })

  it('shows loading indicator while checking auth', () => {
    expect(src).toContain('ActivityIndicator')
  })

  it('keeps admin at auth gateway to choose audit section', () => {
    expect(src).toContain("role === 'admin'")
    expect(src).toContain('/(auth)/login')
  })
})

describe('role guarded route groups', () => {
  const customerLayout = read('app/(customer)/_layout.tsx')
  const workerLayout = read('app/(worker)/_layout.tsx')

  it('guards customer routes behind authenticated customer/admin roles', () => {
    expect(customerLayout).toContain('useAuth')
    expect(customerLayout).toContain('Redirect')
    expect(customerLayout).toContain("role === 'admin'")
    expect(customerLayout).toContain("role !== 'customer'")
    expect(customerLayout).toContain('/(auth)/login')
  })

  it('guards worker routes behind authenticated worker/admin roles', () => {
    expect(workerLayout).toContain('useAuth')
    expect(workerLayout).toContain('Redirect')
    expect(workerLayout).toContain("role === 'admin'")
    expect(workerLayout).toContain("role !== 'worker'")
    expect(workerLayout).toContain('/(auth)/login')
  })
})

// ===================================================================
// Supabase client - Rule #1: secrets server-side only
// ===================================================================

describe('supabase.ts (Rule #1: no hardcoded secrets)', () => {
  const src = read('lib/supabase.ts')
  const runtimeConfig = read('lib/runtime-config.ts')

  it('does NOT hardcode supabase URL', () => {
    expect(src).not.toMatch(/https:\/\/[a-z]+\.supabase\.co/)
    expect(runtimeConfig).not.toMatch(/https:\/\/[a-z]+\.supabase\.co/)
  })

  it('does NOT hardcode anon key', () => {
    // Supabase anon keys start with eyJ
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]+/)
    expect(runtimeConfig).not.toMatch(/eyJ[A-Za-z0-9_-]+/)
  })

  it('reads URL from runtime Expo config with Expo Go fallbacks', () => {
    expect(src).toContain('mobileRuntimeConfig.supabaseUrl')
    expect(runtimeConfig).toContain('Constants.expoConfig')
    expect(runtimeConfig).toContain('manifest2')
    expect(runtimeConfig).toContain('EXPO_PUBLIC_SUPABASE_URL')
  })

  it('reads key from runtime Expo config', () => {
    expect(src).toContain('mobileRuntimeConfig.supabasePublishableKey')
    expect(runtimeConfig).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  })

  it('uses SecureStore for session persistence', () => {
    expect(src).toContain("from 'expo-secure-store'")
    expect(src).toContain('supabaseAuthStorage')
    expect(src).toContain('storage: supabaseAuthStorage')
    expect(src).toContain('fallbackAuthStorage')
    expect(src).toContain('getBrowserStorage')
    expect(src).not.toContain('AsyncStorage')
  })

  it('disables detectSessionInUrl (RN has no URL bar)', () => {
    expect(src).toContain('detectSessionInUrl: false')
  })

  it('enables autoRefreshToken', () => {
    expect(src).toContain('autoRefreshToken: true')
  })

  it('uses Database generic for type safety', () => {
    expect(src).toContain('<Database>')
    expect(src).toContain("from '@home-services/shared'")
  })

  it('does NOT use process.env (Rule #1 - RN uses app.json extra)', () => {
    expect(src).not.toContain('process.env')
    expect(runtimeConfig).toContain('EXPO_PUBLIC_')
    expect(runtimeConfig).not.toContain('SERVICE_ROLE')
    expect(runtimeConfig).not.toContain('SECRET_KEY')
  })

  it('falls back to empty string (not undefined) for missing config', () => {
    expect(runtimeConfig).toContain("return ''")
  })

  it('does NOT create a Supabase client when mobile config is missing', () => {
    expect(src).toContain('isSupabaseConfigured')
    expect(src).toContain(': null')
  })
})

// ===================================================================
// Auth provider - correct Supabase auth pattern
// ===================================================================

describe('auth-provider.tsx', () => {
  const src = read('lib/auth-provider.tsx')

  it('creates React Context', () => {
    expect(src).toContain('createContext')
  })

  it('exports AuthProvider component', () => {
    expect(src).toMatch(/export\s+function\s+AuthProvider/)
  })

  it('exports useAuth hook', () => {
    expect(src).toMatch(/export\s+function\s+useAuth/)
  })

  it('listens to onAuthStateChange', () => {
    expect(src).toContain('onAuthStateChange')
  })

  it('cleans up subscription on unmount', () => {
    // Must call subscription.unsubscribe() in cleanup
    expect(src).toContain('subscription.unsubscribe()')
  })

  it('fetches role from profiles table', () => {
    expect(src).toContain("from('profiles')")
    expect(src).toContain("select('role')")
  })

  it('imports UserRole from shared package', () => {
    expect(src).toContain('UserRole')
    expect(src).toContain('USER_ROLES')
    expect(src).toContain("from '@home-services/shared'")
  })

  it('auth state has session, role, and loading', () => {
    expect(src).toContain('session')
    expect(src).toContain('role')
    expect(src).toContain('loading')
  })

  it('exposes production auth actions and explicit profile status', () => {
    expect(src).toContain('signInWithPassword')
    expect(src).toContain('signOut')
    expect(src).toContain('refreshProfile')
    expect(src).toContain('profileStatus')
    expect(src).toContain('profile_missing')
    expect(src).toContain('profile_error')
    expect(src).toContain('authError')
  })

  it('sets loading false after role fetch completes', () => {
    expect(src).toContain("patchAuth({ role: nextRole, profileStatus: 'ready', loading: false })")
  })

  it('handles Supabase auth/profile failures without leaving loading stuck', () => {
    expect(src).toContain('try {')
    expect(src).toContain('} catch {')
    expect(src).toContain('Không thể kết nối Supabase để đăng nhập')
    expect(src).toContain('Không thể tải hồ sơ đăng nhập')
    expect(src).toContain('Vai trò tài khoản không hợp lệ')
  })

  it('validates malformed email locally before Supabase password sign-in', () => {
    expect(src).toContain('isValidEmail')
    expect(src).toContain('Email không hợp lệ')
    expect(src.indexOf('isValidEmail(normalizedEmail)')).toBeLessThan(src.indexOf('supabase.auth.signInWithPassword'))
  })

  it('resets role to null on sign out', () => {
    expect(src).toContain('role: null')
    expect(src).toContain("supabase.auth.signOut({ scope: 'local' })")
  })

  it('renders children instead of crashing when Supabase config is missing', () => {
    expect(src).toContain('if (!supabase)')
    expect(src).toContain("profileStatus: 'config_missing', loading: false")
  })
})

describe('auth login recovery UI', () => {
  const src = read('components/auth/auth-surfaces.tsx')

  it('shows recovery actions for profile errors without rendering raw profile status values', () => {
    expect(src).toContain('auth-profile-recovery')
    expect(src).toContain('auth-profile-refresh')
    expect(src).toContain('auth-profile-recovery-sign-out')
    expect(src).toContain('refreshProfile')
    expect(src).toContain("profileStatus === 'config_missing'")
    expect(src).toContain('Supabase chưa được cấu hình cho mobile build này')
    expect(src).not.toContain('{profileStatus}</Text>')
    expect(src).not.toContain('<Text style={styles.errorText}>{profileStatus}</Text>')
  })

  it('keeps login background structural instead of decorative orb blobs', () => {
    expect(src).toContain('function AmbientBackdrop')
    expect(src).not.toContain('backdropMint')
    expect(src).not.toContain('backdropCream')
    expect(src).not.toContain('backdropCyan')
  })
})

// ===================================================================
// No secrets in any mobile source file (Rule #1 sweep)
// ===================================================================

describe('Rule #1 sweep: no secrets in mobile code', () => {
  const files = [
    'lib/supabase.ts',
    'lib/auth-provider.tsx',
    'app/_layout.tsx',
    'app/index.tsx',
  ]

  it.each(files)('%s has no process.env', (file) => {
    const src = read(file)
    expect(src).not.toContain('process.env')
  })

  it.each(files)('%s has no hardcoded API key patterns', (file) => {
    const src = read(file)
    // Common key patterns
    expect(src).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(src).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(src).not.toMatch(/ANTHROPIC_API_KEY/)
    expect(src).not.toMatch(/PERPLEXITY_API_KEY/)
    expect(src).not.toMatch(/DEEPSEEK_API_KEY/)
  })
})

// ===================================================================
// app.json config
// ===================================================================

describe('app.json configuration', () => {
  const appJson = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'app.json'), 'utf-8'))
  const expo = appJson.expo

  it('has app name', () => {
    expect(expo.name).toBeDefined()
    expect(expo.name.length).toBeGreaterThan(0)
  })

  it('has scheme for deep linking', () => {
    expect(expo.scheme).toBeDefined()
  })

  it('has iOS bundleIdentifier', () => {
    expect(expo.ios?.bundleIdentifier).toBeDefined()
  })

  it('has iOS store build metadata and review permission copy', () => {
    expect(expo.ios?.buildNumber).toBeDefined()
    expect(expo.ios?.config?.usesNonExemptEncryption).toBe(false)
    expect(expo.ios?.infoPlist?.NSCameraUsageDescription).toContain('camera')
    expect(expo.ios?.infoPlist?.NSPhotoLibraryUsageDescription).toContain('ảnh')
  })

  it('has Android package', () => {
    expect(expo.android?.package).toBeDefined()
  })

  it('has Android store build metadata and blocks microphone permission', () => {
    expect(expo.android?.versionCode).toBeGreaterThanOrEqual(1)
    expect(expo.android?.permissions).toEqual([])
    expect(expo.android?.blockedPermissions).toContain('android.permission.RECORD_AUDIO')
  })

  it('has expo-router plugin', () => {
    const plugins = expo.plugins ?? []
    const hasRouter = plugins.some((p: string | string[]) =>
      typeof p === 'string' ? p === 'expo-router' : p[0] === 'expo-router'
    )
    expect(hasRouter).toBe(true)
  })

  it('has supabase config in extra (not hardcoded in code)', () => {
    expect(expo.extra?.supabaseUrl).toBeDefined()
    expect(expo.extra?.supabasePublishableKey).toBeDefined()
  })

  it('registers expo-image-picker for customer image/video selection copy', () => {
    const plugins = expo.plugins ?? []
    const hasImagePicker = plugins.some((p: string | string[]) =>
      typeof p === 'string' ? p === 'expo-image-picker' : p[0] === 'expo-image-picker'
    )
    expect(hasImagePicker).toBe(true)
  })

  it('supabase extra values are placeholders (not real keys)', () => {
    // These should be env-substituted at build time, not hardcoded secrets
    const url = expo.extra?.supabaseUrl ?? ''
    const key = expo.extra?.supabasePublishableKey ?? ''
    // They should either be empty or contain placeholder patterns
    const isPlaceholder = (v: string) =>
      v === '' ||
      v.startsWith('YOUR_') ||
      v.startsWith('$') ||
      v.includes('PLACEHOLDER') ||
      v.includes('supabase') // supabase URLs contain "supabase"
    // At minimum, the key should NOT be a real JWT (starts with eyJ)
    expect(key).not.toMatch(/^eyJ[A-Za-z0-9_-]{100,}/)
  })
})

describe('app.config.ts runtime config', () => {
  const src = read('app.config.ts')

  it('maps mobile Supabase config from public env names only', () => {
    expect(src).toContain('EXPO_PUBLIC_SUPABASE_URL')
    expect(src).not.toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(src).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    expect(src).not.toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    expect(src).toContain('EXPO_PUBLIC_API_BASE_URL')
    expect(src).toContain('supabasePublishableKey')
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(src).not.toContain('SUPABASE_SECRET_KEY')
  })
})

describe('web preview dependencies', () => {
  const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))

  it('declares react-dom for Expo web rendering', () => {
    expect(mobilePackage.dependencies['react-dom']).toBe('19.1.0')
  })

  it('declares react-native-web for Expo web rendering', () => {
    expect(mobilePackage.dependencies['react-native-web']).toBe('~0.21.2')
  })

  it('declares react-native-svg for mobile icon rendering', () => {
    expect(mobilePackage.dependencies['react-native-svg']).toBe('15.12.1')
  })

  it('keeps the existing Reanimated dependency available without forcing it into glass surfaces', () => {
    expect(mobilePackage.dependencies['react-native-reanimated']).toBe('~4.1.7')
  })

  it('declares expo-image-picker for local image/video draft media', () => {
    expect(mobilePackage.dependencies['expo-image-picker']).toBeDefined()
  })
})

describe('mobile glassmorphism design system', () => {
  const uiFiles = [
    'components/ui/tokens.ts',
    'components/ui/motion-tokens.ts',
    'components/ui/accessibility-motion.ts',
    'components/ui/glass-surface.tsx',
    'components/ui/glass-card.tsx',
    'components/ui/glass-pressable.tsx',
    'components/ui/glass-search-bar.tsx',
    'components/ui/glass-modal-sheet.tsx',
    'components/ui/floating-glass-tab-bar.tsx',
    'components/ui/reduce-motion-aware-animation.ts',
  ] as const

  it.each(uiFiles)('%s exists', (file) => {
    expect(exists(file)).toBe(true)
  })

  it('centralizes glass variants and motion tokens with verified Expo native glass dependencies', () => {
    const tokens = read('components/ui/tokens.ts')
    const motion = read('components/ui/motion-tokens.ts')
    const surface = read('components/ui/glass-surface.tsx')
    const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))
    expect(tokens).toContain("export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet' | 'subtle'")
    expect(tokens).toContain('reduceTransparency ? fallbackBackground')
    expect(tokens).toContain("boxShadow: reduceTransparency ? 'none'")
    expect(motion).toContain('durationMs: 440')
    expect(motion).toContain('reducedDurationMs')
    expect(mobilePackage.dependencies['expo-glass-effect']).toBe('~0.1.10')
    expect(mobilePackage.dependencies['expo-blur']).toBe('~15.0.8')
    expect(surface).toContain("from 'expo-glass-effect'")
    expect(surface).toContain("from 'expo-blur'")
    expect(surface).toContain('isLiquidGlassAvailable()')
    expect(surface).toContain('reduceTransparency')
    expect(surface).toContain('experimentalBlurMethod="none"')
  })

  it('wires Reduce Motion and accessibility states into shared glass controls', () => {
    const accessibility = read('components/ui/accessibility-motion.ts')
    const pressable = read('components/ui/glass-pressable.tsx')
    const tabBar = read('components/ui/floating-glass-tab-bar.tsx')
    const reduceMotion = read('components/ui/reduce-motion-aware-animation.ts')
    const customerShell = read('components/customer/customer-surfaces.tsx')
    const workerShell = read('components/worker/worker-surfaces.tsx')
    const bookingFlow = read('components/client-price-check/client-price-check-flow.tsx')
    expect(accessibility).toContain('isReduceMotionEnabled')
    expect(accessibility).toContain('isReduceTransparencyEnabled')
    expect(pressable).toContain("accessibilityRole = 'button'")
    expect(pressable).toContain('accessibilityState?: AccessibilityState')
    expect(pressable).toContain('accessibilityState={accessibilityState ?? { disabled, selected: active }}')
    expect(pressable).toContain('reduceMotionAwarePressStyle(pressed, reduceMotion)')
    expect(tabBar).toContain('accessibilityRole="tab"')
    expect(tabBar).toContain('accessibilityState={{ selected: focused }}')
    expect(tabBar).toContain('reduceMotionAwarePressStyle(pressed, reduceMotion)')
    expect(reduceMotion).toContain('if (!pressed || reduceMotion) return null')
    expect(reduceMotion).toContain('export function ReduceMotionAwareEntranceView')
    expect(reduceMotion).toContain('Animated.timing')
    expect(reduceMotion).toContain('Animated.spring')
    expect(reduceMotion).toContain('Animated.delay(delayMs)')
    expect(reduceMotion).toContain('useNativeDriver: true')
    expect(reduceMotion).toContain('motionDuration(motionTokens.entrance.durationMs, reduceMotion)')
    expect(customerShell).toContain('customer-home-hero-motion')
    expect(workerShell).toContain('worker-request-sheet-motion')
    expect(bookingFlow).toContain('customer-booking-sheet-motion')
    expect(read('components/auth/auth-surfaces.tsx')).toContain('pressed: { opacity: 0.78 }')
    expect(workerShell).toContain('pressed: { opacity: 0.78 }')
    expect(read('components/auth/auth-surfaces.tsx')).not.toContain('pressed: { opacity: 0.78, transform')
    expect(workerShell).not.toContain('pressed: { opacity: 0.78, transform')
  })

  it('lets visual primary buttons avoid false selected accessibility state', () => {
    const worker = read('components/worker/worker-surfaces.tsx')
    expect(worker).toContain('active={!secondary}')
    expect(worker).toContain('accessibilityState={{ disabled }}')
  })
})

// ===================================================================
// colors.ts - design consistency
// ===================================================================

describe('constants/colors.ts', () => {
  it('exists', () => {
    expect(exists('constants/colors.ts')).toBe(true)
  })

  it('exports Colors object', () => {
    const src = read('constants/colors.ts')
    expect(src).toContain('Colors')
  })

  it('has primary color', () => {
    const src = read('constants/colors.ts')
    expect(src).toContain('primary')
  })
})

// ===================================================================
// Client Price Check production UI - customer Đặt lịch A2-A5 slice
// ===================================================================

describe('client price check production UI', () => {
  const bookingRoute = read('app/(customer)/booking.tsx')
  const productionComponentPath = 'components/client-price-check/client-price-check-flow.tsx'

  it('wires the customer booking tab to a production price-check component', () => {
    expect(exists(productionComponentPath)).toBe(true)
    expect(bookingRoute).toContain('ClientPriceCheckFlow')
    expect(bookingRoute).toContain('@/components/client-price-check/client-price-check-flow')
    expect(bookingRoute).not.toContain('ClientPriceCheckPrototype')
    expect(bookingRoute).not.toContain('client-price-check-prototype')
  })

  it('keeps production V4 UI separate from the prototype implementation', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('production-price-check-flow')
    expect(component).toContain('booking-form-first-shell')
    expect(component).toContain('BOOKING_V4_VISUAL_CONTRACT')
    expect(component).toContain('BOOKING_FORM_FIRST_CONTRACT')
    expect(component).toContain('BOOKING_LAYER_SWITCH_V4')
    expect(component).toContain('BOOKING_TYPE_RHYTHM')
    expect(component).toContain('BOOKING_INTERACTION_MOTION_V4')
    expect(component).toContain('BookingFormSurface')
    expect(component).toContain('EvidenceDraftSlots')
    expect(component).toContain('EstimatePanel')
    expect(component).toContain('SchedulePanel')
    expect(component).toContain('ConfirmPanel')
    expect(component).toContain('PriceCheckUiStep')
    expect(component).toContain('PriceCheckUiStatus')
    expect(component).not.toContain('function HubStep')
    expect(component).not.toContain('function ProblemStep')
    expect(component).not.toContain('HomeServicesScene')
    expect(component).not.toContain('prototype-only')
    expect(component).not.toContain('motion-lab-v8')
    expect(component).not.toContain('color-signature-v11')
    expect(component).not.toContain('Production backend')
    expect(component).not.toContain('ch?a g?i backend')
    expect(component).not.toContain('ch?a ghi Supabase')
  })

  it('covers the V4 production flow states', () => {
    const component = read(productionComponentPath)
    expect(component).toContain("'form'")
    expect(component).toContain("'clarification'")
    expect(component).toContain("'estimate'")
    expect(component).toContain("'schedule'")
    expect(component).toContain("'confirm'")
    expect(component).toContain("'searching'")
    expect(component).toContain("'emptyWorker'")
    expect(component).toContain("'matched'")
    expect(component).toContain("'loading'")
    expect(component).toContain("'fallback'")
    expect(component).toContain("'error'")
    expect(component).toContain('continueFlow')
    expect(component).toContain('goBack')
    expect(component).toContain("setStatus('loading')")
  })

  it('implements V4 local media selection and confirm/search UI without backend upload claims', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('MediaDraftItem')
    expect(component).toContain('expo-image-picker')
    expect(component).toContain('pickMedia')
    expect(component).toContain('removeMedia')
    expect(component).toContain("type: 'image' | 'video'")
    expect(component).toContain('SchedulePanel')
    expect(component).toContain('ConfirmPanel')
    expect(component).toContain('SearchingWorkerPanel')
    expect(component).toContain('EmptyWorkerPanel')
    expect(component).toContain('WorkerMatchedPanel')
    expect(component).toContain('client-media-local-only')
    expect(component).not.toContain('upload success')
    expect(component).not.toContain('?? t?i l?n')
  })

  it('uses electrical/plumbing/cleaning shared scope with localized production copy', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('bookingCopy')
    expect(component).toContain('localizedProblemOptions')
    expect(component).toContain('localizedProblemLabel')
    expect(component).toContain('useAppLanguage')
    expect(component).toContain('ServiceType')
    expect(component).toContain("'electrical'")
    expect(component).toContain("'plumbing'")
    expect(component).toContain("'cleaning'")
    expect(component).toContain('EMPTY_DRAFT')
    expect(component).not.toContain('INITIAL_DRAFT')
    expect(component).toContain("serviceType === 'electrical'")
    expect(component).toContain("onSelectService('plumbing')")
    expect(component).toContain("onSelectService('cleaning')")
    expect(component).toContain("vi: {")
    expect(component).toContain("en: {")
    expect(component).toContain('addressLabel')
    expect(component).not.toMatch(/ac repair|appliance|handyman/i)
  })

  it('harmonizes booking colors and typography with the V4 customer shell', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('BOOKING_TYPE_RHYTHM')
    expect(component).toContain('BOOKING_LAYER_SWITCH_V4')
    expect(component).toContain('const tokens = {')
    expect(component).toContain("glass: 'rgba(255,253,248,0.78)'")
    expect(component).toContain("fontWeight: '700'")
    expect(component).toContain("fontWeight: '600'")
    expect(component).not.toContain("fontWeight: '900'")
  })

  it('keeps price honesty and the required disclaimer visible', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('PRICE_DISCLAIMER')
    expect(component).toContain('priceDisclaimer: PRICE_DISCLAIMER')
    expect(component).toContain('disclaimer: copy.estimate.priceDisclaimer')
    expect(component).toContain('priceRangeLabel')
    expect(component).toContain('confidenceLabel')
    expect(component).toContain('advisory')
    expect(component).toContain('baseline_fallback')
    expect(component).not.toContain('exact price')
    expect(component).not.toContain('guaranteed price')
  })

  it('starts booking from an empty draft instead of seeded demo data', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('EMPTY_DRAFT')
    expect(component).toContain('problemChips: []')
    expect(component).toContain("description: ''")
    expect(component).toContain("addressLabel: ''")
    expect(component).not.toContain("description: 'Ổ cắm")
    expect(component).not.toContain("problemChips: ['Ổ cắm")
    expect(component).not.toContain("addressLabel: 'Căn hộ")
  })

  it('renders only the active booking workflow section at each step', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('currentStepContent')
    expect(component).toContain('booking-current-step-only')
    expect(component).toContain('isDraftValid')
    expect(component).toContain('validationMessage')
    expect(component).toContain("if (!isDraftValid) {\n        setStep('form')")
    expect(component).not.toContain("<TrustRail active=\"estimate\" />\n              <EstimatePanel")
    expect(component).not.toContain('function MatchingStatesPanel')
    expect(component).not.toContain('<MatchingStatesPanel />')
  })

  it('uses interaction-triggered V4 controls with controlled glass motion', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('Pressable')
    expect(component).toContain('onPress={onPress}')
    expect(component).toContain('BOOKING_INTERACTION_MOTION_V4')
    expect(component).toContain('BookingBackdrop')
    expect(component).toContain('booking-section-glass-field')
    expect(component).toContain('GlassPressable')
    expect(component).toContain('useGlassAccessibility')
    expect(component).toContain('bookingOpaqueSheet')
    expect(component).toContain('bookingOpaqueControl')
    expect(component).toContain('if (reduceTransparency) return null')
    expect(component).not.toContain('useSharedValue')
    expect(component).not.toContain('useAnimatedStyle')
    expect(component).not.toContain('react-native-reanimated')
    expect(component).not.toContain('withRepeat')
    expect(component).not.toContain('backdropFilter')
    expect(component).not.toContain("filter: 'blur")
    expect(component).toContain('CustomerV4DockOverlay')
    expect(component).not.toContain('Animated.loop')
    expect(component).not.toContain('onHoverIn')
  })

  it('spreads V4 interaction states across the production flow', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('Segment')
    expect(component).toContain('Chip')
    expect(component).toContain('ChoiceCard')
    expect(component).toContain('primaryButton')
    expect(component).toContain('booking-form-field-focus')
    expect(component).toContain('segmentActive')
    expect(component).toContain('chipActive')
    expect(component).toContain('choiceCardActive')
    expect(component).toContain('KIỂM GIÁ')
    expect(component).not.toContain('KIEM GIA')
    expect(component).not.toContain('LUỒNG V4')
    expect(component).toContain('accessibilityState={{ disabled }}\n          active')
    const flowCardStyle = component.match(/flowCard:\s*{[\s\S]*?padding:\s*13,\s*}/)?.[0] ?? ''
    expect(flowCardStyle).toContain('backgroundColor: tokens.base')
    expect(component).toMatch(/flowCard:\s*{[\s\S]*?boxShadow:\s*'none'/)
    expect(flowCardStyle).not.toContain('experimental_backgroundImage')
    expect(component).toMatch(/segmentActive:\s*{[\s\S]*?boxShadow:\s*'none'/)
    expect(component).toMatch(/chipActive:\s*{[\s\S]*?boxShadow:\s*'none'/)
    expect(component).not.toContain('motionPressableOverlay')
    expect(component).not.toContain('onHoverIn')
    expect(component).not.toContain('tapOverlayScale')
    expect(component).not.toContain('motionAccentBar')
  })

  it('uses explicit one-shot states for loading and estimate reveal', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('SearchingWorkerPanel')
    expect(component).toContain('EstimatePanel')
    expect(component).toContain('setStatus(unclear ?')
    expect(component).toContain("setStep('estimate')")
    expect(component).toContain("setStep('searching')")
    expect(component).toContain("setStep('emptyWorker')")
    expect(component).toContain("'loading'")
    expect(component).toContain("'estimate_ready'")
    expect(component).toContain("'fallback'")
  })

  it('has responsive guards for compact iOS and Android store builds', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('const { width } = useWindowDimensions()')
    expect(component).toContain('const frameWidth = Math.min(width, 430)')
    expect(component).toContain('maxWidth: 430')
    expect(component).toContain('paddingBottom: Math.max(insets.bottom + 220, 220)')
    expect(component).toContain('automaticallyAdjustKeyboardInsets')
    expect(component).toContain('keyboardShouldPersistTaps="handled"')
    expect(component).toContain('<CustomerV4DockOverlay active="booking" />')
    expect(component).toContain('bookingFrameHorizontalPadding')
    expect(component).toContain('SheetActions')
    expect(component).toContain('sheetActions')
    expect(component).toContain('width: Math.max(0, frameWidth - bookingFrameHorizontalPadding * 2)')
    expect(component).toContain('ScrollView')
    expect(component).not.toContain('left: horizontalOffset')
  })

  it('does not call backend, Supabase mutations, or AI providers from production mobile UI', () => {
    const component = read(productionComponentPath)
    expect(component).not.toContain('fetch(')
    expect(component).not.toContain('createClient')
    expect(component).not.toContain('supabase.')
    expect(component).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    expect(component).not.toContain('callAI')
    expect(component).not.toContain('ANTHROPIC_API_KEY')
    expect(component).not.toContain('PERPLEXITY_API_KEY')
    expect(component).not.toContain('DEEPSEEK_API_KEY')
  })

  it('keeps booking broadcast/matching as honest local UI states without backend mutation or fake worker data', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('accessibilityLabel={copy.search.title}')
    expect(component).toContain('accessibilityLabel={copy.emptyWorker.title}')
    expect(component).toContain('actions.confirmRemoteSearch')
    expect(component).toContain('WorkerMatchedPanel copy={copy} language={language} status')
    expect(component).toContain('customer-no-fake-worker-data')
    expect(component).not.toContain('Anh Minh')
    expect(component).not.toContain('128 job')
    expect(component).not.toContain('payment_pending')
    expect(component).not.toContain('customer_confirmed_booking_search')
  })

  it('uses frontend workflow actions for now-only backend broadcast without hardcoded prices or scheduled slot', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('useFrontendWorkflow')
    expect(component).toContain("serviceType: null")
    expect(component).not.toContain("dispatch({ type: 'submit_booking_draft' })")
    expect(component).toContain('actions.createRemoteJobFromDraft')
    expect(component).toContain('selectors.canConfirmCustomerSearch')
    expect(component).toContain('actions.confirmRemoteSearch')
    expect(component).not.toContain("dispatch({ type: 'retry_customer_search' })")
    expect(component).toContain("dispatch({ type: 'reopen_booking_draft' })")
    expect(component).toContain('confirmCancelCurrentSearch')
    expect(component).toContain('Alert.alert')
    expect(component).toContain('actions.cancelRemoteJob')
    expect(component).toContain('Hủy yêu cầu')
    expect(component).toContain('secondaryLabelForStep')
    expect(component).toContain('Chỉnh yêu cầu')
    expect(component).toContain('Về trang chủ')
    expect(component).toContain('workflowDraftSyncKey')
    expect(component).toContain('skipNextWorkflowDraftSyncRef')
    expect(component).toContain('manualErrorMessage')
    expect(component).toContain('Cần quyền thư viện ảnh/video')
    expect(component).toContain('draftFromWorkflow(workflowState.deal?.draft)')
    expect(component).toContain("selectors.currentStatus !== 'draft' || step !== 'emptyWorker'")
    expect(component).toContain('Chờ Kael ước tính')
    expect(component).not.toContain('Sắp mở cho lịch ' + 'hẹn')
    expect(component).toContain('booking-clarification-required')
    expect(component).toContain('description.trim().length < 12')
    expect(component).toContain('addressLabel.trim().length < 4')
    expect(component).toContain('unsupportedServiceLabel')
    expect(component).toContain('copy.form.unsupportedService')
    expect(component).not.toContain('{unsupportedServiceLabel ? <Text style={styles.validationText}>{unsupportedServiceLabel}</Text> : null}')
    expect(component).toContain('maxLength={160}')
    expect(component).toContain('maxLength={96}')
    expect(component).toContain("disabled={step === 'clarification' && !clarificationComplete}")
    expect(component).not.toContain('Hôm nay 18:30')
    expect(component).not.toContain('0-2')
    expect(component).not.toMatch(/\d{2,4}k\s?-\s?\d{2,4}k/)
    expect(component).not.toContain('7.5%')
    expect(component).not.toContain('VND')
  })
})

describe('frontend-only workflow safety audit', () => {
  const customerShell = read('components/customer/customer-surfaces.tsx')
  const workerShell = read('components/worker/worker-surfaces.tsx')
  const appLanguageStore = read('lib/app-language.ts')
  const apiTypes = read('lib/api-types.ts')

  it('uses one shared app language store with matching VI/EN dictionary keys', () => {
    expect(appLanguageStore).toContain('APP_LANGUAGE_STORAGE_KEY')
    expect(appLanguageStore).toContain('customer.language.mode.v4')
    expect(appLanguageStore).toContain('home-services.worker.language.production')
    expect(customerShell).not.toContain('CUSTOMER_LANGUAGE_STORAGE_KEY')
    expect(workerShell).not.toContain('setWorkerLanguageMode')

    for (const key of ['appLanguage', 'chooseArea', 'noData', 'noRequest', 'pendingSystem', 'realRequest', 'serviceRequest', 'unknown']) {
      expect(countOccurrences(appLanguageStore, `${key}:`)).toBeGreaterThanOrEqual(2)
    }

    for (const key of ['electrical', 'plumbing', 'cleaning', 'draft', 'broadcasting', 'worker_matched', 'confirmed_by_customer', 'scope_change_pending']) {
      expect(countOccurrences(appLanguageStore, `${key}:`)).toBeGreaterThanOrEqual(2)
    }

    expect(appLanguageStore).not.toContain('Chưa có dữ liệu thật')
    expect(appLanguageStore).not.toContain('No real data yet')
    expect(appLanguageStore).not.toContain('Yêu cầu thật')
    expect(appLanguageStore).not.toContain('Real request')
    expect(appLanguageStore).toContain("if (language === 'vi' && !nonAsciiPattern.test(problem)) return appCopy.vi.common.unknown")
    expect(appLanguageStore).toContain("if (language === 'en' && nonAsciiPattern.test(problem)) return appCopy.en.common.unknown")
  })

  it('localizes workflow provider errors before they reach customer or worker UI', () => {
    const provider = read('lib/frontend-workflow-provider.tsx')
    expect(provider).toContain("import { useAppLanguage, type AppLanguage } from './app-language'")
    expect(provider).toContain('workflowErrorCopy')
    expect(provider).toContain('localizeWorkflowError(error, language)')
    expect(provider).toContain('Could not update the request. Try again.')
    expect(provider).toContain("if (language === 'en' && !asciiOnlyPattern.test(error)) return workflowErrorCopy.en.fallback")
    expect(provider).toContain("if (language === 'vi' && asciiOnlyPattern.test(error)) return workflowErrorCopy.vi.fallback")
    expect(provider).toContain('const mediaError = localizeWorkflowError(uploaded.error, language)')
  })

  it('does not ship hardcoded customer identity, profile, or completed payment data', () => {
    expect(customerShell).not.toContain('Phan Mạnh Tú')
    expect(customerShell).not.toContain('PaymentMode')
    expect(customerShell).not.toContain('customer-home-payment-section')
    expect(customerShell).not.toContain('Có dữ liệu thật')
    expect(customerShell).not.toContain('5.0')
    expect(customerShell).not.toContain('payment_pending')
    expect(customerShell).not.toContain('paid_success')
    expect(customerShell).not.toContain('Ổ cắm nóng')
    expect(customerShell).not.toContain('Dây lỏng')
    expect(customerShell).not.toContain('Tiền mặt')
    expect(customerShell).not.toContain('Đúng giờ')
    expect(customerShell).not.toContain('Rõ giá')
    expect(customerShell).not.toContain('Giải thích rõ')
    expect(customerShell).not.toContain('Thợ đang đến')
    expect(customerShell).not.toContain('Đang sửa')
    expect(customerShell).not.toContain('Gửi ảnh')
    expect(customerShell).not.toContain('Bỏ qua ảnh')
    expect(customerShell).not.toContain('Sửa nội dung')
    expect(customerShell).not.toContain('Các trạng thái')
    expect(customerShell).toContain('completionStatusLabel')
    expect(customerShell).toContain("selectors.currentStatus === 'confirmed_by_customer'")
    expect(customerShell).toContain("['Thợ báo hoàn tất', ['completed_by_worker']]")
    expect(customerShell).toContain('confirmCompletionReceived')
    expect(customerShell).toContain('Xác nhận đã nhận việc?')
    expect(customerShell).toContain('canCreateFreshRequest')
    expect(customerShell).toContain('canEditNoWorkerRequest')
    expect(customerShell).toContain('customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)')
    expect(customerShell).toContain('localizedCustomerAreaLabel')
    expect(customerShell).toContain("searchState === 'no_worker'")
    expect(customerShell).toContain('selectors.canCustomerCancelDeal')
    expect(customerShell).toContain('Yêu cầu tìm thợ sẽ dừng')
    expect(customerShell).not.toContain('Worker đã nhận địa chỉ')
    expect(customerShell).toContain('Alert.alert')
    expect(customerShell).toContain('actions.cancelRemoteJob')
    expect(customerShell).toContain('customer-history-cancel-local-deal')
    expect(customerShell).toContain('<V4TicketCell label={copy.ticket.finalPrice} value={copy.history.waitingWorkerPrice} />')
    expect(customerShell).toContain("dispatch({ type: 'reopen_booking_draft' })")
    expect(customerShell).toContain("dispatch({ type: 'reset_workflow' })")
    expect(customerShell).toContain('historyActionLabel')
    expect(customerShell).toContain('const dataValue = deal ?')
    expect(customerShell).toContain('deal ? profileStatusLabel : copy.profile.noRequest')
    expect(customerShell).not.toContain("deal ? statusLabel(deal.status) : 'Sẵn sàng'")
    expect(customerShell).not.toContain('V4Metric label="Dữ liệu" value="Local"')
  })

  it('does not ship hardcoded worker request, rating, or earning values', () => {
    expect(workerShell).toContain('worker-no-live-request-empty-state')
    expect(workerShell).toContain("service: 'Chờ duyệt'")
    expect(workerShell).toContain("service: 'Pending'")
    expect(workerShell).not.toContain("service: 'Sẵn sàng'")
    expect(workerShell).not.toContain("service: 'Ready'")
    expect(workerShell).not.toContain('value="520k"')
    expect(workerShell).not.toContain('520.000')
    expect(workerShell).not.toContain('00:42')
    expect(workerShell).not.toContain('4.9')
    expect(workerShell).not.toContain('copy.home.estimate')
    expect(workerShell).not.toContain('title={copy.home.estimate}')
    expect(workerShell).not.toContain("mapMeta: 'Chưa có dữ liệu thật'")
    expect(workerShell).not.toContain("mapMeta: 'No real data yet'")
    expect(workerShell).not.toContain('Chưa có hồ sơ thật')
    expect(workerShell).not.toContain('No real profile yet')
    expect(workerShell).not.toContain('Real feedback pending')
    expect(workerShell).not.toContain('Mới')
    expect(workerShell).not.toContain('Nhận việc')
    expect(workerShell).not.toContain('Electrical/water worker profile')
    expect(workerShell).not.toContain("['Electrical', 'Plumbing', 'Backend pending'")
    expect(workerShell).not.toContain('Morning estimate')
    expect(workerShell).not.toContain('Tạm tính ca sáng')
    expect(workerShell).not.toContain('district-7-him-lam')
    expect(workerShell).not.toContain('radiusKm')
  })

  it('gates worker local deal privacy and status actions through the shared workflow', () => {
    expect(workerShell).toContain('useFrontendWorkflow')
    expect(workerShell).toContain('function getWorkerVisibleDeal')
    expect(workerShell).toContain("deal.broadcast.status === 'declined'")
    expect(workerShell).toContain("deal.broadcast.status === 'expired'")
    expect(workerShell).toContain('worker-general-area-before-accept')
    expect(workerShell).toContain('worker-full-address-after-accept')
    expect(workerShell).toContain('worker-local-broadcast-countdown')
    expect(workerShell).toContain('broadcast.secondsRemaining')
    expect(workerShell).toContain('function isAcceptedLocalWorkerDeal')
    expect(workerShell).toContain("deal?.broadcast?.status === 'accepted'")
    expect(workerShell).toContain('const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null')
    expect(workerShell).toContain("const completedLocal = Boolean(acceptedDeal && selectors.currentStatus === 'confirmed_by_customer')")
    expect(workerShell).toContain('const waitingValue = acceptedDeal && selectors.currentStatus !==')
    expect(workerShell).not.toContain('1 ' + 'local')
    expect(workerShell).toContain('selectors.canWorkerSeeFullAddress')
    const workflow = readFileSync(resolve(__dirname, '../mobile-workflow.ts'), 'utf-8')
    expect(workflow).toContain("broadcast?.status === 'accepted'")
    expect(workflow).toContain("state.workerGate === 'local_deal_audit'")
    expect(workflow).toContain("status: 'expired'")
    expect(workflow).toContain('canReplaceLocalDeal')
    expect(workerShell).toContain('selectors.canWorkerAdvance ? getNextWorkerAction')
    expect(workerShell).toContain('const fullJobAddressLabel = selectors.canWorkerSeeFullAddress && deal?.draft.addressLabel')
    expect(workerShell).toContain('const jobVisibleAreaLabel = fullJobAddressLabel ?? jobAreaLabel')
    expect(workerShell).toContain('const visibleArea = deal?.broadcast?.generalArea')
    expect(workerShell).toContain('localizedWorkerAreaLabel')
    expect(workerShell).toContain('localizedWorkerProblemSummary')
    expect(workerShell).toContain('const fullAddressLabel = broadcast?.fullAddressLabel ?? deal?.draft.addressLabel ?? null')
    expect(workerShell).toContain('const deal = getWorkerVisibleDeal(state.deal)')
    expect(workerShell).toContain('const phases = getWorkerTimeline(deal ? selectors.currentStatus : null, language)')
    expect(workerShell).not.toContain('dealSeedMessages')
    expect(workerShell).toContain('setMessages((prev) => [')
    expect(workerShell).toContain('...prev,')
    expect(workerShell).toContain('deal.broadcast.broadcastId ?? deal.broadcast.jobId ?? deal.id')
    expect(workerShell).toContain('const canSendWorkerKaelMessage = Boolean(deal && isAcceptedLocalWorkerDeal(deal))')
    expect(workerShell).toContain('const chatInputPlaceholder = canSendWorkerKaelMessage ? copy.chat.input : broadcast ? copy.chat.lockedGate : copy.chat.waitingInput')
    expect(workerShell).toContain('Chờ Kael đưa yêu cầu vào JobRoom.')
    expect(workerShell).toContain('copy.chat.lockedGate')
    expect(workerShell).toContain('Chấp nhận việc để mở trao đổi.')
    expect(workerShell).toContain("setDraft('')")
    expect(workerShell).toContain('if (!canSendWorkerKaelMessage) return')
    expect(workerShell).toContain('confirmWorkerProgressAction')
    expect(workerShell).toContain('Xác nhận báo hoàn tất?')
    expect(workerShell).toContain('actions.workerAcceptBroadcast')
    expect(workerShell).toContain('actions.workerUpdateStatus')
    expect(workerShell).toContain('worker-final-price-input')
    expect(workerShell).toContain('confirmWorkerProgressAction(nextAction)')
    expect(workerShell).toContain('worker-local-status-action')
  })

  it('keeps mobile API response contracts aligned with PR#12 worker endpoints without wiring UI mutations', () => {
    expect(apiTypes).toContain('export type BroadcastListResponse = WorkerBroadcastsResponse')
    expect(apiTypes).toContain('export type JobDetailResponse = {\n  job: {')
    expect(apiTypes).toContain('kael_price_min: number | null')
    expect(apiTypes).toContain('completion_photo_urls: string[]')
    expect(apiTypes).not.toContain('estimate_price_min')
    expect(apiTypes).toContain('export type AvailabilityToggleResponse = WorkerAvailabilityResponse')
    expect(apiTypes).toContain('export type WorkerJobListResponse')
    expect(apiTypes).toContain('export type EarningsResponse')
    expect(apiTypes).toContain('export type WorkerScopeChangeResponse')
    expect(apiTypes).toContain('export type CustomerScopeDecisionResponse')
    expect(apiTypes).toContain('ScopeChangeStatus')
    expect(apiTypes).toContain('from_date: string | null')
    expect(apiTypes).toContain('to_date: string | null')
    expect(apiTypes).toContain('export type DeclineBroadcastResponse')
  })
})

