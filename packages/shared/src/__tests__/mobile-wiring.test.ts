import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { extname, resolve } from 'path'

const MOBILE_ROOT = resolve(__dirname, '../../../../apps/mobile')
const ROOT = resolve(__dirname, '../../../../')
const readSource = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
const implementationSourceByWrapper: Record<string, string> = {
  'components/customer/agentic-center-surface.tsx': 'components/customer/v21/surfaces.tsx',
  'components/customer/customer-surfaces.tsx': 'components/customer/v21/surfaces.tsx',
  'components/customer/kael-chat/kael-chat-surface.tsx': 'components/customer/v21/surfaces.tsx',
  'components/worker/worker-surfaces.tsx': 'components/worker/worker-v5-flow.tsx',
}
const read = (rel: string) => {
  const source = readSource(resolve(MOBILE_ROOT, rel))
  const implementationRel = implementationSourceByWrapper[rel]
  if (!implementationRel) return source

  const implementationPath = resolve(MOBILE_ROOT, implementationRel)
  if (!existsSync(implementationPath)) return source

  return `${source}\n\n/* resolved implementation: ${implementationRel} */\n${readSource(implementationPath)}`
}
const readRoot = (rel: string) => readSource(resolve(ROOT, rel))
const exists = (rel: string) => existsSync(resolve(MOBILE_ROOT, rel))
const sha256 = (rel: string) => createHash('sha256').update(readFileSync(resolve(MOBILE_ROOT, rel))).digest('hex')
const countOccurrences = (source: string, value: string) => source.split(value).length - 1
const ignoredMobileFileDirs = new Set(['.expo', '.turbo', 'coverage', 'dist', 'node_modules'])
const mobileTextExtensions = new Set(['.js', '.jsx', '.json', '.ts', '.tsx'])
const mobileFontBinaryPattern = /\.(dfont|otf|ttf|woff2?)$/i
const collectMobileFiles = (rel = ''): string[] => {
  const start = resolve(MOBILE_ROOT, rel)
  if (!existsSync(start)) return []

  return readdirSync(start, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredMobileFileDirs.has(entry.name)) return []
    const fullPath = resolve(start, entry.name)
    if (entry.isDirectory()) return collectMobileFiles(fullPath.replace(MOBILE_ROOT, '').replace(/^[/\\]/, ''))
    return [fullPath]
  })
}

// ===================================================================
// Navigation skeleton - must match STRUCTURES.md exactly
// ===================================================================

describe('screen files existence (STRUCTURES.md mapping)', () => {
  const authScreens = ['login.tsx', 'verify-otp.tsx']
  const customerScreens = ['home.tsx', 'booking.tsx', 'kael.tsx', 'kael-chat.tsx', 'history.tsx', 'profile.tsx']
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
    expect(exists('app/(admin)/_layout.tsx')).toBe(true)
  })

  it('admin dashboard exists for Kael learning review', () => {
    expect(exists('app/(admin)/dashboard.tsx')).toBe(true)
    const src = read('app/(admin)/dashboard.tsx')
    expect(src).toContain('adminLearningService.listCandidates')
    expect(src).toContain('adminLearningService.approveCandidate')
    expect(src).toContain('adminLearningService.rejectCandidate')
    expect(src).not.toContain('fetch(')
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
    'app/(customer)/kael-chat.tsx',
    'app/(customer)/history.tsx',
    'app/(customer)/profile.tsx',
    'app/(worker)/_layout.tsx',
    'app/(worker)/home.tsx',
    'app/(worker)/jobs.tsx',
    'app/(worker)/chat.tsx',
    'app/(worker)/earnings.tsx',
    'app/(worker)/profile.tsx',
    'app/(admin)/_layout.tsx',
    'app/(admin)/dashboard.tsx',
  ]

  it.each(allScreens)('%s has default export', (file) => {
    const src = read(file)
    expect(src).toMatch(/export\s+default\s+function/)
  })
})

// ===================================================================
// Customer tabs - STRUCTURES.md A1: Trang ch? | Yêu c?u | Kael | Ho?t d?ng | H? so
// ===================================================================

