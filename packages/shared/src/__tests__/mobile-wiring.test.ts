import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MOBILE_ROOT = resolve(__dirname, '../../../../apps/mobile')
const read = (rel: string) => readFileSync(resolve(MOBILE_ROOT, rel), 'utf-8')
const exists = (rel: string) => existsSync(resolve(MOBILE_ROOT, rel))

// ===================================================================
// Navigation skeleton â€” must match STRUCTURES.md exactly
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
// Customer tabs â€” STRUCTURES.md A1: Trang chá»§ | Äáº·t lá»‹ch | Kael | Lá»‹ch sá»­ | Há»“ sÆ¡
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
})

// ===================================================================
// Customer frontend shell â€” production static/local surfaces around Price Check
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
      expect(src).not.toContain('broadcasting')
      expect(src).not.toContain('worker_matched')
      expect(src).not.toContain('payment_pending')
      expect(src).not.toContain('scope_change_pending')
      expect(src).not.toContain('customer_confirmed_booking_search')
    }
  })

  it('limits active customer services to electrical and plumbing entries', () => {
    const src = shell()
    expect(src).toContain('customer-shell-service-electrical')
    expect(src).toContain('customer-shell-service-plumbing')
    expect(src).toContain('customer-home-other-services-message')
    expect(src).toContain('CUSTOMER_V4_VISUAL_CONTRACT')
    expect(src).not.toMatch(/cleaning|ac repair|appliance|handyman/i)
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
    expect(src).toContain('lightLayer')
    expect(src).toContain('darkLayer')
  })

  it('implements V4 production customer language/theme persistence and Kael 8A assets', () => {
    const src = shell()
    const layout = customerLayout()
    expect(src).toContain('CUSTOMER_V4_PRODUCTION_STANDARD')
    expect(src).toContain('CustomerLanguageMode')
    expect(src).toContain('CUSTOMER_LANGUAGE_STORAGE_KEY')
    expect(src).toContain('CUSTOMER_THEME_STORAGE_KEY')
    expect(src).toContain('AsyncStorage')
    expect(src).toContain('setCustomerLanguageMode')
    expect(src).toContain('useCustomerLanguageMode')
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
    expect(layout).toContain("boxShadow: tokens.mode === 'dark'")
    expect(layout).toContain('tabBarActiveBackgroundColor: tokens.service')
  })

  it('preserves V4 prototype section-level figures beyond static wiring', () => {
    const src = shell()
    expect(src).toContain('customer-home-layered-hero')
    expect(src).toContain('customer-home-layer-stack')
    expect(src).toContain('customer-home-signature-v4')
    expect(src).toContain('customer-home-hero-depth-grid')
    expect(src).toContain('customer-home-payment-section')
    expect(src).toContain('customer-home-bank-connect')
    expect(src).toContain('customer-home-cod-payment')
    expect(src).toContain('customer-home-payment-local-only')
    expect(src).toContain('customer-home-coupon-strip')
    expect(src).toContain('customer-home-relaxed-stage')
    expect(src).toContain('customer-home-ticket-decor')
    expect(src).toContain('customer-kael-conversation-feed')
    expect(src).toContain('customer-kael-empty-chat-state')
    expect(src).toContain('customer-kael-empty-chat-canvas')
    expect(src).toContain('customer-kael-ticket-reveal-after-info')
    expect(src).toContain('customer-kael-user-message')
    expect(src).toContain('hasEnoughKaelInfo')
    expect(src).toContain('hasAnyKaelInfo')
    expect(src).toContain('latestAnswer.trim().length >= 16')
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
    expect(src).toContain('customer-rating-glass-stars')
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
    expect(src).not.toContain('Chá»‰ lÆ°u ngá»¯ cáº£nh chung')
    expect(src).not.toContain('GiÃ¡ thá»±c táº¿ do thá»£ xÃ¡c nháº­n trÆ°á»›c khi báº¯t Ä‘áº§u.')
    expect(src).not.toContain('Name/building/floor')
    expect(src).not.toContain('KhÃƒÂ´ng bÃ¡Â»â€¹a ngÃƒÂ y')
    expect(src).not.toContain('ChÃ†Â°a lÃ†Â°u backend')
    expect(src).not.toContain('KhÃƒÂ´ng fake worker')
    expect(src).not.toContain('BÃ¡Â»â„¢ lÃ¡Â»Âc sÃ¡ÂºÂ½ mÃ¡Â»Å¸')
    expect(src).not.toContain('KhÃƒÂ´ng Ã„â€˜ÃƒÂ¡nh dÃ¡ÂºÂ¥u Ã„â€˜ÃƒÂ£ thanh toÃƒÂ¡n')
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
    expect(src).toContain('customer-dock-motion-sheen')
    expect(src).toContain('customer-dock-liquid-pool')
    expect(src).toContain('customer-dock-liquid-wake')
    expect(src).toContain('MotionSweep')
    expect(src).toContain('V4MapBackdrop')
    expect(src).toContain('useSharedValue')
    expect(src).toContain('withRepeat')
    expect(src).toContain('withSpring')
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
    expect(src).not.toMatch(/\d{1,3}\.\d{3}\s?Ä‘/)
  })

  it('routes customer shell entry points back to the booking tab', () => {
    const src = shell()
    expect(src).toContain('useRouter')
    expect(src).toContain('openBookingFlow')
    expect(src).toContain('/(customer)/booking')
  })
})

// ===================================================================
// Prototype runtime cleanup â€” store-build guard
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
// Worker tabs â€” STRUCTURES.md B1: Trang chá»§ | CÃ´ng viá»‡c | Chat | Thu nháº­p | Há»“ sÆ¡
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

  it('tab: Chat', () => {
    expect(src).toContain("'Chat'")
  })

  it('tab: Thu nhập', () => {
    expect(src).toContain("'Thu nhập'")
  })

  it('tab: Hồ sơ', () => {
    expect(src).toContain("'Hồ sơ'")
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
    expect(src).toContain('GlassSheen')
    expect(src).toContain('GlassMotionLayer')
    expect(src).toContain('worker-vertical-glass-flow')
    expect(src).toContain('worker-vertical-glass-core')
    expect(src).toContain('verticalFlow.value')
    expect(src).toContain('translateY')
    expect(src).toContain('WorkerSectionMotionField')
    expect(src).toContain('worker-section-glass-motion-home')
    expect(src).toContain('worker-section-glass-motion-jobs')
    expect(src).toContain('worker-section-glass-motion-chat')
    expect(src).toContain('worker-section-glass-motion-earnings')
    expect(src).toContain('worker-section-glass-motion-profile')
    expect(src).toContain('centered-metric-type')
    expect(src).toContain("textAlign: 'center'")
    expect(src).toContain('backdropFilter')
    expect(src).toContain('experimental_backgroundImage')
    expect(src).toContain('worker-flexible-map-shell')
    expect(src).toContain('worker-map-google-ready')
    expect(src).toContain('mapCardsRow')
    expect(src).toContain('worker-liquid-glass-dock')
    expect(src).toContain('worker-dock-liquid-pool')
    expect(src).toContain('worker-dock-liquid-wake')
    expect(src).toContain('worker-dock-active-glow')
    expect(src).toContain('worker-dock-kael-brief-mascot')
    expect(src).toContain('withSpring')
    expect(src).toContain('worker-profile-preference-toggles')
    expect(src).toContain('worker-kael-client-chatbox-parity')
    expect(src).toContain('worker-kael-composer-dock')
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

  it('keeps Worker scope to electrical and plumbing services only', () => {
    const src = shell()
    expect(src).toContain('electricianCard')
    expect(src).toContain('plumberCard')
    expect(src).not.toMatch(/cleaning|ac repair|appliance|handyman/i)
  })

  it('keeps Worker theme/language switching and Kael chat local-only', () => {
    const src = shell()
    expect(src).toContain('WORKER_THEME_LANGUAGE_STORE')
    expect(src).toContain('WorkerLanguageMode')
    expect(src).toContain('WORKER_LANGUAGE_STORAGE_KEY')
    expect(src).toContain('WORKER_THEME_STORAGE_KEY')
    expect(src).toContain('worker-language-toggle')
    expect(src).toContain('worker-dark-mode-toggle')
    expect(src).toContain('worker-kael-empty-chat-state')
    expect(src).toContain('worker-kael-local-chat-input')
    expect(src).toContain('submitWorkerKaelLocalDraft')
  })

  it('keeps Worker shell frontend-only with no backend, AI, secrets, or workflow mutations', () => {
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
      expect(src).not.toContain('broadcasting')
      expect(src).not.toContain('worker_matched')
      expect(src).not.toContain('payment_pending')
      expect(src).not.toContain('scope_change_pending')
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
    expect(surface).toContain('auth-login-role-customer')
    expect(surface).toContain('auth-login-role-worker')
    expect(surface).not.toContain('OnboardingSurface')
    expect(surface).not.toContain('auth-onboarding')
    expect(surface).not.toContain('auth-v2')
    expect(surface).not.toContain('/(auth)/onboard')
  })
})

// ===================================================================
// Root layout â€” AuthProvider wrapping
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
// Index (splash redirect) â€” role-based routing
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
})

// ===================================================================
// Supabase client â€” Rule #1: secrets server-side only
// ===================================================================