describe('customer tab labels (STRUCTURES.md A1)', () => {
  const src = read('app/(customer)/_layout.tsx')

  it('keeps exactly five visible dock tabs and one hidden Kael chat stack route', () => {
    const matches = src.match(/Tabs\.Screen/g) ?? []
    expect(matches.length).toBe(6)
    const tabIconMatches = src.match(/tabBarIcon:/g) ?? []
    expect(tabIconMatches.length).toBe(0)
    expect(src).toContain('tabBar={() => null}')
    expect(src).toContain('name="kael-chat"')
    expect(src).toContain('href: null')
  })

  it('tab route: home', () => {
    expect(src).toContain('name="home"')
  })

  it('tab route: booking keeps the V4 service-entry role', () => {
    expect(src).toContain('name="booking"')
    expect(src).not.toContain('tabBarLabel')
  })

  it('tab route: kael', () => {
    expect(src).toContain('name="kael"')
  })

  it('tab route: history uses V4 activity role', () => {
    expect(src).toContain('name="history"')
    expect(src).not.toContain('tabBarLabel')
  })

  it('tab route: profile', () => {
    expect(src).toContain('name="profile"')
  })

  it('uses Tabs from expo-router', () => {
    expect(src).toMatch(/import\s+\{.*Tabs.*\}\s+from\s+['"]expo-router['"]/)
  })

  it('keeps route titles localized while the native tab bar stays removed', () => {
    expect(src).toContain('CUSTOMER_TAB_COPY')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain("home: 'Trang chủ'")
    expect(src).toContain("booking: 'Dịch vụ'")
    expect(src).toContain("history: 'Hoạt động'")
    expect(src).toContain("booking: 'Services'")
    expect(src).toContain("history: 'Activity'")
    expect(src).toContain('activeCustomerDockFromPath')
    expect(src).toContain("const showDock = !pathname.includes('/kael')")
    expect(src).toContain('<CustomerV21DockOverlay active={activeDock} />')
    expect(src).not.toContain('CustomerTabIcon')
    expect(src).not.toContain('react-native-svg')
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
  const customerTheme = () => read('components/customer/customer-theme.ts')
  const customerRoutes = [
    ['home', 'CustomerHomeSurface'],
    ['booking', 'CustomerBookingEntrySurface'],
    ['history', 'CustomerHistorySurface'],
    ['profile', 'CustomerProfileSurface'],
  ] as const

  it('defines the public customer shell surface exports', () => {
    const src = shell()
    expect(exists(shellPath)).toBe(true)
    expect(src).toContain('export function CustomerHomeSurface')
    expect(src).toContain('export function CustomerBookingEntrySurface')
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

  it('wires booking to the production intake handoff wizard while Kael chat owns the full-screen chat route', () => {
    const bookingRoute = read('app/(customer)/booking.tsx')
    const src = shell()
    const bookingSurface = src.slice(src.indexOf('export function CustomerBookingEntrySurface'), src.indexOf('export function CustomerHistorySurface'))
    const wizard = read('components/customer/booking-wizard.tsx')
    const kaelChatRoute = read('app/(customer)/kael-chat.tsx')
    expect(exists('components/client-price-check/client-price-check-flow.tsx')).toBe(false)
    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
    expect(src).toContain('export function CustomerBookingEntrySurface')
    expect(src).toContain('buildBookingDraftMessage({')
    expect(src).toContain('setPendingKaelChatDraft({')
    expect(src).toContain("source: 'booking'")
    expect(src).toContain('clientRequestId: generateClientRequestId()')
    expect(src).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(src).toContain('testID="customer-v21-services"')
    expect(src).toContain('testID="customer-v21-booking-address"')
    expect(src).toContain('testID="customer-v21-booking-description"')
    expect(src).toContain('testID="customer-v21-booking-schedule-panel"')
    expect(src).toContain('testID="customer-v21-booking-submit"')
    expect(src).toContain('testID="customer-v21-services-hero"')
    expect(src).toContain('testID="customer-v21-selected-service"')
    expect(src).toContain('SERVICE_TYPES.map((service) =>')
    expect(src).toContain('bookingTimeSlots.map((slot, index) =>')
    expect(src).toContain('const problemOptions = selectedService ? [...PROBLEM_CHIPS[selectedService]] : []')
    expect(src).toContain('problemOptions.map((problem) =>')
    expect(src).not.toContain('bookingWizardSessionActive')
    expect(src).not.toContain('const bookingPillLabel = entryCopy.step')
    expect(src).not.toContain('{bookingPillLabel}')
    expect(bookingSurface).not.toContain('actions.createRemoteJobFromDraft')
    expect(bookingSurface).not.toContain('actions.confirmRemoteSearch')
    expect(src).not.toContain('ClientPriceCheckFlow')
    expect(src).not.toContain('production-price-check-flow')
    expect(wizard).toContain('export function BookingWizard')
    expect(wizard).toContain('setPendingKaelChatDraft')
    expect(wizard).toContain('onOpenKael(state.serviceType)')
    expect(wizard).not.toContain('actions.createRemoteJobFromDraft')
    expect(wizard).not.toContain('actions.confirmRemoteSearch')
    expect(kaelChatRoute).toContain('KaelChatSurface')
    expect(kaelChatRoute).toContain('@/components/customer/kael-chat/kael-chat-surface')
  })

  it('wires (customer)/kael to the Kael chat surface while Agentic Center stays in Profile', () => {
    const src = read('app/(customer)/kael.tsx')
    const agenticCenter = read('components/customer/agentic-center-surface.tsx')
    expect(src).toContain('KaelChatSurface')
    expect(src).toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(src).not.toContain('CustomerAgenticCenterSurface')
    expect(src).not.toContain('@/components/customer/agentic-center-surface')
    expect(src).not.toContain('<CustomerKaelSurface />')
    expect(agenticCenter).toContain("from '@/components/ui/kael-primitives'")
    expect(agenticCenter).toContain('KaelButton')
    expect(agenticCenter).toContain('KaelChip')
    expect(agenticCenter).toContain('KaelTextField')
    expect(agenticCenter).toContain('export function CustomerAgenticCenterSurface')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-center"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-command-center"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-approval-screen"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-memory-screen"')
    expect(agenticCenter).toContain('<KaelButton')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-open-case-chat"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-command-approval"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-approve-scope"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-reject-scope"')
    expect(agenticCenter).toContain('testID="customer-v21-agentic-memory-save"')
    expect(agenticCenter).toContain('router.replace(customerCaseWorkRouteForDeal(deal) as never)')
    expect(agenticCenter).not.toContain('callAI')
    expect(agenticCenter).not.toContain('createClient')
    expect(agenticCenter).not.toContain('supabase.')
  })

  it('keeps customer shell frontend-only with no backend, AI, or workflow mutations', () => {
    const files = [
      shellPath,
      'app/(customer)/home.tsx',
      'app/(customer)/booking.tsx',
      'app/(customer)/kael.tsx',
      'app/(customer)/history.tsx',
      'app/(customer)/profile.tsx',
    ]

    for (const file of files) {
      const src = exists(file) ? read(file) : ''
      expect(src).not.toContain('fetch(')
      expect(src).not.toContain('createClient')
      expect(src).not.toContain('supabase.')
      expect(src).not.toMatch(/\.(insert|update|upsert)\(/)
      expect(src).not.toContain('callAI')
      expect(src).not.toContain('ANTHROPIC_API_KEY')
      expect(src).not.toContain('PERPLEXITY_API_KEY')
      expect(src).not.toContain('DEEPSEEK_API_KEY')
      expect(src).not.toContain('customer_confirmed_booking_search')
    }

    expect(shell()).toContain('useFrontendWorkflow')
  })

  it('limits active customer services to electrical, plumbing, and cleaning entries', () => {
    const src = shell()
    const assets = read('components/customer/v21/assets.ts')
    expect(src).toContain("SERVICE_TYPES.map((service) =>")
    expect(src).toContain('testID={`customer-v21-service-${service}`}')
    expect(src).toContain('const problemOptions = selectedService ? [...PROBLEM_CHIPS[selectedService]] : []')
    expect(src).toContain('customerV21ServiceCopy[language][service].label')
    expect(src).toContain('customerV21ServiceAssets[service]')
    expect(assets).toContain('export const customerV21ServiceAssets: Record<ServiceType, ImageSourcePropType>')
    expect(assets).toContain("electrical: require('@/assets/client-image-icons/client-service-electrical.png')")
    expect(assets).toContain("plumbing: require('@/assets/client-image-icons/client-service-plumbing.png')")
    expect(assets).toContain("cleaning: require('@/assets/client-image-icons/client-service-cleaning.png')")
    expect(src).not.toMatch(/ac repair|appliance|handyman/i)
  })

  it('implements the V21 customer production shell contract without stale V4 markers', () => {
    const src = shell()
    const layout = customerLayout()
    const theme = customerTheme()
    expect(theme).toContain('CUSTOMER_THEME_TOKENS')
    expect(theme).toContain('useSyncExternalStore')
    expect(theme).toContain('setCustomerThemeMode')
    expect(theme).toContain('subscribeCustomerThemeMode')
    expect(theme).toContain('getCustomerThemeTokens')
    expect(theme).toContain('getReducedTransparencyCustomerTokens')
    expect(src).toContain('function V21Screen')
    expect(src).toContain('testID="customer-v21-scroll"')
    expect(src).toContain('export function CustomerHomeSurface')
    expect(src).toContain('export function CustomerBookingEntrySurface')
    expect(src).toContain('export function CustomerKaelSurface')
    expect(src).toContain('export function CustomerHistorySurface')
    expect(src).toContain('export function CustomerProfileSurface')
    expect(src).toContain('export function CustomerV21DockOverlay')
    expect(src).toContain('export const CustomerV4DockOverlay = CustomerV21DockOverlay')
    expect(src).toContain('CUSTOMER_LIQUID_NAV_MAX_WIDTH')
    expect(src).toContain('CUSTOMER_LIQUID_NAV_DOCK_HEIGHT')
    expect(src).toContain('useGlassAccessibility')
    expect(src).toContain('glass.reduceTransparency ? getReducedTransparencyCustomerTokens')
    expect(layout).toContain('tabBar={() => null}')
    expect(layout).toContain('<CustomerV21DockOverlay active={activeDock} />')
    expect(layout).not.toContain('tabBarIcon')
    expect(src).not.toContain('CUSTOMER_V4_PRODUCTION_SOURCE')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
  })

  it('implements V21 customer language, theme persistence, and Kael route separation', () => {
    const src = shell()
    const layout = customerLayout()
    const theme = customerTheme()
    const assets = read('components/customer/v21/assets.ts')
    expect(src).toContain('useAppLanguage')
    expect(theme).toContain('CUSTOMER_THEME_STORAGE_KEY')
    expect(theme).toContain('AsyncStorage')
    expect(src).toContain('customerV21ServiceCopy')
    expect(src).toContain('customerV21StatusCopy')
    expect(src).toContain('customerV21ScreenTitles[language]')
    expect(src).toContain('CustomerAgenticCenterSurface')
    expect(src).toContain('return <CustomerAgenticCenterSurface screenId={directAgenticScreen} />')
    expect(src).toContain('export function KaelChatSurface')
    expect(src).toContain("surface: 'customer_normal'")
    expect(src).toContain("surface: 'customer_case'")
    expect(src).toContain('testID="customer-v21-agentic-center"')
    expect(src).toContain('testID="customer-v21-kael-chat"')
    expect(src).toContain('testID="customer-v21-kael-accessory"')
    expect(assets).toContain("kael: require('@/assets/kael-orb-icon.png')")
    expect(assets).toContain("kaelHead: require('@/assets/kael-emotions/kael-emotion-focused.png')")
    expect(assets).toContain("kaelFull: require('@/assets/kael-states/kael-state-welcome.png')")
    expect(assets).toContain("kaelNavigation: require('@/assets/navigation/customer/kael.png')")
    expect(layout).toContain('tabBar={() => null}')
    expect(layout).toContain("const showDock = !pathname.includes('/kael')")
    expect(layout).not.toContain('CustomerTabIcon')
  })

  it('keeps design-lab artifacts out of production customer source references', () => {
    expect(exists('../../.tmp/design-lab/customer-app-v1')).toBe(false)
    expect(exists('../../.tmp/design-lab/customer-app-v2')).toBe(false)
    expect(shell()).not.toContain('.tmp/design-lab')
  })

  it('anchors reusable production typography to the shared system scale', () => {
    const customer = shell()
    const worker = read('components/worker/worker-surfaces.tsx')
    const auth = read('components/auth/auth-surfaces.tsx')
    const entryAccess = read('components/auth/entry-access/EntryBrandAccessFlow.tsx')
    const entryTheme = read('components/auth/entry-access/theme.ts')
    const primitives = read('components/ui/kael-primitives.tsx')
    const kaelChatStyles = read('components/customer/kael-chat/styles.ts')
    expect(customer).toContain('testID="customer-v21-scroll"')
    expect(customer).toContain('numberOfLines')
    expect(customer).not.toContain("'Kael Sans'")
    expect(customer).not.toContain('expo-font')
    expect(worker).toContain("import { color, component, glass, radius, shadow, typography } from '@/design/theme'")
    expect(worker).toContain('fontFamily: typography.fontFamily')
    expect(auth).toContain('EntryBrandAccessFlow')
    expect(entryTheme).toContain('typography')
    expect(entryAccess).toContain('styles.h1')
    expect(entryAccess).toContain('styles.formTitle')
    expect(auth).not.toContain("fontWeight: '800'")
    expect(auth).not.toContain("fontWeight: '900'")
    expect(entryAccess).not.toContain("fontWeight: '800'")
    expect(entryAccess).not.toContain("fontWeight: '900'")
    expect(primitives).toContain('fontWeight: typography.label.fontWeight')
    expect(primitives).toContain('fontWeight: typography.body.fontWeight')
    expect(primitives).toContain('fontWeight: typography.caption.fontWeight')
    expect(primitives).toContain('fontWeight: typography.h3.fontWeight')
    expect(primitives).not.toContain("fontWeight: '800'")
    expect(primitives).not.toContain("fontWeight: '900'")
    expect(kaelChatStyles).toContain("import { typography } from '@/design/theme'")
    expect(kaelChatStyles).toContain('fontWeight: typography.label.fontWeight')
    expect(kaelChatStyles).not.toContain("fontWeight: '800'")
    expect(kaelChatStyles).not.toContain("fontWeight: '900'")
  })

  it('keeps mobile typography on system APIs without bundled font paths', () => {
    const theme = read('design/theme.ts')
    const tokens = read('design/tokens.json')
    const layout = read('app/_layout.tsx')
    const primitives = read('components/ui/kael-primitives.tsx')
    const mobileFiles = collectMobileFiles()
    const mobileTextSource = mobileFiles
      .filter((file) => mobileTextExtensions.has(extname(file)))
      .map(readSource)
      .join('\n')

    expect(theme).toContain("const systemFontFamily: TextStyle['fontFamily'] = Platform.OS === 'ios' ? undefined : 'System'")
    expect(theme).toContain('largeTitle')
    expect(theme).toContain('headline')
    expect(theme).toContain('tabularBody')
    expect(theme).toContain("h1: appleSystemTypography.largeTitle")
    expect(theme).not.toContain("'Kael Sans'")
    expect(tokens).toContain('"family": "system"')
    expect(tokens).toContain('"resolvedOnIOS": "SF Pro"')
    expect(tokens).toContain('"embedFontFiles": false')
    expect(tokens).not.toContain('Kael Sans')
    expect(layout).toContain("font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
    expect(layout).not.toContain('@font-face')
    expect(layout).not.toContain('Kael Sans')
    expect(primitives).toContain("'largeTitle'")
    expect(primitives).toContain("'tabularBody'")
    expect(mobileFiles.filter((file) => mobileFontBinaryPattern.test(file))).toEqual([])
    expect(mobileTextSource).not.toContain('Kael Sans')
    expect(mobileTextSource).not.toContain('@font-face')
    expect(mobileTextSource).not.toMatch(/from ['"]expo-font['"]|expo-font|useFonts|Font\.loadAsync/)
    expect(mobileTextSource).not.toMatch(/allowFontScaling\s*=\s*\{false\}|allowFontScaling\s*:\s*false/)
  })

  it('keeps customer dark mode as a persisted semantic layer switch', () => {
    const src = shell()
    const layout = customerLayout()
    const theme = customerTheme()
    expect(theme).toContain('const lightLayer: CustomerThemeTokens = customerTheme.lightLayer')
    expect(theme).toContain('const darkLayer: CustomerThemeTokens = customerTheme.darkLayer')
    expect(theme).toContain('const reduced = tokens.mode === \'dark\' ? customerTheme.reducedTransparency.dark : customerTheme.reducedTransparency.light')
    expect(src).toContain('useCustomerThemeMode')
    expect(src).toContain('getCustomerThemeTokens')
    expect(src).toContain('getReducedTransparencyCustomerTokens')
    expect(theme).toContain('setCustomerThemeMode')
    expect(theme).toContain('AsyncStorage.setItem(CUSTOMER_THEME_STORAGE_KEY')
    expect(layout).toContain('tabBar={() => null}')
    expect(layout).toContain('CustomerV21DockOverlay')
    expect(layout).not.toContain("display: 'none'")
    expect(layout).not.toContain('tabBarActiveBackgroundColor')
  })

  it('keeps V21 customer sections production-ready without legacy prototype wiring', () => {
    const src = shell()
    expect(src).toContain('testID="customer-v21-home"')
    expect(src).toContain('testID="customer-v21-home-hero"')
    expect(src).toContain('testID="customer-v21-home-empty"')
    expect(src).toContain('testID="customer-v21-services"')
    expect(src).toContain('testID="customer-v21-services-hero"')
    expect(src).toContain('testID="customer-v21-booking-address"')
    expect(src).toContain('testID="customer-v21-booking-description"')
    expect(src).toContain('testID="customer-v21-booking-submit"')
    expect(src).toContain('testID="customer-v21-activity"')
    expect(src).toContain('testID="customer-v21-case-work-inactive"')
    expect(src).toContain('testID="customer-v21-chat-tab-normal"')
    expect(src).toContain('testID="customer-v21-chat-tab-case-work"')
    expect(src).toContain('testID="customer-v21-case-work-inactive"')
    expect(src).toContain('testID="customer-v21-profile"')
    expect(src).toContain('testID="customer-v21-profile-hero"')
    expect(src).toContain('testID="customer-v21-profile-ranking"')
    expect(src).toContain('testID="customer-v21-profile-money"')
    expect(src).toContain('testID="customer-v21-profile-memory"')
    expect(src).toContain('testID="customer-v21-payment-review-kael-card"')
    expect(src).toContain('testID="customer-v21-payment-protected-kael-card"')
    expect(src).toContain('setPendingKaelChatDraft')
    expect(src).toContain('readPendingKaelChatDraft')
    expect(src).toContain("surface: 'customer_normal'")
    expect(src).toContain("surface: 'customer_case'")
    expect(src).not.toContain('ClientPriceCheckFlow')
    expect(src).not.toContain('customer-kael-local-chat-input')
    expect(src).not.toContain('submitKaelLocalDraft')
    expect(src).not.toContain('Sunrise Riverside')
  })

  it('keeps the Kael dock pointed at chat while Agentic Center stays behind Profile screens', () => {
    const src = shell()
    const kaelRoute = read('app/(customer)/kael.tsx')
    const kaelChatRoute = read('app/(customer)/kael-chat.tsx')
    const v21 = read('components/customer/v21/surfaces.tsx')
    const stack = read('components/customer/kael-chat/kael-chat-surface.tsx')
    const stackStyles = read('components/customer/kael-chat/styles.ts')
    const pendingIntake = read('components/customer/kael-chat/pending-intake.ts')
    const services = read('lib/services.ts')
    expect(kaelRoute).toContain('KaelChatSurface')
    expect(kaelRoute).not.toContain('CustomerAgenticCenterSurface')
    expect(kaelChatRoute).toContain('KaelChatSurface')
    expect(src).toContain('export function CustomerKaelSurface')
    expect(src).toContain('return <CustomerAgenticCenterSurface screenId={directAgenticScreen} />')
    expect(v21).toContain('export function KaelChatSurface')
    expect(v21).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(v21).not.toContain("router.replace('/(customer)/kael' as never)")
    expect(v21).toContain('testID="customer-v21-kael-accessory"')
    expect(v21).toContain('testID="customer-v21-agentic-center"')
    expect(v21).toContain('testID="customer-v21-kael-chat"')
    expect(src).not.toContain('KAEL_CHATBOX_SCREEN_CONTRACT')
    expect(src).not.toContain('customer-kael-companion')
    expect(src).not.toContain('customer-kael-chatbox')
    expect(src).not.toContain('customer-kael-ticket-reveal-after-info')
    expect(src).not.toContain('customer-kael-repair-ticket')
    expect(src).not.toContain('customer-rating-glass-stars')
    expect(src).not.toContain('customer-kael-worker-placeholder')
    expect(src).not.toContain('submitKaelLocalDraft')
    expect(src).not.toContain('customer-kael-local-chat-input')
    expect(src).not.toContain('inferLocalDealDraftFromKael(trimmed)')
    expect(src).not.toContain('TransactionIntentCard')
    expect(src).not.toContain('Draft Price Check')
    expect(src).not.toContain('customer-kael-conversation-phone')
    expect(src).not.toContain('kaelPhone')
    expect(src).not.toContain('callAI')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
    expect(stack).toContain('useFrontendWorkflow')
    expect(stack).toContain('actions.hydrateRemoteJobById(routeJobId)')
    expect(exists('components/customer/kael-chat/pending-intake.ts')).toBe(true)
    expect(stack).toContain('readPendingKaelChatDraft')
    expect(pendingIntake).toContain('setPendingKaelChatDraft')
    expect(pendingIntake).toContain('readPendingKaelChatDraft')
    expect(stack).toContain('const shouldUseIntake = Boolean(')
    expect(stack).toContain('kaelAssistantService.ask')
    expect(stack).toContain("surface: 'customer_normal'")
    expect(stack).toContain("surface: 'customer_case'")
    expect(stack).toContain('kaelChatService.create')
    expect(stack).toContain('kaelChatService.sendTurn')
    expect(stack).toContain('kaelChatService.submitEvidence')
    expect(stack).toContain('uploadKaelChatMediaDrafts(composerMediaDrafts)')
    expect(stack).toContain('testID="customer-v21-kael-input"')
    expect(stack).toContain('testID="customer-v21-kael-send"')
    expect(stack).toContain('testID="customer-v21-chat-tab-normal"')
    expect(stack).toContain('testID="customer-v21-chat-tab-case-work"')
    expect(stack).toContain('testID="customer-v21-case-work-inactive"')
    expect(stack).toContain('router.replace(nextMode === \'case\' ? caseWorkRoute as never : customerKaelChatRoute as never)')
    expect(stack).toContain('caseWorkRoute')
    expect(services).toContain("api.post<KaelAssistantResponse>('/kael/assistant', input)")
    expect(services).toContain("api.post<KaelChatResponse>('/kael/chat', input)")
    expect(services).toContain('api.post<KaelChatResponse>(`/kael/chat/${sessionId}`, input)')
    expect(services).toContain('api.post<KaelChatResponse>(`/kael/chat/${sessionId}/evidence`, input)')
    expect(stack).not.toContain('createClient')
    expect(stack).not.toContain('supabase.')
    expect(stack).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    expect(stack).not.toContain('ANTHROPIC_API_KEY')
    expect(stack).not.toContain('PERPLEXITY_API_KEY')
    expect(stack).not.toContain('DEEPSEEK_API_KEY')
    expect(stackStyles).not.toContain('fetch(')
    expect(stackStyles).not.toContain('supabase.')
    expect(pendingIntake).not.toContain('fetch(')
    expect(pendingIntake).not.toContain('supabase.')
  })

  it('removes the legacy native customer tab bar so only the custom dock renders', () => {
    const src = customerLayout()
    expect(src).toContain('tabBar={() => null}')
    expect(src).toContain('CustomerV21DockOverlay')
    expect(src).toContain('activeCustomerDockFromPath')
    expect(src).toContain("const showDock = !pathname.includes('/kael')")
    expect(src).toContain('{showDock ? <CustomerV21DockOverlay active={activeDock} /> : null}')
    expect(src).not.toContain('tabBarStyle')
    expect(src).not.toContain('tabBarIcon')
    expect(src).not.toContain('CustomerTabIcon')
    expect(src).not.toContain('customer-tab-icon-home')
    expect(src).not.toContain('customer-tab-kael-mascot-8a')
    expect(src).not.toContain('react-native-svg')
  })

  it('keeps customer shell visible copy compact and structure-first', () => {
    const src = shell()
    expect(src).toContain('numberOfLines')
    expect(src).toContain('customerV21CommonCopy')
    expect(src).toContain('customerV21ScreenTitles')
    expect(src).toContain('customerV21ServiceCopy')
    expect(src).toContain('customerV21StatusCopy')
    expect(src).toContain('dataPending')
    expect(src).toContain('emptyProfileMetric')
    expect(src).not.toContain('Ch? luu ng? cảnh chung')
    expect(src).not.toContain('Giá thực tế do thợ xác nhận trước khi bắt đầu.')
    expect(src).not.toContain('Name/building/floor')
    expect(src).not.toContain('Không b?a ngày')
    expect(src).not.toContain('Chua luu backend')
    expect(src).not.toContain('Không fake worker')
    expect(src).not.toContain('B? l?c s? m?')
    expect(src).not.toContain('Không dánh d?u dã thanh toán')
  })

  it('uses mobile production V21 frame markers and dock-safe scrolling', () => {
    const src = shell()
    expect(src).toContain('function V21Screen')
    expect(src).toContain('testID="customer-v21-scroll"')
    expect(src).toContain('testID="customer-v21-home"')
    expect(src).toContain('testID="customer-v21-services"')
    expect(src).toContain('testID="customer-v21-activity"')
    expect(src).toContain('testID="customer-v21-profile"')
    expect(src).toContain('export function CustomerKaelSurface')
    expect(src).toContain('return <CustomerAgenticCenterSurface screenId={directAgenticScreen} />')
    expect(src).toContain('SafeAreaView')
    expect(src).toContain('ScrollView')
    expect(src).toContain('Pressable')
    expect(src).toContain('numberOfLines')
    expect(src).toContain('CUSTOMER_LIQUID_NAV_MAX_WIDTH')
    expect(src).toContain('CUSTOMER_LIQUID_NAV_ORB_SIZE')
    expect(src).toContain('CUSTOMER_LIQUID_NAV_DOCK_HEIGHT')
    expect(src).toContain('testID="customer-v21-dock-overlay"')
    expect(src).toContain('testID="customer-v21-dock-lens"')
    expect(src).toContain('testID="customer-v21-kael-accessory"')
    expect(src).toContain('testID="customer-v21-kael-accessory-glass"')
    expect(src).toContain('getReducedTransparencyCustomerTokens')
    expect(src).toContain('glass.reduceTransparency ? getReducedTransparencyCustomerTokens')
    expect(src).toContain('react-native-reanimated')
    expect(src).toContain('useAnimatedStyle')
    expect(src).toContain('withSpring')
    expect(src).toContain('withTiming')
    expect(src).toContain('withDelay')
    expect(src).not.toContain("filter: 'blur")
    expect(src).not.toContain('Animated.loop')
    expect(src).not.toContain('onHoverIn')
  })

  it('uses V21 utility and transaction surfaces without fabricated backend state', () => {
    const src = shell()
    expect(src).toContain('testID="customer-v21-payment-review-details"')
    expect(src).toContain('testID="customer-v21-payment-method-total"')
    expect(src).toContain('testID="customer-v21-payment-protected-ledger"')
    expect(src).toContain('payment?.status')
    expect(src).toContain('paymentAmount')
    expect(src).toContain('customerV21CommonCopy[language].paymentLocked')
    expect(src).toContain('testID="customer-v21-profile-ranking"')
    expect(src).toContain('testID="customer-v21-profile-money"')
    expect(src).toContain('testID="customer-v21-profile-memory"')
    expect(src).toContain('testID="customer-v21-job-progress-evidence"')
    expect(src).toContain('ScopeChangeHardStopModal')
    expect(src).not.toContain('paid_success')
    expect(src).not.toContain('review_submitted')
    expect(src).not.toContain('workerAccepted')
  })

  it('uses honest empty states without fabricated transactions or profile data', () => {
    const src = shell()
    expect(src).toContain('testID="customer-v21-home-empty"')
    expect(src).toContain('testID="customer-v21-guest-gate"')
    expect(src).toContain('copy.emptyProfileMetric')
    expect(src).toContain("insightNumber(insights, 'completed_service_count'")
    expect(src).toContain("insightNumber(insights, 'saved_address_count'")
    expect(src).toContain('customerV21CommonCopy[language].dataPending')
    expect(src).toContain('formatKnownCount')
    expect(src).not.toMatch(/090\d{7}|0\d{9}/)
    expect(src).not.toMatch(/\d{1,3}\.\d{3}\s?d/)
  })

  it('separates Home booking entry points from the Kael chat stack route', () => {
    const src = shell()
    expect(src).toContain('useRouter')
    expect(src).toContain('const openService = (serviceType: ServiceType) => {')
    expect(src).toContain("workflow.dispatch?.({ type: 'start_home_service', serviceType })")
    expect(src).toContain('router.replace(`/(customer)/booking?service=${encodeURIComponent(serviceType)}` as never)')
    expect(src).toContain('setPendingKaelChatDraft({')
    expect(src).toContain("source: 'booking'")
    expect(src).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(src).toContain("router.replace('/(customer)/booking' as never)")
    expect(src).not.toContain("router.replace('/(customer)/kael' as never)")
    expect(src).not.toContain('openKaelChatFlow')
    expect(src).not.toContain('push(kaelChatPath(serviceType))')
  })

  it('forces A11 scope change review through a hard-stop modal on the customer history route', () => {
    const src = shell()
    const modal = read('components/customer/scope-change-modal/scope-change-hard-stop-modal.tsx')
    expect(exists('components/customer/scope-change-modal/scope-change-hard-stop-modal.tsx')).toBe(true)
    expect(src).toContain("import { useLocalSearchParams, useRouter } from 'expo-router'")
    expect(src).toContain('ScopeChangeHardStopModal')
    expect(src).toContain("useLocalSearchParams<{ job_id?: string | string[]; scope_change?: string | string[]; screen?: string | string[]; tab?: string | string[] }>()")
    expect(src).toContain('const routeJobId = cleanRouteJobId(firstParam(params.job_id))')
    expect(src).toContain('activityScreenParam(rawActivityScreen)')
    expect(src).toContain('void workflow.actions.hydrateRemoteJobById(routeJobId)')
    expect(src).toContain("['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(scopeChange.status)")
    expect(src).toContain('visible={forceScopeChangeModal}')
    expect(src).toContain("decideScopeChange('approve')")
    expect(src).toContain("decideScopeChange('reject')")
    expect(src).toContain('workflow.actions.decideScopeChange(scopeChange.id, { decision })')
    expect(modal).toContain('Modal animationType="fade"')
    expect(modal).toContain("import { KaelButton } from '@/components/ui/kael-primitives'")
    expect(modal).toContain('onRequestClose={() => undefined}')
    expect(modal).toContain('customer-scope-change-hard-stop-modal')
    expect(modal).toContain('customer-scope-change-modal-approve')
    expect(modal).toContain('customer-scope-change-modal-reject')
    expect(modal).toContain('<KaelButton')
    expect(modal).toContain('showPrimaryGradient={false}')
    expect(modal).not.toContain('Pressable')
    expect(modal).toContain('problem_summary')
    expect(modal).toContain('advisory')
    expect(modal).toContain('complexity_assessment')
    expect(modal).toContain('fallback_used')
    expect(modal).toContain('confidence')
    expect(modal).toContain('evidencePhotoUrls')
    expect(modal).not.toContain('customer_explanation')
    expect(modal).not.toContain('risk_notes')
    expect(modal).not.toContain('fetch(')
    expect(modal).not.toContain('supabase.')
    expect(modal).not.toContain('callAI')
  })

  it('keeps B6 scope-change photos on the scope evidence stage, not B7 completion media', () => {
    const worker = read('components/rebuild/rebuild-surfaces.tsx')
    const mediaUpload = read('lib/media-upload.ts')
    const apiTypes = read('lib/api-types.ts')

    expect(worker).toContain("uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')")
    expect(worker).not.toContain("uploadJobMediaDrafts(jobId, scopePhotos, 'after')")
    expect(mediaUpload).toContain("'scope_change_evidence'")
    expect(apiTypes).toContain("'scope_change_evidence'")
  })

  it('keeps voice-note media backend-ready with explicit native microphone recording config', () => {
    const mediaUpload = read('lib/media-upload.ts')
    const migration = readSource(resolve(ROOT, 'supabase/migrations/20260519090200_supabase_boxes_notifications_media_cancellation.sql'))
    const appPackage = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const expo = JSON.parse(read('app.json')).expo
    const dependencies = { ...appPackage.dependencies, ...appPackage.devDependencies }

    expect(mediaUpload).toContain("type: 'image' | 'video' | 'audio'")
    expect(mediaUpload).toContain("if (item.type === 'audio')")
    expect(mediaUpload).toContain("if (normalized === 'audio/x-m4a' || normalized === 'audio/m4a') return 'audio/mp4'")
    expect(mediaUpload).toContain("if (normalized === 'audio/mp4') return '.mp4'")

    for (const mimeType of ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']) {
      expect(migration).toContain(`'${mimeType}'`)
    }

    expect(dependencies['expo-av']).toBeUndefined()
    expect(dependencies['expo-audio']).toBe('~1.1.1')
    expect(expo.android?.permissions).toEqual([])
    expect(expo.ios?.infoPlist?.NSMicrophoneUsageDescription).toContain('micro')
    const audioPlugin = (expo.plugins ?? []).find((plugin: string | [string, Record<string, unknown>]) => Array.isArray(plugin) && plugin[0] === 'expo-audio') as [string, Record<string, unknown>] | undefined
    expect(audioPlugin?.[1]?.recordAudioAndroid).toBe(true)
    expect(String(audioPlugin?.[1]?.microphonePermission ?? '')).toContain('micro')
  })

  it('hands customer home service cards into the booking wizard with exact service types', () => {
    const src = shell()
    expect(src).toContain("SERVICE_TYPES.map((service) =>")
    expect(src).toContain('<ServiceTile homeAura key={service} onPress={() => openService(service)} service={service} />')
    expect(src).toContain('const openService = (serviceType: ServiceType) => {')
    expect(src).toContain("workflow.dispatch?.({ type: 'start_home_service', serviceType })")
    expect(src).toContain('router.replace(`/(customer)/booking?service=${encodeURIComponent(serviceType)}` as never)')
    expect(src).toContain('setPendingKaelChatDraft({')
    expect(src).toContain("serviceType: selectedService")
    expect(src).toContain("source: 'booking'")
    expect(src).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(src).toContain('const activeCaseRoute = isDraftDeal')
    expect(src).toContain('onAction={deal ? () => router.replace(activeCaseRoute as never) : undefined}')
    expect(src).toContain('<ActiveCaseCard deal={deal} onOpen={() => router.replace(activeCaseRoute as never)} />')
    expect(src).toContain("router.replace('/(customer)/booking' as never)")
    expect(src).not.toContain('bookingWizardPath(serviceType)')
    expect(src).not.toContain('kaelChatPath(serviceType)')
    expect(src).not.toContain("push(kaelChatPath(deal?.draft.serviceType))")
  })

  it('removes the legacy local Kael ticket composer from the customer shell', () => {
    const src = shell()
    expect(src).toContain('export function CustomerKaelSurface')
    expect(src).toContain('return <CustomerAgenticCenterSurface screenId={directAgenticScreen} />')
    expect(src).toContain('export function KaelChatSurface')
    expect(src).toContain('kaelAssistantService.ask')
    expect(src).toContain('kaelChatService.create')
    expect(src).toContain('kaelChatService.sendTurn')
    expect(src).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(src).not.toContain("router.replace('/(customer)/kael' as never)")
    expect(src).not.toContain("dispatch({ type: 'submit_kael_draft', text: trimmed })")
    expect(src).not.toContain('displayedKaelAnswer')
    expect(src).not.toContain('kaelTicketService')
    expect(src).not.toContain('kaelTicketProblem')
    expect(src).not.toContain('localKaelDraft')
    expect(src).not.toContain('canStartKaelDraft')
    expect(src).not.toContain('customer-kael-active-deal-guard')
    expect(src).not.toContain('EMPTY_CUSTOMER_KAEL_DRAFT_STATE')
    expect(src).not.toContain('patchKaelDraft')
    expect(src).not.toContain('maxLength={220}')
    expect(src).not.toContain('value="S?a di?n"')
    expect(src).not.toContain('value="? nóng"')
  })
})

describe('customer Kael workflow view model wiring', () => {
  const kaelChat = () => read('components/customer/kael-chat/kael-chat-surface.tsx')
  const kaelThread = () => read('components/customer/kael-chat/thread.tsx')
  const agenticParts = () => read('components/customer/kael-chat/agentic-parts.tsx')
  const workflowHook = () => read('lib/use-service-workflow.ts')

  it('derives Kael ticket visibility from the shared workflow view model', () => {
    const src = kaelChat()
    expect(src).toContain('useFrontendWorkflow')
    expect(src).toContain('readPendingKaelChatDraft')
    expect(src).toContain('const shouldUseIntake = Boolean(')
    expect(src).toContain('workflow.actions.hydrateRemoteJobById(routeJobId)')
    expect(src).toContain('kaelAssistantService.ask')
    expect(src).toContain("surface: 'customer_normal'")
    expect(src).toContain("surface: 'customer_case'")
    expect(src).toContain('kaelChatService.create')
    expect(src).toContain('kaelChatService.sendTurn')
    expect(src).toContain('uploadKaelChatMediaDrafts(composerMediaDrafts)')
    expect(src).toContain('testID="customer-v21-kael-input"')
    expect(src).toContain('testID="customer-v21-kael-send"')
    expect(src).toContain('testID="customer-v21-chat-tab-normal"')
    expect(src).toContain('testID="customer-v21-chat-tab-case-work"')
    expect(src).toContain('testID="customer-v21-case-work-inactive"')
    expect(src).toContain('router.replace(nextMode === \'case\' ? caseWorkRoute as never : customerKaelChatRoute as never)')
    expect(src).toContain('caseWorkRoute')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
    expect(src).not.toContain('callAI')
    expect(kaelThread()).toContain('<KaelPhaseContextCard language={language} phaseContext={workflow.phaseContext} />')
    expect(agenticParts()).toContain("import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'")
    expect(agenticParts()).not.toContain('sampleRows')
  })

  it('keeps the mobile workflow adapter memoized and side-effect free', () => {
    const src = workflowHook()
    expect(src).toContain("import { useMemo } from 'react'")
    expect(src).toContain('return useMemo(')
    expect(src).toContain('buildWorkflowViewModel({')
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('supabase')
  })

  it('renders Kael process steps progressively from the ticket artifact mode', () => {
    const src = agenticParts()
    expect(src).toContain('type WorkflowArtifactMode')
    expect(src).toContain('function processStepCount')
    expect(src).toContain('steps.slice(0, visibleSteps)')
  })

  it('renders estimate-ready orchestration as Kael status instead of a customer gate', () => {
    const src = agenticParts()
    expect(src).toContain('const orchestrationBusy = orchestrating')
    expect(src).toContain('? text.orchestrate')
    expect(src).toContain('accessibilityState={{ busy: orchestrationBusy, disabled: true }}')
    expect(src).toMatch(/<KaelButton[\s\S]*accessibilityState=\{\{ busy: orchestrationBusy, disabled: true \}\}[\s\S]*disabled[\s\S]*label=\{actionLabel\}[\s\S]*onPress=\{onStartOrchestration\}[\s\S]*testID="customer-kael-chat-orchestration"/)
    expect(src).not.toContain('orchestrating || (canStartOrchestration && !orchestrationStarted)')
    expect(src).not.toContain('? text.nextAction.estimate_ready')
  })
})

describe('customer rebuild agentic audit flow wiring', () => {
  const rebuildSurface = () => read('components/rebuild/rebuild-surfaces.tsx')

  it('keeps the customer agentic audit flow gated by real worker, quote, route, and payment data', () => {
    const src = rebuildSurface()
    expect(src).toContain("auditSurface === 'kael_helper_fix_options'")
    expect(src).toContain("auditSurface === 'worker_offer_quote'")
    expect(src).toContain("auditSurface === 'location_eta'")
    expect(src).toContain("auditSurface === 'case_completion_summary'")
    expect(src).toContain("auditSurface === 'payment_gate'")
    expect(src).toContain('ns_audit_surface=kael_helper_fix_options')
    expect(src).toContain('ns_audit_surface=worker_offer_quote')
    expect(src).toContain('ns_audit_surface=location_eta')
    expect(src).toContain('ns_audit_surface=case_completion_summary')
    expect(src).toContain('ns_audit_surface=payment_gate')
    expect(src).toContain('customer-case-completion-summary-open-payment')
    expect(src).toContain('customer-payment-gate-create-payment')
    expect(src).toContain('customer-payment-gate-vietqr-panel')
    expect(src).toContain('customer-payment-gate-vietqr-placeholder')
    expect(src).not.toContain('customer-payment-gate-vietqr-status')
    expect(src).toContain('Chờ mã VietQR')
    expect(src).not.toContain('Chưa có mã VietQR')
    expect(src).not.toContain('VietQR chỉ hiện khi Kael xác nhận ca làm')
    expect(src).toContain('jobService.createPaymentIntent')
    expect(src).toContain('customer-payment-gate-history-action')

    const detailButton = src.slice(src.indexOf('testID="customer-matching-ai-score-detail"') - 360, src.indexOf('testID="customer-matching-ai-score-detail"') + 120)
    expect(detailButton).toContain('kael_helper_fix_options')
    expect(detailButton).toContain('disabled={!hasWorker}')
    expect(detailButton).not.toContain('onPress={() => undefined}')
    const helperButton = src.slice(src.indexOf('testID="customer-helper-fix-options-next"') - 420, src.indexOf('testID="customer-helper-fix-options-next"') + 120)
    expect(helperButton).toContain('disabled={!data.canOpenQuote}')
    const quoteButton = src.slice(src.indexOf('testID="customer-worker-offer-quote-next"') - 420, src.indexOf('testID="customer-worker-offer-quote-next"') + 120)
    expect(quoteButton).toContain('disabled={!data.canOpenLocation}')
    const locationButton = src.slice(src.indexOf('testID="customer-location-eta-next"') - 420, src.indexOf('testID="customer-location-eta-next"') + 120)
    expect(locationButton).toContain('disabled={!data.canOpenCompletion}')
    expect(src).toContain('testID="customer-location-map-provider"')
    expect(src).toContain("Linking.openURL(`https://www.google.com/maps/dir/?${params.toString()}`)")
    expect(src).toContain("label={language === 'vi' ? 'Thời gian dự kiến' : 'Estimated arrival'}")
    expect(src).not.toContain("label={language === 'vi' ? 'ETA' : 'ETA'}")
    expect(src).not.toContain('agenticMapBlockA')
    expect(src).not.toContain('agenticMapPinStart')
    expect(src).not.toContain('Chờ xác nhận Kael')
    const paymentButton = src.slice(src.indexOf('testID="customer-payment-gate-create-payment"') - 900, src.indexOf('testID="customer-payment-gate-create-payment"') + 180)
    expect(paymentButton).toContain('disabled={!canCreatePayment || creatingPayment}')
    expect(paymentButton).toContain('onPress={handleCreatePayment}')
  })

  it('wires SePay/VietQR through Edge payment intent and webhook, not local UI state', () => {
    const rebuild = rebuildSurface()
    const mobileServices = read('lib/services.ts')
    const router = readRoot('supabase/functions/mobile-api/_shared/router.ts')
    const edgeServices = readRoot('supabase/functions/mobile-api/_shared/services.ts')

    expect(mobileServices).toContain("createPaymentIntent(jobId: string)")
    expect(mobileServices).toContain("`/jobs/${jobId}/payment-intent`")
    expect(router).toContain('payments.sepayWebhook')
    expect(router).toContain('/payments/sepay/webhook')
    expect(router).toContain('jobs.paymentIntent')
    expect(edgeServices).toContain('handleSepayWebhook')
    expect(edgeServices).toContain('sepay_transaction_id')
    expect(edgeServices).toContain('validateWorkflowTransition({')
    expect(edgeServices).toContain('event: "payment_confirmed"')
    expect(rebuild).not.toContain('setPaymentRequested(true)')
  })

  it('keeps rebuild worker Kael advisory private from JobRoom relay by default', () => {
    const rebuild = rebuildSurface()

    expect(rebuild).toContain('workerKaelChatService.streamTurn')
    expect(rebuild).not.toContain('jobChatThread.send(value)')
    expect(rebuild).not.toContain('useJobChatThread(deal?.id ?? null, jobChatEnabled)')
  })

  it('keeps worker v5 Kael advisory private after removing Stage 3.3 and Stage 3.4', () => {
    const workerV5 = read('components/worker/worker-v5-flow.tsx')
    const privateKaelStart = workerV5.indexOf('function WorkerV5PrivateKaelChat')
    const privateKaelEnd = workerV5.indexOf('function workerV5PrivateKaelTurnsFromResponse')
    const privateKael = workerV5.slice(privateKaelStart, privateKaelEnd)

    expect(workerV5).not.toContain('function WorkerV5JobRoomChatBody')
    expect(workerV5).not.toContain('function WorkerV5KaelWorkResolutionBody')
    expect(workerV5).not.toContain("'3.3-kael-case-work'")
    expect(workerV5).not.toContain("'3.4-job-room-chat'")
    expect(workerV5).not.toContain('useJobChatThread')
    expect(workerV5).not.toContain('jobChat.send')
    expect(privateKael).toContain('workerKaelChatService.create')
    expect(privateKael).toContain('workerKaelChatService.streamTurn')
    expect(privateKael).not.toContain('useJobChatThread')
    expect(privateKael).not.toContain('jobChat.send')
  })
})

describe('customer history phase-gated workflow wiring', () => {
  const shell = () => read('components/customer/customer-surfaces.tsx')

  it('uses the shared workflow view model for customer history gates', () => {
    const src = shell()
    expect(src).toContain('useFrontendWorkflow')
    expect(src).toContain('const deal = workflow.state.deal')
    expect(src).toContain('activityScreenParam(rawActivityScreen)')
    expect(src).toContain('<CaseOverviewDirectScreen deal={deal} />')
    expect(src).toContain('<ActivityDirectScreen deal={deal} screenId={activeScreen} />')
    expect(src).toContain('<CompletionStateSummary deal={deal} />')
    expect(src).toContain('deal.completionPhotoUrls?.length')
    expect(src).toContain('deal.completionNotes')
    expect(src).toContain('customer-v21-payment-review-kael-card')
    expect(src).toContain('ScopeChangeHardStopModal')
    expect(src).toContain('visible={forceScopeChangeModal}')
    expect(src).toContain('isPendingCustomerScopeChange(scopeChange)')
    expect(src).toContain('void workflow.actions.hydrateRemoteJobById(routeJobId)')
    expect(src).toContain('workflow.actions.decideScopeChange(scopeChange.id, { decision })')
    expect(src).toContain('screenIdsForStatus(deal.status).includes(screenId)')
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

  it('keeps deferred realtime status subscriptions out of the workflow provider to avoid duplicate phase updates', () => {
    const provider = read('lib/frontend-workflow-provider.tsx')
    const realtime = read('lib/realtime.ts')

    expect(realtime).toContain('subscribeToJobStatus')
    expect(realtime).toContain('Until then, do NOT wire it')
    expect(provider).not.toContain('subscribeToJobStatus')
    expect(provider).not.toContain('postgres_changes')
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
    expect(src).toContain('!locallyReadNotificationIdsRef.current!.has(notificationId)')
    expect(src).toContain("type: 'mark_read'")
    expect(src).toContain('shouldDecrementUnread,')
    expect(src).not.toContain('setNotificationUnreadCount')
  })

  it('hydrates worker earnings from the mobile API without blocking worker job refresh', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain('workerEarnings: EarningsResponse | null')
    expect(src).toContain('workerPerformanceInsights: WorkerPerformanceInsightsResponse | null')
    expect(src).toContain('type WorkerRemoteState')
    expect(src).toContain('const [workerRemoteState, setWorkerRemoteState]')
    expect(src).toContain('const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null')
    expect(src).toContain('const workerPerformanceInsights = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.performanceInsights : null')
    expect(src).toContain('workerService.getEarnings(currentWorkerMonthRange())')
    expect(src).toContain('workerService.getPerformanceInsights()')
    expect(src).toContain('function currentWorkerMonthRange')
    expect(src).toContain('const nextEarnings = earnings.success ? earnings.data : null')
    expect(src).toContain('const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null')
    expect(src).toContain('sameWorkerEarnings')
    expect(src).toContain('sameWorkerPerformanceInsights')
  })

  it('hydrates customer profile insights from the mobile API instead of profile metadata aliases', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    const customer = read('components/customer/customer-surfaces.tsx')

    expect(src).toContain('customerProfileInsights: CustomerProfileInsightsResponse | null')
    expect(src).toContain('type CustomerProfileInsightsState')
    expect(src).toContain('const [customerProfileInsightsState, setCustomerProfileInsightsState]')
    expect(src).toContain('customerProfileService.getInsights()')
    expect(src).toContain('sameCustomerProfileInsights')
    expect(customer).toContain('const workflow = useFrontendWorkflow()')
    expect(customer).toContain('const insights = workflow.customerProfileInsights ?? null')
    expect(customer).toContain("insightNumber(insights, 'completed_service_count'")
    expect(customer).not.toContain('customerMetadata.usage_rank_points')
    expect(customer).not.toContain('customerMetadata.money_protection_score')
    expect(customer).not.toContain('customerMetadata.fair_price_service_count')
  })

  it('clears released worker address locally after Kael approves worker cancellation', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain("if (result.data.status === 'approved')")
    expect(src).toContain("status: 'cancelled'")
    expect(src).toContain('fullAddressVisible: false')
    expect(src).toContain('fullAddressLabel: null')
    expect(src).toContain('await workerRefresh()')
  })

  it('routes after-accept customer cancellation to Kael policy review instead of the pre-accept cancel endpoint', () => {
    const provider = read('lib/frontend-workflow-provider.tsx')

    expect(provider).toContain('requestCustomerCancellation')
    expect(provider).toContain('usesBeforeAcceptCancelEndpoint')
    expect(provider).toContain('defaultCustomerCancellationInput')
    expect(provider).toContain("reason_code: 'changed_mind'")
    expect(provider).toContain('jobService.requestCustomerCancellation(jobId, defaultCustomerCancellationInput(language))')
    expect(provider).toContain("const cancelledByPolicy = requested.data.job_status === 'cancelled'")
    expect(provider).toContain('backendStatus: requested.data.job_status')
    expect(provider).toContain('fullAddressVisible: cancelledByPolicy ? false : existing.broadcast.fullAddressVisible')
    expect(provider).toContain('fullAddressLabel: cancelledByPolicy ? null : existing.broadcast.fullAddressLabel')
    expect(provider).toContain('await refreshCurrentJob()')
    expect(provider).toContain("return status === 'draft' ||")
    expect(provider).toContain("status === 'analyzing' ||")
    expect(provider).toContain("status === 'estimate_ready' ||")
    expect(provider).toContain("status === 'awaiting_customer_confirm' ||")
    expect(provider).toContain("status === 'broadcasting'")
    expect(provider).not.toContain('if (existing && !usesBeforeAcceptCancelEndpoint(existing.status)) {\n    const cancelled = await jobService.cancelJob(jobId)')
  })

  it('normalizes backend price estimates to the required customer disclaimer before UI render', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    const requiredDisclaimer = 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'
    expect(src).toContain(`const REQUIRED_PRICE_DISCLAIMER = '${requiredDisclaimer}'`)
    expect(src).toContain('disclaimer: REQUIRED_PRICE_DISCLAIMER')
    expect(src).not.toContain('Giá thực tế do thợ xác nhận trước khi bắt đầu.')
    expect(src).not.toContain('Đây là ước tính cần thợ xác nhận')
    expect(src).not.toContain('disclaimer: data.estimate.disclaimer')
  })

  it('does not crash when worker profile array fields are absent from a runtime response', () => {
    const src = read('lib/frontend-workflow-provider.tsx')
    expect(src).toContain('readonly string[] | null | undefined')
    expect(src).toContain('const leftItems = left ?? []')
    expect(src).toContain('const rightItems = right ?? []')
    expect(src).toContain('return leftItems.length === rightItems.length')
  })
})

describe('mobile push notification wiring', () => {
  it('keeps Expo Notifications runtime code while suppressing iOS push entitlements until provisioning is ready', () => {
    const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))
    const appConfig = read('app.config.ts')
    const appJson = read('app.json')
    expect(mobilePackage.dependencies['expo-notifications']).toBe('~0.32.17')
    expect(appConfig).toContain('withoutIosPushEntitlement')
    expect(appConfig).toContain("delete config.modResults['aps-environment']")
    expect(appConfig).toContain("delete attributes.SystemCapabilities?.['com.apple.Push']")
    expect(appConfig).not.toContain("'expo-notifications'")
    expect(appJson).not.toContain('"expo-notifications"')
  })

  it('registers Expo push tokens through the mobile API wrapper after authenticated profile load', () => {
    const authProvider = read('lib/auth-provider.tsx')
    const push = read('lib/push-notifications.ts')
    expect(exists('lib/push-notifications.ts')).toBe(true)
    expect(authProvider).toContain("import { useRouter } from 'expo-router'")
    expect(authProvider).toContain("import { addPushNotificationResponseListener, setupPushNotifications } from './push-notifications'")
    expect(authProvider).toContain("profileStatus !== 'ready'")
    expect(authProvider).toContain("const registrationKey = `${userId}:${role}`")
    expect(authProvider).toContain('pushRegistrationKeyRef')
    expect(authProvider).toContain('setupPushNotifications({ role })')
    expect(push).toContain("require('expo-notifications')")
    expect(push).toContain('getPermissionsAsync')
    expect(push).toContain('requestPermissionsAsync')
    expect(push).toContain('getExpoPushTokenAsync')
    expect(push).toContain('notificationService.registerDeviceToken(payload)')
    expect(push).toContain("permission_status: 'granted'")
    expect(push).toContain("source: 'expo-notifications'")
    expect(push).not.toContain('supabase.')
    expect(push).not.toContain('createClient')
    expect(push).not.toContain('fetch(')
    expect(push).not.toContain('phone')
    expect(push).not.toContain('unit')
    expect(push).not.toContain('address')
  })

  it('handles push deep links only for role-safe workflow screens', () => {
    const push = read('lib/push-notifications.ts')
    expect(push).toContain('export function toNotificationPath')
    expect(push).toContain("'deep_link'")
    expect(push).toContain("'broadcast_id'")
    expect(push).toContain("'scope_change'")
    expect(push).toContain("`/(customer)/history?${params.toString()}`")
    expect(push).toContain("`/(worker)/jobs?${params.toString()}`")
    expect(push).toContain('/^(?:nestscout|homeservices):\\/\\//i')
    expect(push).toContain("withoutScheme.startsWith('/(customer)/history')")
    expect(push).toContain("withoutScheme.startsWith('/(worker)/jobs')")
    expect(push).not.toContain('Linking.openURL')
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
    expect(src).toContain('const tabCopy = WORKER_TAB_COPY.vi')
    expect(src).toContain("home: 'Trang chủ'")
    expect(src).toContain("jobs: 'Công việc'")
    expect(src).toContain("earnings: 'Thu nhập'")
    expect(src).toContain("chat: 'Messages'")
    expect(src).toContain("earnings: 'Earnings'")
    expect(src).toContain('tabBar={() => null}')
    expect(src).toContain('WorkerRebuildDockOverlay')
    expect(src).toContain('activeWorkerDockFromPath')
    expect(src).toContain('href: null')
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
    expect(src).toContain('const WORKER_V5_SCREENS: WorkerV5ScreenDefinition[]')
    expect(src).toContain("type WorkerV5Section = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'")
    expect(src).toContain('function resolveWorkerV5Language')
    expect(src).toContain('function WorkerV5ScreenSurface')
    expect(src).toContain('testID={`worker-v5-screen-${screen.id}`}')
    expect(src).toContain('testID="worker-v5-scroll"')
    expect(src).toContain('useGlassAccessibility')
    expect(src).toContain('MintAura')
    expect(src).toContain('glass.reduceTransparency')
    expect(src).toContain('WorkerV5PrivateKaelChat')
    expect(src).toContain('workerKaelChatService.streamTurn')
    expect(src).toContain('WorkerV5ModeSwitch')
    expect(src).not.toContain('WorkerV5JobRoomChatBody')
    expect(src).not.toContain('WorkerV5KaelWorkResolutionBody')
    expect(src).not.toContain('useJobChatThread')
    expect(src).toContain("uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')")
    expect(src).toContain('localizedServiceLabel')
    expect(src).toContain("from './worker-v5-flow'")
    expect(src).not.toContain('worker-surfaces-v3')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
  })

  it('keeps Worker scope to electrical, plumbing, and cleaning services only', () => {
    const src = shell()
    expect(src).toContain('localizedServiceLabel')
    expect(src).toContain('profile.service_types.map((service) => localizedServiceLabel(service, language)).join')
    expect(src).toContain('scope="ShiftPriority"')
    expect(src).toContain('testID="worker-v5-skills-service-count"')
    expect(src).toContain('testID="worker-v5-quick-action-empty"')
    expect(src).toContain("type WorkerV5IconName =")
    expect(src).toContain("| 'tools'")
    expect(src).not.toMatch(/ac repair|appliance|handyman/i)
  })

  it('keeps Worker theme/language switching and wires private Kael chat through Edge messages', () => {
    const src = shell()
    expect(src).toContain('function resolveWorkerV5Language')
    expect(src).toContain('const routeLanguage = firstRouteParam(params.ns_worker_lang)')
    expect(src).toContain("if (routeLanguage === 'en' || routeLanguage === 'vi') return routeLanguage")
    expect(src).toContain('testID="worker-v5-kael-source-header"')
    expect(src).toContain('WorkerV5ModeSwitch')
    expect(src).not.toContain('WorkerV5JobRoomChatBody')
    expect(src).not.toContain('isWorkflowJobChatReadable')
    expect(src).not.toContain('isWorkflowJobChatSendable')
    expect(src).not.toContain('useJobChatThread')
    expect(src).not.toContain('jobChat.send')
    expect(src).toContain('WorkerV5PrivateKaelChat')
    expect(src).toContain('workerKaelChatService.create')
    expect(src).toContain('workerKaelChatService.streamTurn')
    expect(src).toContain('workerKaelChatService.submitFeedback')
    expect(src).toContain('worker-kael-chat-input')
    expect(src).toContain('worker-kael-send-button')
    expect(src).toContain('worker-kael-feedback-open')
    expect(src).toContain('worker-onsite-advisory-rail')
    expect(src).not.toContain('buildWorkerDealChatSeed')
    expect(src).not.toContain('buildWorkerChatSeed')
    expect(src).toContain('const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null')
    expect(src).toContain('const canRevealFullAddress = Boolean(deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel && deal && canShowWorkerAddress(deal))')
    expect(src).not.toContain('const fullAddressLabel = broadcast.fullAddressLabel ?? deal?.draft.addressLabel ?? null')
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
    }
  })

  it('keeps Worker typography on the shared system theme without bundled fonts', () => {
    const src = shell()
    expect(src).toContain("import { color, component, glass, radius, shadow, typography } from '@/design/theme'")
    expect(src).toContain('fontFamily: typography.fontFamily')
    expect(src).not.toContain("'Kael Sans'")
    expect(src).not.toContain('expo-font')
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

  it('redirects the legacy OTP route instead of exposing a stale standalone screen', () => {
    const verifyOtp = read('app/(auth)/verify-otp.tsx')
    expect(verifyOtp).toContain('Redirect')
    expect(verifyOtp).toContain('/(auth)/login')
    expect(verifyOtp).not.toContain('Xác minh OTP')
    expect(verifyOtp).not.toContain('Nh?p mã OTP')
  })
})

describe('auth production login surface', () => {
  const route = read('app/(auth)/login.tsx')
  const surfacePath = 'components/auth/auth-surfaces.tsx'
  const surface = read(surfacePath)
  const entryFlow = read('components/auth/entry-access/EntryBrandAccessFlow.tsx')
  const entryTypes = read('components/auth/entry-access/types.ts')

  it('wires login to the production auth surface', () => {
    expect(exists(surfacePath)).toBe(true)
    expect(exists('components/auth/entry-access/EntryBrandAccessFlow.tsx')).toBe(true)
    expect(route).toContain('@/components/auth/auth-surfaces')
    expect(route).not.toContain('auth-surfaces-v2')
    expect(surface).toContain('export function LoginRoleSurface')
    expect(surface).toContain('EntryBrandAccessFlow')
    expect(surface).toContain('resolveEntryStep')
    expect(entryFlow).toContain('testID="auth-login-submit"')
    expect(entryFlow).toContain('testID="auth-register-submit"')
    expect(entryFlow).toContain('testID="auth-onboarding-start"')
  })

  it('implements the source-of-trust six-section entry flow', () => {
    expect(entryTypes).toContain("| 'splash'")
    expect(entryTypes).toContain("| 'welcome'")
    expect(entryTypes).toContain("| 'role-gate'")
    expect(entryTypes).toContain("| 'login'")
    expect(entryTypes).toContain("| 'register'")
    expect(entryTypes).toContain("| 'onboarding'")
    expect(surface).toContain("stage === '1.1'")
    expect(surface).toContain("stage === '1.2'")
    expect(surface).toContain("stage === '1.3'")
    expect(surface).toContain("stage === '1.4'")
    expect(surface).toContain("stage === '1.5'")
    expect(surface).toContain("stage === '1.6'")
    expect(entryFlow).toContain('auth-splash-1-1')
    expect(entryFlow).toContain('auth-welcome-1-2')
    expect(entryFlow).toContain('auth-role-gate-content')
    expect(entryFlow).toContain('auth-login-1-4')
    expect(entryFlow).toContain('auth-register-1-5')
    expect(entryFlow).toContain('auth-onboarding-1-6')
  })

  it('keeps role-first auth and removes obsolete prototype branches', () => {
    expect(surface).toContain('auth-entry-role-first')
    expect(entryFlow).toContain('auth-entry-role-customer')
    expect(entryFlow).toContain('auth-entry-role-worker')
    expect(surface).toContain('auth-login-role-customer')
    expect(surface).toContain('auth-login-role-worker')
    expect(entryFlow).not.toContain('auth-entry-role-guest')
    expect(entryTypes).not.toContain("'client-login'")
    expect(entryTypes).not.toContain("'worker-login'")
    expect(entryTypes).not.toContain("'worker-apply'")
    expect(surface).not.toContain('auth-v2')
    expect(surface).not.toContain('/(auth)/onboard')
  })

  it('keeps auth actions behind existing provider boundaries and pending unavailable providers', () => {
    expect(surface).toContain('signInWithPassword')
    expect(surface).toContain('signInWithGoogle')
    expect(surface).toContain('signUpWithEmail')
    expect(surface).toContain('submitWorkerApplication')
    expect(surface).toContain('gmailPending')
    expect(surface).toContain('facebookPending')
    expect(surface).not.toContain('Gmail is not ready')
    expect(surface).not.toContain('Facebook is not ready')
    expect(entryFlow).toContain('props.role === \'customer\'')
    expect(entryFlow).toContain('auth-client-google-primary')
    expect(entryFlow).toContain('auth-client-gmail-secondary')
    expect(entryFlow).toContain('auth-client-facebook-secondary')
    expect(entryFlow).toContain('auth-login-email-input')
    expect(entryFlow).toContain('auth-login-password-input')
    expect(entryFlow).toContain('auth-client-register-email')
    expect(surface).not.toContain('auth-worker-google')
  })

  it('supports admin audit selection after authenticated profile role is loaded', () => {
    expect(surface).toContain("auth.role === 'admin'")
    expect(surface).toContain("'/(admin)/dashboard'")
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
    expect(customerLayout).toContain("role === 'worker'")
    expect(customerLayout).toContain('/(worker)/home')
    expect(customerLayout).toContain("role !== 'customer'")
    expect(customerLayout).toContain('/(auth)/login')
  })

  it('guards worker routes behind authenticated worker/admin roles', () => {
    expect(workerLayout).toContain('useAuth')
    expect(workerLayout).toContain('Redirect')
    expect(workerLayout).toContain("role === 'admin'")
    expect(workerLayout).toContain("role === 'customer'")
    expect(workerLayout).toContain('/(customer)/home')
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

  it('prefers injected EXPO_PUBLIC values over stale Expo extra payloads in web preview', () => {
    expect(runtimeConfig).toContain("envString('EXPO_PUBLIC_SUPABASE_URL') || extraString('supabaseUrl')")
    expect(runtimeConfig).toContain("envString('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || extraString('supabasePublishableKey')")
    expect(runtimeConfig).toContain("envString('EXPO_PUBLIC_API_BASE_URL') || extraString('apiBaseUrl')")
  })

  it('uses SecureStore for session persistence', () => {
    expect(src).toContain("from 'expo-secure-store'")
    expect(src).toContain('supabaseAuthStorage')
    expect(src).toContain('storage: supabaseAuthStorage')
    expect(src).toContain('fallbackAuthStorage')
    expect(src).toContain('getBrowserStorage')
    expect(src).not.toContain('AsyncStorage')
  })

  it('only detects auth sessions in URL on web OAuth redirects', () => {
    expect(src).toContain("import { Platform } from 'react-native'")
    expect(src).toContain("detectSessionInUrl: Platform.OS === 'web'")
  })

  it('enables autoRefreshToken', () => {
    expect(src).toContain('autoRefreshToken: true')
  })

  it('uses Database generic for type safety', () => {
    expect(src).toContain('<Database>')
    expect(src).toContain("from '@nestscout/shared'")
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
    expect(src).toContain("from '@nestscout/shared'")
  })

  it('auth state has session, role, and loading', () => {
    expect(src).toContain('session')
    expect(src).toContain('role')
    expect(src).toContain('loading')
  })

  it('exposes production auth actions and explicit profile status', () => {
    expect(src).toContain('signInWithPassword')
    expect(src).toContain('signInWithGoogle')
    expect(src).toContain('supabase.auth.signInWithOAuth')
    expect(src).toContain('createSessionFromOAuthUrl')
    expect(src).toContain('exchangeCodeForSession')
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
    expect(src).toContain('Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.')
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
  const entryFlow = read('components/auth/entry-access/EntryBrandAccessFlow.tsx')
  const materials = read('components/auth/entry-access/components/materials.tsx')

  it('keeps profile recovery inside the six-step onboarding gate without raw profile status copy', () => {
    expect(src).toContain("profileStatus === 'profile_missing'")
    expect(src).toContain("profileRecoveryStep")
    expect(src).toContain('refreshProfile')
    expect(entryFlow).toContain('auth-onboarding-1-6')
    expect(entryFlow).toContain('auth-onboarding-start')
    expect(src).not.toContain('{profileStatus}</Text>')
    expect(src).not.toContain('<Text style={styles.errorText}>{profileStatus}</Text>')
  })

  it('keeps login background structural instead of decorative orb blobs', () => {
    expect(materials).toContain('function PathWithFallback')
    expect(materials).toContain('PageAura')
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

  it('has Android store build metadata and keeps microphone permission explicit through expo-audio', () => {
    expect(expo.android?.versionCode).toBeGreaterThanOrEqual(1)
    expect(expo.android?.permissions).toEqual([])
    const audioPlugin = (expo.plugins ?? []).find((plugin: string | [string, Record<string, unknown>]) => Array.isArray(plugin) && plugin[0] === 'expo-audio') as [string, Record<string, unknown>] | undefined
    expect(audioPlugin?.[1]?.recordAudioAndroid).toBe(true)
    expect(String(audioPlugin?.[1]?.microphonePermission ?? '')).toContain('micro')
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
  const appJson = read('app.json')

  it('keeps production runtime metadata on the NestScout brand', () => {
    expect(src).toContain("name: 'NestScout'")
    expect(src).toContain("slug: 'nestscout'")
    expect(src).toContain("scheme: 'nestscout'")
    expect(src).toContain("icon: './assets/nestscout-aurora-nest-appstore-1024.png'")
    expect(src).toContain("image: './assets/nestscout-aurora-nest-appstore-1024.png'")
    expect(src).toContain("foregroundImage: './assets/nestscout-aurora-nest-appstore-1024.png'")
    expect(src).toContain("bundleIdentifier: 'com.phanmanhtu.nestscout'")
    expect(src).toContain("package: 'com.phanmanhtu.nestscout'")
    expect(src).not.toContain("slug: 'home-services'")
    expect(src).not.toContain("scheme: 'homeservices'")
    expect(src).not.toContain('com.phanmanhtu.homeservices')

    expect(appJson).toContain('"name": "NestScout"')
    expect(appJson).toContain('"slug": "nestscout"')
    expect(appJson).toContain('"scheme": "nestscout"')
    expect(appJson).toContain('"icon": "./assets/nestscout-aurora-nest-appstore-1024.png"')
    expect(appJson).toContain('"image": "./assets/nestscout-aurora-nest-appstore-1024.png"')
    expect(appJson).toContain('"foregroundImage": "./assets/nestscout-aurora-nest-appstore-1024.png"')
    expect(appJson).toContain('"bundleIdentifier": "com.phanmanhtu.nestscout"')
    expect(appJson).toContain('"package": "com.phanmanhtu.nestscout"')
    expect(appJson).not.toContain('"slug": "home-services"')
    expect(appJson).not.toContain('"scheme": "homeservices"')
    expect(appJson).not.toContain('com.phanmanhtu.homeservices')
  })

  it('keeps active authority docs and package filters on the NestScout brand', () => {
    const authorityDocs = [
      'AGENTS.md',
      'critical.md',
      'RULES.md',
      'STRUCTURES.md',
      'design/motion.md',
      'design/signature.md',
      'design/screen-recipes.md',
      'design/reference-method.md',
      'design/design-lab.md',
    ]

    for (const docPath of authorityDocs) {
      const doc = readRoot(docPath)
      expect(doc).toContain('NestScout')
      expect(doc).not.toMatch(/\bHome Services\b/)
      expect(doc).not.toContain('HomeServices')
      expect(doc).not.toContain('@home-services/')
    }
  })

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

  it('routes the glass search bar through the Kael text-field primitive', () => {
    const searchBar = read('components/ui/glass-search-bar.tsx')
    expect(searchBar).toContain("import { KaelTextField } from './kael-primitives'")
    expect(searchBar).toContain('<KaelTextField')
    expect(searchBar).not.toContain('<TextInput')
  })

  it('centralizes glass variants and motion tokens with verified Expo native glass dependencies', () => {
    const tokens = read('components/ui/tokens.ts')
    const motion = read('components/ui/motion-tokens.ts')
    const surface = read('components/ui/glass-surface.tsx')
    const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))
    expect(tokens).toContain("export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet' | 'subtle'")
    expect(tokens).toContain("export type GlassMaterial = 'liquid' | 'standard'")
    expect(tokens).toContain("material = 'standard'")
    expect(tokens).toContain("const isLiquid = material === 'liquid'")
    expect(tokens).toContain('reduceTransparency ? fallbackBackground')
    expect(tokens).toContain('glassSurfaceTheme.standardFallbackBackground.dark')
    expect(tokens).toContain('glassSurfaceTheme.standardFallbackBackground.light')
    expect(tokens).toContain('glassSurfaceTheme.liquidFallbackBackground.dark')
    expect(tokens).toContain('glassSurfaceTheme.liquidFallbackBackground.light')
    expect(tokens).toContain('glassSurfaceTheme.standardBackground')
    expect(tokens).toContain('glassSurfaceTheme.liquidBackground')
    expect(tokens).toContain('liquidShadowByVariant')
    expect(tokens).toContain("boxShadow: reduceTransparency ? 'none'")
    expect(motion).toContain('durationMs: 440')
    expect(motion).toContain('reducedDurationMs')
    expect(motion).toContain('liquid: {')
    expect(motion).toContain('stiffness: 200')
    expect(mobilePackage.dependencies['expo-glass-effect']).toBe('~0.1.10')
    expect(mobilePackage.dependencies['expo-blur']).toBe('~15.0.8')
    expect(surface).toContain("from 'expo-glass-effect'")
    expect(surface).toContain("from 'expo-blur'")
    expect(surface).toContain('isLiquidGlassAvailable()')
    expect(surface).toContain('reduceTransparency')
    expect(surface).toContain("material = 'standard'")
    expect(surface).toContain('material === \'liquid\' ? liquidBlurIntensityByVariant[variant] : blurIntensityByVariant[variant]')
    expect(surface).toContain("nav: 24")
    expect(surface).toContain("sheet: 26")
    expect(surface).toContain("rgba(190,210,205,0.14)")
    expect(surface).toContain("rgba(255,255,255,0.46)")
    expect(surface).toContain('experimentalBlurMethod="none"')
    expect(surface).toContain("import { Platform, StyleSheet, View")
    expect(surface).toContain("const webNavBackingStyle = Platform.OS === 'web' && variant === 'nav'")
    expect(surface).toContain('styles.webNavBackingLight')
    expect(surface).toContain('styles.webNavBackingDark')
    expect(surface).toContain("const shouldUseBlurFallback = variant !== 'nav' || Platform.OS !== 'web'")
    expect(surface).toContain('!reduceTransparency && shouldUseBlurFallback')
  })

  it('wires Reduce Motion and accessibility states into shared glass controls', () => {
    const accessibility = read('components/ui/accessibility-motion.ts')
    const pressable = read('components/ui/glass-pressable.tsx')
    const tabBar = read('components/ui/floating-glass-tab-bar.tsx')
    const sheet = read('components/ui/glass-modal-sheet.tsx')
    const reduceMotion = read('components/ui/reduce-motion-aware-animation.ts')
    const customerShell = read('components/customer/customer-surfaces.tsx')
    const workerShell = read('components/worker/worker-surfaces.tsx')
    const bookingRoute = read('app/(customer)/booking.tsx')
    expect(accessibility).toContain('isReduceMotionEnabled')
    expect(accessibility).toContain('isReduceTransparencyEnabled')
    expect(pressable).toContain("accessibilityRole = 'button'")
    expect(pressable).toContain('accessibilityState?: AccessibilityState')
    expect(pressable).toContain('accessibilityState={accessibilityState ?? { disabled, selected: active }}')
    expect(pressable).toContain("material = 'standard'")
    expect(pressable).toContain('createGlassSurfaceStyle({ material, mode, reduceTransparency, variant })')
    expect(pressable).toContain('reduceMotionAwarePressStyle(pressed, reduceMotion)')
    expect(sheet).toContain("material = 'standard'")
    expect(sheet).toContain('<GlassSurface material={material} mode={mode}')
    expect(tabBar).toContain('accessibilityRole="tab"')
    expect(tabBar).toContain('accessibilityState={{ selected: focused }}')
    expect(tabBar).toContain("material = 'standard'")
    expect(tabBar).toContain("const liquidMaterial = material === 'liquid'")
    expect(tabBar).toContain('liquidMaterial={liquidMaterial}')
    expect(tabBar).toContain('styles.labelInactiveLiquid')
    expect(tabBar).toContain("import { color, typography } from '@/design/theme'")
    expect(tabBar).toContain('fontWeight: typography.caption.fontWeight')
    expect(tabBar).not.toContain("fontWeight: '800'")
    expect(tabBar).not.toContain("fontWeight: '900'")
    expect(tabBar).toContain('withTiming(1.04, { duration: 155 })')
    expect(tabBar).toContain('withTiming(reduceTransparency ? 0.48 : 0.90, { duration: 80 })')
    expect(tabBar).toContain('withTiming(reduceTransparency ? 0.56 : 0.92, { duration: 70 })')
    expect(tabBar).toContain('withSpring(1.18, motionTokens.liquid.pill)')
    expect(tabBar).toContain('withTiming(0.92, { duration: 190 })')
    expect(tabBar).toContain('<GlassSurface')
    expect(tabBar).toContain('material={material}')
    expect(tabBar).toContain('reduceMotionAwarePressStyle(pressed, reduceMotion)')
    expect(tabBar).toContain('liquid-toolbar-selection-${item.key}')
    expect(tabBar).toContain('activeKey: Key | null')
    expect(tabBar).toContain('previousKey?: Key | null')
    expect(tabBar).toContain('const hasDisplayActive = displayActiveKey !== null')
    expect(tabBar).toContain('activeKey === null')
    expect(tabBar).toContain('focused={displayActiveKey !== null && item.key === displayActiveKey}')
    expect(tabBar).toContain('testID="liquid-toolbar-bridge"')
    expect(tabBar).toContain('testID="liquid-toolbar-directional-head"')
    expect(tabBar).toContain('testID="liquid-toolbar-travel-pill"')
    expect(tabBar).toContain('testID="liquid-toolbar-depth"')
    expect(tabBar).toContain('testID="liquid-toolbar-rim"')
    expect(tabBar).toContain('testID="liquid-toolbar-specular-sheen"')
    expect(tabBar).toContain("appearance?: 'signature' | 'appleLiquid'")
    expect(tabBar).toContain('testID="liquid-toolbar-apple-material"')
    expect(tabBar).toContain('testID="liquid-toolbar-segmented-control"')
    expect(tabBar).toContain('testID="liquid-toolbar-slider-thumb"')
    expect(tabBar).toContain('testID="liquid-toolbar-mint-aura"')
    expect(tabBar).toContain('appleLiquidPillLensStyle')
    expect(tabBar).toContain('appleLiquidPillAuraStyle')
    expect(tabBar).toContain('appleSegmentDividerStyle')
    expect(tabBar).toContain('const transitionVisibilityMs = appleLiquidAppearance ? 420 : 560')
    expect(tabBar).toContain('const optimisticTransitionMs = appleLiquidAppearance ? 470 : 620')
    expect(tabBar).toContain('Math.min(travelOpacity.value * 0.68, 0.48)')
    expect(tabBar).toContain('function liquidDockSpecularSheenStyle')
    expect(tabBar).toContain('const transitionDirection = activeIndex >= previousIndex ? 1 : -1')
    expect(tabBar).toContain('liquidBridgeSurfaceStyle(mode, reduceTransparency, transitionDirection, appearance)')
    expect(tabBar).toContain('liquidBridgeHeadStyle(mode, reduceTransparency, transitionDirection)')
    expect(tabBar).toContain("rgba(122,238,219,0.19)")
    expect(tabBar).toContain("rgba(58,230,202,0.22)")
    expect(tabBar).toContain("rgba(128,244,222,0.46)")
    expect(tabBar).toContain("rgba(255,255,255,0.98)")
    expect(tabBar).toContain('const LIQUID_PILL_ICON_CENTER_TOP = -1')
    expect(tabBar).toContain('top: LIQUID_PILL_ICON_CENTER_TOP')
    expect(tabBar).toContain('styles.liquidBridge')
    expect(tabBar).toContain('liquidDockDepthStyle')
    expect(tabBar).toContain('liquidDockRimStyle')
    expect(tabBar).toContain('liquidPillKeylineStyle')
    expect(tabBar).toContain('liquidPillFloorStyle')
    expect(tabBar).toContain('styles.liquidPillKeyline')
    expect(tabBar).toContain('styles.liquidPillFloor')
    expect(tabBar).toContain('liquidBridgeGlow')
    expect(tabBar).toContain('bridgeOpacity')
    expect(tabBar).not.toContain('iconLuma:')
    expect(tabBar).toContain('liquid-toolbar-icon-pop-${item.key}')
    expect(tabBar).toContain('liquid-toolbar-icon-luma-${item.key}')
    expect(tabBar).toContain('iconStageFocused')
    expect(tabBar).toContain('travelProgress.value')
    expect(tabBar).toContain('pillScaleX.value = 0.68')
    expect(tabBar).toContain('pillScaleY.value = 1.08')
    expect(tabBar).toContain('{ scaleX: pillScaleX.value }')
    expect(tabBar).toContain('{ scaleY: pillScaleY.value }')
    expect(tabBar).toContain('cancelAnimation(travelProgress)')
    expect(tabBar).toContain('cancelAnimation(travelOpacity)')
    expect(tabBar).toContain('cancelAnimation(pillScaleX)')
    expect(tabBar).toContain('cancelAnimation(pillScaleY)')
    expect(read('app/(worker)/_layout.tsx')).toContain('<WorkerRebuildDockOverlay active={activeDock} />')
    expect(customerShell).toContain('onPress={() => router.replace(item.route as never)}')
    expect(customerShell).toContain('router.replace(customerKaelWorkRoute as never)')
    expect(customerShell).not.toContain("router.replace('/(customer)/kael' as never)")
    expect(workerShell).not.toContain('push(item.path)')
    expect(customerShell).not.toContain('push(item.route')
    expect(customerShell).not.toContain('setTimeout(() => router.replace(item.route as never)')
    expect(tabBar).toContain('onLayout')
    expect(tabBar).toContain('barWidth > 0')
    expect(tabBar).toContain('liquidPillBaseStyle')
    expect(tabBar).toContain("liquidPillFill(mode, reduceTransparency, 'settled', appearance)")
    expect(tabBar).toContain('if (reduceTransparency)')
    expect(tabBar).toContain('styles.liquidTrail')
    expect(tabBar).toContain('width: 61')
    expect(reduceMotion).toContain('if (!pressed || reduceMotion) return null')
    expect(reduceMotion).toContain('export function ReduceMotionAwareEntranceView')
    expect(reduceMotion).toContain("from 'react-native-reanimated'")
    expect(reduceMotion).toContain("Platform.OS !== 'web'")
    expect(reduceMotion).toContain('useSharedValue')
    expect(reduceMotion).toContain('withTiming(1, { duration })')
    expect(reduceMotion).toContain('withSpring(0')
    expect(reduceMotion).toContain('withDelay(delayMs')
    expect(reduceMotion).toContain('cancelAnimation')
    expect(reduceMotion).toContain('motionDuration(motionTokens.entrance.durationMs, reduceMotion)')
    expect(customerShell).toContain('testID="customer-v21-home-hero"')
    expect(customerShell).toContain('testID="customer-v21-dock-lens"')
    expect(workerShell).toContain('testID="worker-v5-primary-action"')
    expect(workerShell).toContain('testID="worker-v5-page-mint-aura"')
    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(read('components/auth/entry-access/components/materials.tsx')).toContain('pressed: { opacity: 0.94, transform')
    expect(workerShell).toContain('pressed && !disabled ? styles.pressed : null')
    expect(read('components/auth/auth-surfaces.tsx')).not.toContain('pressed: { opacity: 0.78, transform')
    expect(workerShell).not.toContain('pressed: { opacity: 0.78, transform')
  })

  it('lets visual primary buttons avoid false selected accessibility state', () => {
    const worker = read('components/worker/worker-surfaces.tsx')
    const primitives = read('components/ui/kael-primitives.tsx')
    expect(worker).not.toContain('active={!secondary}')
    expect(worker).toContain('testID="worker-v5-primary-action"')
    expect(worker).toContain('accessibilityState={{ disabled }}')
    expect(worker).not.toContain('accessibilityState={{ selected: !disabled }}')
    expect(primitives).toContain('accessibilityState?: AccessibilityState')
    expect(primitives).toContain('busy: accessibilityState?.busy ?? loading')
    expect(primitives).toContain('disabled: accessibilityState?.disabled ?? isDisabled')
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
// Client intake production UI - customer Yêu c?u A2-A5 slice
// ===================================================================

describe('client price check production UI', () => {
  const bookingRoute = read('app/(customer)/booking.tsx')
  const productionComponentPath = 'components/client-price-check/client-price-check-flow.tsx'

  if (!exists(productionComponentPath)) {
    it('removes the legacy client price-check flow after the booking wizard becomes the primary booking route', () => {
      const customerShell = read('components/customer/customer-surfaces.tsx')
      const wizard = read('components/customer/booking-wizard.tsx')
      expect(exists(productionComponentPath)).toBe(false)
      expect(bookingRoute).toContain('CustomerBookingEntrySurface')
      expect(bookingRoute).toContain('@/components/customer/customer-surfaces')
      expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
      expect(customerShell).not.toContain('ClientPriceCheckFlow')
      expect(customerShell).toContain('testID="customer-v21-services"')
      expect(customerShell).toContain('testID="customer-v21-booking-address"')
      expect(customerShell).toContain('testID="customer-v21-booking-description"')
      expect(customerShell).toContain('testID="customer-v21-booking-submit"')
      expect(customerShell).toContain('router.replace(customerKaelWorkRoute as never)')
      expect(customerShell).toContain('setPendingKaelChatDraft')
      expect(customerShell).toContain("source: 'booking'")
      expect(wizard).toContain('export function BookingWizard')
      expect(wizard).toContain('setPendingKaelChatDraft')
      expect(wizard).toContain('onOpenKael(state.serviceType)')
      expect(wizard).not.toContain('actions.createRemoteJobFromDraft')
      expect(wizard).not.toContain('actions.confirmRemoteSearch')
    })
    return
  }

  it('keeps the legacy production price-check component on disk but off the primary booking route', () => {
    expect(exists(productionComponentPath)).toBe(true)
    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(bookingRoute).toContain('@/components/customer/customer-surfaces')
    expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
    expect(bookingRoute).not.toContain('@/components/client-price-check/client-price-check-flow')
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
    expect(component).toContain("import { color, typography } from '@/design/theme'")
    expect(component).toContain("fontWeight: '700'")
    expect(component).toContain("fontWeight: '600'")
    expect(component).not.toContain("fontWeight: '800'")
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
    expect(component).not.toContain("description: '? c?m")
    expect(component).not.toContain("problemChips: ['? c?m")
    expect(component).not.toContain("addressLabel: 'Can h?")
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
    expect(component).toContain('KI?M GIÁ')
    expect(component).not.toContain('KIEM GIA')
    expect(component).not.toContain('LU?NG V4')
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
    expect(component).toContain('H?y yêu c?u')
    expect(component).toContain('secondaryLabelForStep')
    expect(component).toContain('Chảnh yêu c?u')
    expect(component).toContain('V? trang ch?')
    expect(component).toContain('workflowDraftSyncKey')
    expect(component).toContain('skipNextWorkflowDraftSyncRef')
    expect(component).toContain('manualErrorMessage')
    expect(component).toContain('C?n quy?n thu vi?n ảnh/video')
    expect(component).toContain('draftFromWorkflow(workflowState.deal?.draft)')
    expect(component).toContain("selectors.currentStatus !== 'draft' || step !== 'emptyWorker'")
    expect(component).toContain('Ch? Kael u?c tính')
    expect(component).not.toContain('S?p m? cho l?ch ' + 'h?n')
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
  const kaelChatParts = read('components/customer/kael-chat/agentic-parts.tsx')
  const adminDashboard = read('app/(admin)/dashboard.tsx')
  const appLanguageStore = read('lib/app-language.ts')
  const apiTypes = read('lib/api-types.ts')
  const frontendWorkflowProvider = read('lib/frontend-workflow-provider.tsx')
  const edgeRouter = readSource(resolve(MOBILE_ROOT, '../../supabase/functions/mobile-api/_shared/router.ts'))
  const edgeServices = readSource(resolve(MOBILE_ROOT, '../../supabase/functions/mobile-api/_shared/services.ts'))
  const sharedApiTypes = readSource(resolve(__dirname, '../types/api-responses.ts'))

  it('uses one shared app language store with matching VI/EN dictionary keys', () => {
    expect(appLanguageStore).toContain('APP_LANGUAGE_STORAGE_KEY')
    expect(appLanguageStore).toContain("APP_LANGUAGE_STORAGE_KEY = 'nestscout.app.language.production'")
    expect(appLanguageStore).toContain('home-services.app.language.production')
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

    expect(appLanguageStore).not.toContain('Chua có d? li?u th?t')
    expect(appLanguageStore).not.toContain('No real data yet')
    expect(appLanguageStore).not.toContain('Yêu c?u th?t')
    expect(appLanguageStore).not.toContain('Real request')
    expect(appLanguageStore).toContain("if (language === 'vi' && !nonAsciiPattern.test(problem)) return appCopy.vi.common.unknown")
    expect(appLanguageStore).toContain("if (language === 'en' && nonAsciiPattern.test(problem)) return appCopy.en.common.unknown")
  })

  it('localizes workflow provider errors before they reach customer or worker UI', () => {
    const provider = read('lib/frontend-workflow-provider.tsx')
    expect(provider).toContain("import { useAppLanguage, type AppLanguage } from './app-language'")
    expect(provider).toContain('workflowErrorCopy')
    expect(provider).toContain('localizeWorkflowError(error, language)')
    expect(provider).toContain('hydrateRemoteJobById')
    expect(provider).toContain('dispatch({ type: \'hydrate_remote_job\', job: jobDetailToSnapshot(result.data, role ===')
    expect(provider).toContain('Could not update the request. Try again.')
    expect(provider).toContain("if (language === 'en' && !asciiOnlyPattern.test(error)) return workflowErrorCopy.en.fallback")
    expect(provider).toContain("if (language === 'vi' && asciiOnlyPattern.test(error)) return workflowErrorCopy.vi.fallback")
    expect(provider).toContain('const mediaError = localizeWorkflowError(uploaded.error, language)')
  })

  it('routes worker V5 scope evidence fields through the Kael text-field primitive', () => {
    expect(workerShell).toContain("from '@/components/ui/kael-primitives'")
    expect(workerShell).toContain('KaelTextField')
    expect(workerShell).toContain('function WorkerV5ScopeEvidenceGate')
    expect(workerShell).toContain('<KaelTextField')
    expect(workerShell).not.toContain('<TextInput')

    for (const testID of [
      'worker-scope-change-new-description-input',
      'worker-scope-change-reason-input',
      'worker-scope-change-confirm-submit',
      'worker-scope-change-add-photo',
    ]) {
      expect(workerShell).toContain(`testID="${testID}"`)
    }
  })

  it('routes worker JobRoom and private Kael inputs through the Kael text-field primitive', () => {
    expect(workerShell).toContain('function WorkerV5PrivateKaelChat')
    expect(workerShell).toContain('testID="worker-v5-composer-shell"')
    expect(workerShell).toContain('function WorkerV5PrivateKaelChat')
    expect(workerShell).toContain('<KaelTextField')
    expect(workerShell).not.toContain('<TextInput')

    for (const testID of [
      'worker-v5-composer-placeholder',
      'worker-kael-chat-attach',
      'worker-kael-chat-input',
      'worker-kael-send-button',
    ]) {
      expect(workerShell).toContain(`testID="${testID}"`)
    }
    expect(workerShell).toContain("testID={feedbackOpen ? 'worker-kael-feedback-submit' : 'worker-kael-feedback-open'}")
  })

  it('keeps worker Kael feedback available without enabling training consent from chat', () => {
    expect(workerShell).toContain("'worker-kael-feedback-submit' : 'worker-kael-feedback-open'")
    expect(workerShell).toContain('workerKaelChatService.submitFeedback')
    expect(workerShell).toContain('No training consent was enabled automatically.')
    expect(workerShell).toContain('This chat did not enable training consent.')
    expect(workerShell).not.toContain('testID="worker-kael-training-consent-toggle"')
    expect(workerShell).not.toContain('workerKaelTrainingConsentLabel')
    expect(workerShell).not.toContain('onToggleConsent')
  })

  it('routes customer booking and Kael composer fields through the Kael text-field primitive', () => {
    expect(customerShell).toContain("from '@/components/ui/kael-primitives'")
    expect(customerShell).toContain('KaelButton')
    expect(customerShell).toContain('KaelTextField')
    expect(customerShell).toContain('testID="customer-v21-booking-address"')
    expect(customerShell).toContain('testID="customer-v21-booking-description"')
    expect(customerShell).toContain('testID="customer-v21-kael-input"')
    expect(customerShell).toContain('<KaelTextField')
    expect(customerShell).not.toContain('<TextInput')

    for (const testID of [
      'customer-v21-booking-address',
      'customer-v21-booking-description',
      'customer-v21-booking-submit',
      'customer-v21-kael-input',
      'customer-v21-kael-send',
    ]) {
      expect(customerShell).toContain(`testID="${testID}"`)
    }
  })

  it('routes production composer and admin note inputs through the Kael text-field primitive', () => {
    expect(customerShell).toContain('customer-v21-booking-address')
    expect(customerShell).toContain('customer-v21-booking-description')
    expect(customerShell).toContain('customer-v21-kael-input')
    expect(customerShell).toContain('bookingInlineTextFieldShell')
    expect(customerShell).toContain('bookingDescriptionInputShell')
    expect(customerShell).toContain('composerTextFieldShell')
    expect(customerShell).not.toContain('<TextInput')

    expect(workerShell).toContain('worker-kael-chat-input')
    expect(workerShell).toContain('worker-v5-composer-placeholder')
    expect(workerShell).toContain('workerChatTextFieldShell')
    expect(workerShell).not.toContain('<TextInput')

    expect(kaelChatParts).toContain("import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'")
    expect(kaelChatParts).toContain('customer-kael-chat-input')
    expect(kaelChatParts).toContain('composerTextFieldShell')
    expect(kaelChatParts).not.toContain('<TextInput')

    expect(adminDashboard).toContain("import { KaelTextField } from '@/components/ui/kael-primitives'")
    expect(adminDashboard).toContain("import { typography } from '@/design/theme'")
    expect(adminDashboard).toContain('admin-learning-reason-')
    expect(adminDashboard).toContain('reasonInputShell')
    expect(adminDashboard).not.toContain('<TextInput')
    expect(adminDashboard).not.toContain("fontWeight: '800'")
    expect(adminDashboard).not.toContain("fontWeight: '900'")
  })

  it('covers the Component System status and utility primitives in gallery and production badge slots', () => {
    const designGallery = read('app/design-gallery.tsx')
    const primitives = read('components/ui/kael-primitives.tsx')
    const workerShell = read('components/worker/worker-surfaces.tsx')

    for (const exportName of ['KaelSwitch', 'KaelBadge', 'KaelProgressPill', 'KaelRatingCapsule', 'KaelAlertBadge']) {
      expect(primitives).toContain(`export function ${exportName}`)
      expect(designGallery).toContain(exportName)
    }

    expect(designGallery).toContain('design-gallery-switch-large')
    expect(designGallery).toContain('design-gallery-progress-pill')
    expect(designGallery).toContain('design-gallery-rating-capsule')
    expect(designGallery).toContain('design-gallery-alert-badge')
    expect(designGallery).not.toContain("fontWeight: '800'")
    expect(designGallery).not.toContain("fontWeight: '900'")
    expect(customerShell).toContain('KaelButton')
    expect(customerShell).toContain('KaelChip')
    expect(customerShell).toContain('KaelTextField')
    expect(customerShell).toContain('testID="customer-v21-booking-submit"')
    expect(workerShell).toContain('KaelTextField')
    expect(workerShell).toContain('MintAura')
    expect(workerShell).toContain('testID="worker-v5-primary-action"')
  })

  it('uses the trusted Aurora Nest brand assets and official Kael Orb image asset', () => {
    const designGallery = read('app/design-gallery.tsx')
    const authSurface = read('components/auth/auth-surfaces.tsx')
    const entryFlow = read('components/auth/entry-access/EntryBrandAccessFlow.tsx')
    const rebuildSurfaces = read('components/rebuild/rebuild-surfaces.tsx')

    expect(exists('assets/nestscout-logo-mark.png')).toBe(true)
    expect(exists('assets/nestscout-logo-lockup.png')).toBe(false)
    expect(exists('assets/nestscout-aurora-nest-appstore-1024.png')).toBe(true)
    expect(exists('assets/lottie/nestscout-aurora-nest-north-star-awakening.json')).toBe(true)
    expect(sha256('assets/nestscout-aurora-nest-appstore-1024.png')).toBe('9be597c043f2994541fc94e24c117dcabc8ad48611e7c6ab99caa44124c7d785')
    expect(sha256('assets/lottie/nestscout-aurora-nest-north-star-awakening.json')).toBe('9ffc061488ae28fa5a52d341d738dfd3af8b8e2967864c9a9f1ce16e0443f4c6')
    expect(authSurface).toContain('NestScout_AuroraNest_Logo_Lottie_Code_v1_0_AGENT_HANDOFF.zip')
    expect(authSurface).toContain('NestScout_AuroraNest_Logo_Images_v1_0_APPSTORE_READY.zip')
    expect(entryFlow).toContain("require('@/assets/lottie/nestscout-aurora-nest-north-star-awakening.json')")
    expect(entryFlow).toContain("require('@/assets/nestscout-aurora-nest-appstore-1024.png')")
    expect(entryFlow).toContain('KaelLottieView')
    expect(entryFlow).toContain('kaelLottieRendererKind')
    expect(entryFlow).not.toContain("require('@/assets/lottie/nestscout-aurora-logo.json')")
    expect(entryFlow).toContain('auth-welcome-nestscout-logo')
    expect(authSurface).not.toContain('<Text style={styles.welcomeBrandMarkText}>K</Text>')
    expect(designGallery).toContain("const nestScoutLogoMark = require('../assets/nestscout-logo-mark.png')")
    expect(designGallery).toContain('design-gallery-nestscout-logo-mark')
    expect(designGallery).not.toContain('design-gallery-kael-orb-logo')

    expect(rebuildSurfaces).toContain("const kaelOrbGlyph = require('@/assets/kael-orb-glyph.png')")
    expect(rebuildSurfaces).toContain('customer-dock-kael-orb-icon')
    expect(rebuildSurfaces).not.toContain('customer-dock-kael-mascot')

    expect(rebuildSurfaces).toContain('worker-dock-kael-orb-icon')
    expect(rebuildSurfaces).toContain('worker-dock-kael-action-glass')
    expect(rebuildSurfaces).not.toContain('worker-dock-kael-mascot-icon')

    expect(designGallery).toContain("const kaelOrbIcon = require('../assets/kael-orb-icon.png')")
    expect(designGallery).toContain('design-gallery-kael-orb-icon')
    expect(designGallery).not.toContain('<Text style={styles.kaelOrbText}>K</Text>')
  })

  it('uses cropped official Kael mascot state and emotion assets from the handoff board', () => {
    const designGallery = read('app/design-gallery.tsx')
    const mascotAssets = read('components/kael/kael-mascot-assets.ts')
    const mascotComponent = read('components/kael/kael-mascot.tsx')
    const states = [
      'welcome',
      'listening',
      'thinking',
      'analyzing',
      'processing',
      'understood',
      'proposing',
      'success',
      'warning',
      'error',
      'typing',
      'recording',
      'fileReview',
      'locationMap',
      'findingWorker',
      'priceCheck',
      'compareOptions',
      'report',
      'reminder',
      'miniCelebration',
    ]
    const emotions = ['happy', 'focused', 'surprised', 'curious', 'confident', 'concerned', 'confused', 'disappointed', 'angry', 'tired']

    for (const state of states) {
      expect(exists(`assets/kael-states/kael-state-${state}.png`)).toBe(true)
      expect(mascotAssets).toContain(`kael-state-${state}.png`)
    }
    for (const emotion of emotions) {
      expect(exists(`assets/kael-emotions/kael-emotion-${emotion}.png`)).toBe(true)
      expect(mascotAssets).toContain(`kael-emotion-${emotion}.png`)
    }

    expect(mascotAssets).toContain('const stateAssets: Record<KaelMascotState, number>')
    expect(mascotAssets).toContain('const emotionAssets: Record<KaelMascotEmotion, number>')
    expect(mascotAssets).not.toContain('kael-model-8a.png')
    expect(mascotAssets).not.toContain('kael-model-8a-head.png')
    expect(mascotAssets).not.toContain('const stateAssets: Partial<Record<KaelMascotState, unknown>> = {}')
    expect(mascotAssets).not.toContain('const emotionAssets: Partial<Record<KaelMascotEmotion, unknown>> = {}')
    expect(mascotComponent).not.toContain('showFallbackBadge')
    expect(mascotComponent).not.toContain('fallback asset')
    expect(mascotComponent).not.toContain('Asset tạm')
    expect(designGallery).toContain("import { KAEL_CONTEXTUAL_STATES, KAEL_CORE_STATES, KAEL_EMOTIONS } from '@/components/kael/kael-mascot-assets'")
    expect(designGallery).toContain('const galleryMascotStates = [...KAEL_CORE_STATES, ...KAEL_CONTEXTUAL_STATES] as const')
    expect(designGallery).toContain('KAEL_EMOTIONS.map')
  })

  it('does not ship hardcoded customer identity, profile, or completed payment data', () => {
    expect(customerShell).not.toContain('Phan Mảnh Tú')
    expect(customerShell).not.toContain('PaymentMode')
    expect(customerShell).not.toContain('customer-home-payment-section')
    expect(customerShell).not.toContain('Có dữ liệu thật')
    expect(customerShell).not.toContain('5.0')
    expect(customerShell).toContain('paymentStatusLabel')
    expect(customerShell).toContain('customerV21CommonCopy[language].paymentLocked')
    expect(customerShell).not.toContain('paid_success')
    expect(customerShell).not.toContain('Ổ cắm nóng')
    expect(customerShell).not.toContain('Dây lỏng')
    expect(customerShell).not.toContain('Đúng giờ')
    expect(customerShell).not.toContain('Rõ giá')
    expect(customerShell).not.toContain('Giải thích rõ')
    expect(customerShell).not.toContain('Thợ đang đến')
    expect(customerShell).not.toContain('Đang sửa')
    expect(customerShell).not.toContain('Gửi ảnh')
    expect(customerShell).not.toContain('Bỏ qua ảnh')
    expect(customerShell).not.toContain('Sửa nội dung')
    expect(customerShell).not.toContain('Các trạng thái')
    expect(customerShell).toContain('CompletionStateSummary')
    expect(customerShell).toContain('ActivityStatusPanel')
    expect(customerShell).toContain('ActivityStatusPanel')
    expect(customerShell).toContain('screenIdsForStatus')
    expect(customerShell).toContain('customerV21StatusCopy[language][deal.status]')
    expect(customerShell).toContain('testID="customer-v21-chat-tab-case-work"')
    expect(customerShell).not.toContain('confirmCompletionReceived')
    expect(customerShell).not.toContain('Kael kiểm chứng hoàn tất?')
    expect(customerShell).toContain('customer-v21-payment-review-kael-card')
    expect(customerShell).toContain('customer-v21-payment-protected-kael-card')
    expect(customerShell).toContain("payment?.status ? paymentStatus : customerV21CommonCopy[language].paymentLocked")
    expect(customerShell).toContain('routeJobId')
    expect(customerShell).toContain('workflow.actions.hydrateRemoteJobById(routeJobId)')
    expect(customerShell).toContain('decideScopeChange')
    expect(customerShell).not.toContain('Worker đã nhận địa chỉ')
    expect(customerShell).toContain('Alert.alert')
    expect(customerShell).toContain('function paymentAmountLabel')
    expect(customerShell).toContain('const amount = payment?.grossAmount ?? payment?.amountReceived')
    expect(customerShell).toContain('if (typeof amount === \'number\') return formatVnd(amount, language)')
    expect(customerShell).toContain('const status = payment?.status ? paymentStatusLabel(payment.status, language) : copy.dataPending')
    expect(customerShell).toContain('testID="customer-v21-payment-review-details"')
    expect(customerShell).toContain('testID="customer-v21-completion-state"')
    expect(customerShell).toContain('value={formatKnownCount(deal.completionPhotoUrls?.length, language)}')
    expect(customerShell).toContain('value={deal.completionNotes?.trim() || customerV21CommonCopy[language].dataPending}')
    expect(customerShell).toContain('testID="customer-v21-profile-hero"')
    expect(customerShell).toContain('testID="customer-v21-profile-ranking"')
    expect(customerShell).toContain('copy.emptyProfileMetric')
    expect(customerShell).not.toContain("deal ? statusLabel(deal.status) : 'S?n sàng'")
    expect(customerShell).not.toContain('V4Metric label="D? li?u" value="Local"')
  })

  it('does not ship hardcoded worker request, rating, or earning values', () => {
    expect(workerShell).toContain('testID="worker-v5-screen-1.1-worker-home"')
    expect(workerShell).toContain('testID="worker-v5-earnings-hero"')
    expect(workerShell).toContain('workerEarnings')
    expect(workerShell).toContain('workerPerformanceInsights')
    expect(workerShell).toContain('localizedServiceLabel')
    expect(workerShell).toContain('formatVnd')
    expect(workerShell).toContain('profile?.rating')
    expect(workerShell).toContain('score != null')
    expect(workerShell).toContain('No real opportunity or work is available for Kael ranking')
    expect(workerShell).toContain('No matching opportunity in the current state')
    expect(workerShell).not.toContain('320k')
    expect(workerShell).not.toContain('4.8tr')
    expect(workerShell).not.toContain('520.000')
    expect(workerShell).not.toContain('00:42')
    expect(workerShell).not.toContain('district-7-him-lam')
    expect(workerShell).not.toContain('Electrical/water worker profile')
  })

  it('gates worker local deal privacy and status actions through the shared workflow', () => {
    expect(workerShell).toContain('useFrontendWorkflow')
    expect(workerShell).toContain('const deal = runtime.state.deal')
    expect(workerShell).toContain('function canShowWorkerAddress')
    expect(workerShell).toContain('function routeDestinationLabel')
    expect(workerShell).toContain('deal.broadcast?.generalArea')
    expect(workerShell).toContain('deal.draft.addressLabel || deal.draft.districtLabel')
    expect(workerShell).not.toContain('1 ' + 'local')
    const workflow = readSource(resolve(__dirname, '../mobile-workflow.ts'))
    expect(workflow).toContain("broadcast?.status === 'accepted'")
    expect(workflow).toContain("state.workerGate === 'local_deal_audit'")
    expect(workflow).toContain("status: 'expired'")
    expect(workflow).toContain('canReplaceLocalDeal')
    expect(workflow).toContain('hasSpecificWorkerRouteAddress')
    const provider = read('lib/frontend-workflow-provider.tsx')
    expect(provider).toContain('hasSpecificWorkerRouteAddress')
    expect(provider).toContain('formatReleasedFullAddress')
    expect(workerShell).toContain('getWorkerV5ChatJobId')
    expect(workerShell).toContain('const jobId = getWorkerV5ChatJobId(deal)')
    expect(workerShell).toContain('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')
    expect(workerShell).toContain('workerKaelChatService.streamTurn')
    expect(workerShell).not.toContain('useJobChatThread(workerChatJobId, chatCanRead)')
    expect(workerShell).not.toContain('messages={jobChat.messages}')
    expect(workerShell).not.toContain('const sent = await jobChat.send(draft)')
    expect(workerShell).not.toContain('isWorkflowJobChatReadable(chatPhase)')
    expect(workerShell).not.toContain('isWorkflowJobChatSendable(chatPhase)')
    expect(workerShell).not.toContain('const chatCanRead = Boolean(workerChatJobId && chatPhase && isWorkflowJobChatReadable(chatPhase))')
    expect(workerShell).not.toContain('const chatCanSend = Boolean(chatCanRead && chatPhase && isWorkflowJobChatSendable(chatPhase))')
    expect(workerShell).not.toContain('const chatLockedReason = !workerChatJobId || !chatCanRead')
    expect(workerShell).toContain('runtime.actions.workerAcceptBroadcast')
    expect(workerShell).toContain("runtime.actions.workerUpdateStatus('worker_on_way')")
    expect(workerShell).toContain("runtime.actions.workerUpdateStatus('arrived')")
    expect(workerShell).toContain("case '2.10-completion-evidence'")
    expect(workerShell).toContain('testID="worker-v5-completion-submit-action"')
    expect(workerShell).toContain('runtime.actions.requestScopeChange')
    expect(workerShell).toContain('uploadJobMediaDrafts(jobId, scopeMediaDrafts, \'scope_change_evidence\')')
    expect(workerShell).toContain('Submit completion artifact')
    expect(workerShell).not.toContain('Accepted work is required to open JobRoom.')
    expect(workerShell).toContain('Chat is read-only after the payment gate.')
    expect(workerShell).toContain('localizedWorkerBriefLines')
    expect(workerShell).toContain('function localizedWorkerBriefLines')
    expect(workerShell).toContain("if (language === 'en') return !hasVietnameseText")
    expect(workerShell).not.toContain('worker-final-price-input')
    expect(workerShell).toContain('uploadJobMediaDrafts')
    expect(workerShell).toContain('worker-scope-change-new-description-input')
    expect(workerShell).toContain('worker-scope-change-reason-input')
    expect(workerShell).toContain('worker-scope-change-confirm-submit')
    expect(workerShell).not.toContain('completion_photo_urls: []')
    expect(workerShell).toContain('worker-v5-primary-action')
    expect(workerShell).toContain('Phạm vi hiện tại')
    expect(workerShell).toContain('Khoảng giá')
  })

  it('keeps mobile API response contracts aligned with PR#12 worker endpoints without wiring UI mutations', () => {
    expect(apiTypes).toContain('export type BroadcastListResponse = WorkerBroadcastsResponse')
    expect(apiTypes).toContain('export type JobDetailResponse = {')
    expect(apiTypes).toContain('job: {')
    expect(apiTypes).toContain('kael_price_min: number | null')
    expect(apiTypes).toContain('completion_photo_urls: string[]')
    expect(apiTypes).not.toContain('estimate_price_min')
    expect(apiTypes).toContain('export type AvailabilityToggleResponse = WorkerAvailabilityResponse')
    expect(apiTypes).toContain('export type WorkerJobListResponse')
    expect(apiTypes).toContain('export type EarningsResponse')
    expect(apiTypes).toContain('export type WorkerScopeChangeResponse')
    expect(apiTypes).toContain('export type CustomerScopeDecisionResponse')
    expect(apiTypes).toContain('ScopeChangeStatus')
    expect(apiTypes).toContain('daily_earnings: {')
    expect(apiTypes).toContain('paid_job_count: number')
    expect(apiTypes).toContain('from_date: string | null')
    expect(apiTypes).toContain('to_date: string | null')
    expect(apiTypes).toContain('service_radius_km: number | null')
    expect(sharedApiTypes).toContain('service_radius_km: number | null')
    expect(edgeRouter).toContain('service_radius_km: number | null')
    expect(edgeServices).toContain('service_radius_km: null')
    expect(apiTypes).toContain("| 'collecting_evidence'")
    expect(sharedApiTypes).toContain("| 'collecting_evidence'")
    expect(edgeRouter).toContain('kind: "kael.chat.evidence"')
    expect(edgeRouter).toContain('kaelChatEvidenceSchema.safeParse')
    expect(edgeServices).toContain('async function submitKaelChatEvidence')
    expect(edgeServices).toContain('status: "collecting_evidence"')
    expect(apiTypes).toContain('export type DeclineBroadcastResponse')
    const createJobResponse = apiTypes.slice(apiTypes.indexOf('export type CreateJobResponse'), apiTypes.indexOf('export type KaelChatStatus'))
    expect(createJobResponse).toContain('final_price?: number | null')
    const sharedCreateJobResponse = sharedApiTypes.slice(sharedApiTypes.indexOf('export type CreateJobResponse'), sharedApiTypes.indexOf('export type KaelChatStatus'))
    expect(sharedCreateJobResponse).toContain('final_price?: number | null')
    const workerJobListResponse = apiTypes.slice(apiTypes.indexOf('export type WorkerJobListResponse'), apiTypes.indexOf('export type EarningsResponse'))
    expect(workerJobListResponse).toContain('completion_notes: string | null')
    expect(workerJobListResponse).toContain('completion_photo_urls: string[]')
    expect(workerJobListResponse).toContain('worker_brief_guidance?: Record<string, unknown> | null')
    const sharedWorkerJobListResponse = sharedApiTypes.slice(sharedApiTypes.indexOf('export type WorkerJobListResponse'), sharedApiTypes.indexOf('export type EarningsResponse'))
    expect(sharedWorkerJobListResponse).toContain('completion_notes: string | null')
    expect(sharedWorkerJobListResponse).toContain('completion_photo_urls: string[]')
  })

  it('keeps provider snapshots aligned to Edge artifacts without giving UI workflow authority', () => {
    expect(frontendWorkflowProvider).toContain('jobDetailToSnapshot(result.data, role ===')
    expect(frontendWorkflowProvider).toContain('workerBriefLinesFromRecord(broadcast.worker_brief_core)')
    expect(frontendWorkflowProvider).toContain('workerBriefLinesFromRecord(job.worker_brief_guidance)')
    expect(frontendWorkflowProvider).toContain('completionPhotoUrls: job.completion_photo_urls')
    expect(frontendWorkflowProvider).toContain('completionNotes: job.completion_notes')
    expect(frontendWorkflowProvider).toContain('finalPrice: data.final_price ?? null')
    expect(frontendWorkflowProvider).not.toContain('finalPrice: data.status ===')
    expect(frontendWorkflowProvider).toContain('estimatedPriceLabel: formatNullableSinglePrice(job.final_price)')
    expect(frontendWorkflowProvider).toContain('estimatedEarningLabel: formatNullableSinglePrice(job.estimated_earning)')
    expect(frontendWorkflowProvider).toContain('extras?: { completion_notes?: string; completion_photo_urls?: string[]; access_check_in?: WorkerAccessCheckInInput }')
    expect(frontendWorkflowProvider).toContain('job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress')
    expect(frontendWorkflowProvider).toContain('addressAccess,')
    expect(frontendWorkflowProvider).not.toContain('final_price?: number')
    const workerStatusUpdateSchema = edgeRouter.slice(edgeRouter.indexOf('function workerStatusUpdateSchema'), edgeRouter.indexOf('function isPositiveInteger'))
    expect(workerStatusUpdateSchema).toContain('if (record.final_price !== undefined)')
    expect(workerStatusUpdateSchema).toContain('result.completion_notes = record.completion_notes.slice(0, 2000)')
    expect(workerStatusUpdateSchema).toContain('result.completion_photo_urls = urls')
    expect(workerStatusUpdateSchema).toContain('result.access_check_in = parseWorkerAccessCheckIn(record.access_check_in)')
    expect(workerStatusUpdateSchema).toContain('if (status === "completed_by_worker")')
    expect(workerStatusUpdateSchema).toContain('Cần ghi chú hoàn tất trước khi báo hoàn tất')
    const createJobResponseType = edgeRouter.slice(edgeRouter.indexOf('type CreateJobResponse'), edgeRouter.indexOf('type KaelChatStatus'))
    expect(createJobResponseType).toContain('final_price?: number | null')
    const createJobReturn = edgeServices.slice(edgeServices.indexOf('return {\n    job_id: jobId'), edgeServices.indexOf('async function cancelAnalyzingJob'))
    expect(createJobReturn).toContain('final_price: lockedFinalPrice')
    const listWorkerJobs = edgeServices.slice(edgeServices.indexOf('async function listWorkerJobs'), edgeServices.indexOf('async function getWorkerEarnings'))
    expect(listWorkerJobs).toContain('completion_notes, completion_photo_urls')
    expect(listWorkerJobs).toContain('projectAddressAccess(row, "worker")')
    expect(listWorkerJobs).toContain('address_access: addressProjection.addressAccess')
    expect(listWorkerJobs).toContain('completion_notes: nullableString(row.completion_notes)')
    expect(listWorkerJobs).toContain('completion_photo_urls: asStringArray(row.completion_photo_urls)')
  })
})