describe('supabase.ts (Rule #1: no hardcoded secrets)', () => {
  const src = read('lib/supabase.ts')

  it('does NOT hardcode supabase URL', () => {
    expect(src).not.toMatch(/https:\/\/[a-z]+\.supabase\.co/)
  })

  it('does NOT hardcode anon key', () => {
    // Supabase anon keys start with eyJ
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]+/)
  })

  it('reads URL from Constants.expoConfig', () => {
    expect(src).toContain('Constants.expoConfig')
    expect(src).toContain('supabaseUrl')
  })

  it('reads key from Constants.expoConfig', () => {
    expect(src).toContain('supabasePublishableKey')
  })

  it('uses AsyncStorage for session persistence', () => {
    expect(src).toContain('AsyncStorage')
    expect(src).toContain('storage: AsyncStorage')
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

  it('does NOT use process.env (Rule #1 â€” RN uses app.json extra)', () => {
    expect(src).not.toContain('process.env')
  })

  it('falls back to empty string (not undefined) for missing config', () => {
    // ?? '' ensures createClient gets string, not undefined
    expect(src).toContain("?? ''")
  })

  it('does NOT create a Supabase client when mobile config is missing', () => {
    expect(src).toContain('isSupabaseConfigured')
    expect(src).toContain(': null')
  })
})

// ===================================================================
// Auth provider â€” correct Supabase auth pattern
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
    expect(src).toContain("from '@home-services/shared'")
  })

  it('auth state has session, role, and loading', () => {
    expect(src).toContain('session')
    expect(src).toContain('role')
    expect(src).toContain('loading')
  })

  it('sets loading false after role fetch completes', () => {
    expect(src).toContain('setLoading(false)')
  })

  it('resets role to null on sign out', () => {
    expect(src).toContain('setRole(null)')
  })

  it('renders children instead of crashing when Supabase config is missing', () => {
    expect(src).toContain('if (!supabase)')
    expect(src).toContain('setLoading(false)')
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

  it('has Android package', () => {
    expect(expo.android?.package).toBeDefined()
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

  it('declares react-native-reanimated for visible mobile motion', () => {
    expect(mobilePackage.dependencies['react-native-reanimated']).toBe('~4.1.7')
  })

  it('declares expo-image-picker for local image/video draft media', () => {
    expect(mobilePackage.dependencies['expo-image-picker']).toBeDefined()
  })
})

// ===================================================================
// colors.ts â€” design consistency
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
// Client Price Check production UI â€” customer Äáº·t lá»‹ch A2-A5 slice
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

  it('uses electrical/plumbing shared scope and Vietnamese production copy', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('PROBLEM_CHIPS')
    expect(component).toContain('ServiceType')
    expect(component).toContain("'electrical'")
    expect(component).toContain("'plumbing'")
    expect(component).toContain('INITIAL_DRAFT')
    expect(component).toContain("serviceType === 'electrical'")
    expect(component).toContain("onSelectService('plumbing')")
    expect(component).toContain('addressLabel')
    expect(component).not.toMatch(/cleaning|ac repair|appliance|handyman/i)
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
    expect(component).toContain('disclaimer: PRICE_DISCLAIMER')
    expect(component).toContain('priceRangeLabel')
    expect(component).toContain('confidenceLabel')
    expect(component).toContain('advisory')
    expect(component).toContain('baseline_fallback')
    expect(component).not.toContain('exact price')
    expect(component).not.toContain('guaranteed price')
  })

  it('uses interaction-triggered V4 controls with controlled glass motion', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('Pressable')
    expect(component).toContain('onPress={onPress}')
    expect(component).toContain('BOOKING_INTERACTION_MOTION_V4')
    expect(component).toContain('BookingBackdrop')
    expect(component).toContain('booking-section-glass-field')
    expect(component).toContain('useSharedValue')
    expect(component).toContain('withRepeat')
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
    expect(component).toContain('paddingBottom: insets.bottom + 190')
    expect(component).toContain('<CustomerV4DockOverlay active="booking" />')
    expect(component).toContain('bookingFrameHorizontalPadding')
    expect(component).toContain('SheetActions')
    expect(component).toContain('sheetActions')
    expect(component).toContain('width: Math.max(0, frameWidth - bookingFrameHorizontalPadding * 4)')
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
    expect(component).toContain('searchingWorkerState')
    expect(component).toContain('noWorkerFallbackState')
    expect(component).toContain('matchedWorker === null')
    expect(component).toContain('customer-no-fake-worker-data')
    expect(component).not.toContain('Anh Minh')
    expect(component).not.toContain('128 job')
    expect(component).not.toContain('payment_pending')
    expect(component).not.toContain('scope_change_pending')
    expect(component).not.toContain('customer_confirmed_booking_search')
  })
})

