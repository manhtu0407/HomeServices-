import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const MOBILE_ROOT = resolve(__dirname, '../../../../apps/mobile')
const read = (rel: string) => readFileSync(resolve(MOBILE_ROOT, rel), 'utf-8')
const exists = (rel: string) => existsSync(resolve(MOBILE_ROOT, rel))

// ===================================================================
// Navigation skeleton — must match STRUCTURES.md exactly
// ===================================================================

describe('screen files existence (STRUCTURES.md mapping)', () => {
  const authScreens = ['login.tsx', 'verify-otp.tsx', 'onboard.tsx']
  const customerScreens = ['home.tsx', 'booking.tsx', 'kael.tsx', 'history.tsx', 'profile.tsx']
  const workerScreens = ['home.tsx', 'jobs.tsx', 'chat.tsx', 'earnings.tsx', 'profile.tsx']

  it.each(authScreens)('(auth)/%s exists', (file) => {
    expect(exists(`app/(auth)/${file}`)).toBe(true)
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
    'app/(auth)/onboard.tsx',
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
// Customer tabs — STRUCTURES.md A1: Trang chủ | Đặt lịch | Kael | Lịch sử | Hồ sơ
// ===================================================================

describe('customer tab labels (STRUCTURES.md A1)', () => {
  const src = read('app/(customer)/_layout.tsx')

  it('has exactly 5 Tabs.Screen entries', () => {
    const matches = src.match(/Tabs\.Screen/g) ?? []
    expect(matches.length).toBe(5)
  })

  it('tab: Trang chủ', () => {
    expect(src).toContain("'Trang chủ'")
  })

  it('tab: Đặt lịch', () => {
    expect(src).toContain("'Đặt lịch'")
  })

  it('tab: Kael', () => {
    expect(src).toContain("'Kael'")
  })

  it('tab: Lịch sử', () => {
    expect(src).toContain("'Lịch sử'")
  })

  it('tab: Hồ sơ', () => {
    expect(src).toContain("'Hồ sơ'")
  })

  it('uses Tabs from expo-router', () => {
    expect(src).toMatch(/import\s+\{.*Tabs.*\}\s+from\s+['"]expo-router['"]/)
  })
})

// ===================================================================
// Worker tabs — STRUCTURES.md B1: Trang chủ | Công việc | Chat | Thu nhập | Hồ sơ
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

// ===================================================================
// Auth layout — Stack navigator (A0: login → verify-otp → onboard)
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

  it('registers onboard screen', () => {
    expect(src).toContain('"onboard"')
  })
})

// ===================================================================
// Root layout — AuthProvider wrapping
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
// Index (splash redirect) — role-based routing
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
// Supabase client — Rule #1: secrets server-side only
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

  it('does NOT use process.env (Rule #1 — RN uses app.json extra)', () => {
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
// Auth provider — correct Supabase auth pattern
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

  it('declares react-native-svg for prototype-quality icon rendering', () => {
    expect(mobilePackage.dependencies['react-native-svg']).toBe('15.12.1')
  })

  it('declares react-native-reanimated for visible motion prototyping', () => {
    expect(mobilePackage.dependencies['react-native-reanimated']).toBe('~4.1.7')
  })
})

// ===================================================================
// colors.ts — design consistency
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
// Client Price Check prototype — isolated UI review surface
// ===================================================================

describe('client price check prototype', () => {
  const route = read('app/prototype/client-price-check.tsx')
  const layout = read('app/prototype/_layout.tsx')
  const component = read('components/client-price-check/client-price-check-prototype.tsx')
  const customerLayout = read('app/(customer)/_layout.tsx')

  it('adds a dedicated prototype route outside production customer tabs', () => {
    expect(exists('app/prototype/client-price-check.tsx')).toBe(true)
    expect(exists('app/prototype/_layout.tsx')).toBe(true)
    expect(route).toContain('ClientPriceCheckPrototype')
    expect(layout).toContain('Prototype kiểm tra giá')
    expect(customerLayout).not.toContain('client-price-check')
  })

  it('keeps the prototype implementation outside the app route tree', () => {
    expect(exists('components/client-price-check/client-price-check-prototype.tsx')).toBe(true)
    expect(route).toContain('@/components/client-price-check/client-price-check-prototype')
  })

  it('covers the required local review states', () => {
    expect(component).toContain("'service'")
    expect(component).toContain("'details'")
    expect(component).toContain("'loading'")
    expect(component).toContain("'clarification'")
    expect(component).toContain("'estimate'")
    expect(component).toContain("'fallback'")
  })

  it('uses a multi-step mobile flow instead of a single presentation screen', () => {
    expect(component).toContain('multi-step-price-check')
    expect(component).toContain('goNext')
    expect(component).toContain('goBack')
    expect(component).toContain('Bạn cần sửa gì?')
    expect(component).toContain('Mô tả hiện trạng')
    expect(component).toContain('Kael hỏi thêm')
    expect(component).toContain('Ước tính minh bạch')
  })

  it('keeps the revised UI direction light, varied, and Anthropic-like', () => {
    expect(component).toContain('#F8FCFA')
    expect(component).toContain('#EEF9F5')
    expect(component).toContain('#CFF3F4')
    expect(component).toContain('#4ABDC0')
    expect(component).toContain('Aptos, Inter, Geist, Manrope')
    expect(component).toContain('letterSpacing: 0')
  })

  it('keeps v3 visual direction markers in the prototype', () => {
    expect(component).toContain('Animated.loop')
    expect(component).toContain('backgroundWash')
    expect(component).toContain('ServiceIcon')
    expect(component).toContain('ChipGlyph')
    expect(component).toContain('pressMotion')
  })

  it('keeps the v4 icon and animation prototype explicit', () => {
    expect(component).toContain('outletPlate')
    expect(component).toContain('faucetIcon')
    expect(component).toContain('iconPulseRing')
    expect(component).toContain('statusOrbit')
    expect(component).toContain('screenMotion')
    expect(component).toContain('ctaPulse')
  })

  it('uses v5 SVG icons and interaction-driven motion markers', () => {
    expect(component).toContain("from 'react-native-svg'")
    expect(component).toContain('OutletSvgIcon')
    expect(component).toContain('FaucetSvgIcon')
    expect(component).toContain('interactionPulse')
    expect(component).toContain('serviceTileSweep')
    expect(component).toContain('chipActionSheen')
  })

  it('adds a v8 motion lab with interaction-triggered choreography', () => {
    expect(component).toContain("from 'react-native-reanimated'")
    expect(component).toContain('motion-lab-v8')
    expect(component).toContain('MotionShowcase')
    expect(component).toContain('MotionMode')
    expect(component).toContain('MotionModeSelector')
    expect(component).toContain('DistributedMotionRail')
    expect(component).toContain('MotionDetailCard')
    expect(component).toContain('PlugSocketHeroIcon')
    expect(component).toContain('PipeValveHeroIcon')
    expect(component).toContain('KaelScanCard')
    expect(component).toContain('EstimateRevealCard')
    expect(component).toContain('interpolateColor')
    expect(component).toContain('mintStrong')
    expect(component).toContain('mintVivid')
    expect(component).toContain('onPressIn')
    expect(component).toContain('onHoverIn')
    expect(component).toContain('revealAccent')
    expect(component).not.toContain('withRepeat')
  })

  it('adds a v11 signature material color system for the prototype', () => {
    expect(component).toContain('color-signature-v11')
    expect(component).toContain('ColorSignaturePanel')
    expect(component).toContain('surfaceWarm')
    expect(component).toContain('priceWash')
    expect(component).toContain('priceGold')
    expect(component).toContain('mistMint')
    expect(component).toContain('jadeSoft')
    expect(component).toContain('forest')
    expect(component).toContain('leafVeil')
    expect(component).toContain('mineralMist')
    expect(component).toContain('mossLine')
    expect(component).toContain('copperVeil')
    expect(component).toContain('electricTint')
    expect(component).toContain('electricGlow')
    expect(component).toContain('waterTint')
    expect(component).toContain('waterGlow')
    expect(component).toContain('deepMint')
    expect(component).toContain('backgroundMintField')
    expect(component).toContain('backgroundWarmField')
    expect(component).toContain('backgroundJadeThread')
    expect(component).toContain('backgroundCopperThread')
    expect(component).toContain('colorSignatureDepthRail')
    expect(component).toContain('colorMaterialStack')
    expect(component).toContain('contextMaterialRail')
    expect(component).toContain('serviceTileActiveElectric')
    expect(component).toContain('serviceTileActiveWater')
    expect(component).toContain('serviceTileAccentElectric')
    expect(component).toContain('serviceTileInnerLayer')
    expect(component).toContain('motionServiceInset')
    expect(component).toContain('problemChipSelectedElectric')
  })

  it('communicates prototype-only scope in Vietnamese', () => {
    expect(component).toContain('Dữ liệu mẫu')
    expect(component).toContain('chưa gọi backend')
    expect(component).toContain('chưa ghi Supabase')
    expect(component).toContain('Không tạo booking')
    expect(component).toContain('chưa broadcast tìm thợ')
  })

  it('shows the required price disclaimer on estimate/fallback states', () => {
    expect(component).toContain(
      'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'
    )
  })

  it('does not call backend, Supabase, or AI providers from the prototype', () => {
    expect(component).not.toContain('fetch(')
    expect(component).not.toContain('createClient')
    expect(component).not.toContain('supabase.')
    expect(component).not.toContain("from('@supabase")
    expect(component).not.toContain('callAI')
    expect(component).not.toContain('ANTHROPIC_API_KEY')
    expect(component).not.toContain('PERPLEXITY_API_KEY')
    expect(component).not.toContain('DEEPSEEK_API_KEY')
  })

  it('does not introduce unsupported services into the client prototype', () => {
    expect(component).toContain("'electrical'")
    expect(component).toContain("'plumbing'")
    expect(component).not.toMatch(/cleaning|ac repair|appliance|handyman/i)
  })
})

// ===================================================================
// Client Price Check production UI — customer Đặt lịch A2-A5 slice
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

  it('keeps production A2-A5 UI separate from the prototype implementation', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('production-price-check-flow')
    expect(component).toContain('services-hub-clean')
    expect(component).toContain('HomeServicesScene')
    expect(component).toContain('HubStep')
    expect(component).toContain('ProblemStep')
    expect(component).toContain('PriceCheckUiStep')
    expect(component).toContain('PriceCheckUiStatus')
    expect(component).not.toContain('prototype-only')
    expect(component).not.toContain('motion-lab-v8')
    expect(component).not.toContain('color-signature-v11')
    expect(component).not.toContain('Production backend')
    expect(component).not.toContain('chưa gọi backend')
    expect(component).not.toContain('chưa ghi Supabase')
  })

  it('covers the A2-A5 production flow states', () => {
    const component = read(productionComponentPath)
    expect(component).toContain("'hub'")
    expect(component).toContain("'problem'")
    expect(component).toContain("'details'")
    expect(component).toContain("'clarification'")
    expect(component).toContain("'estimate'")
    expect(component).toContain("'loading'")
    expect(component).toContain("'fallback'")
    expect(component).toContain("'error'")
    expect(component).toContain('retryPriceCheck')
  })

  it('uses electrical/plumbing shared scope and Vietnamese production copy', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('PROBLEM_CHIPS')
    expect(component).toContain('ServiceType')
    expect(component).toContain("'electrical'")
    expect(component).toContain("'plumbing'")
    expect(component).toContain('startServiceFlow')
    expect(component).toContain('Đặt lịch sửa chữa')
    expect(component).toContain('Chung cư')
    expect(component).toContain('Sửa điện')
    expect(component).toContain('Sửa nước')
    expect(component).not.toMatch(/cleaning|ac repair|appliance|handyman/i)
  })

  it('keeps price honesty and the required disclaimer visible', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('Đây là ước tính dựa trên thị trường')
    expect(component).toContain('Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu')
    expect(component).toContain('baseline_fallback')
    expect(component).not.toContain('giá chính xác')
    expect(component).not.toContain('cam kết giá')
  })

  it('uses interaction-triggered motion without decorative auto loops', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('onPressIn')
    expect(component).toContain('Animated.sequence')
    expect(component).toContain('pressMotion')
    expect(component).toContain('scenePressScale')
    expect(component).not.toContain('Animated.loop')
    expect(component).not.toContain('withRepeat')
  })

  it('spreads light interaction motion across the production flow', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('MotionPressable')
    expect(component).toContain('runTapMotion')
    expect(component).toContain('tapScale')
    expect(component).toContain('tapTranslateY')
    expect(component).toContain('tapSweepTranslate')
    expect(component).toContain('tapInsetOpacity')
    expect(component).toContain('deferPressMs')
    expect(component).toContain('pressTimeoutRef')
    expect(component).toContain('clearTimeout')
    expect(component).toContain('motionServiceInset')
    expect(component).toContain('serviceTileSweep')
    expect(component).toContain('chipActionSheen')
    expect(component).toContain('motionRole')
    expect(component).toContain("'service'")
    expect(component).toContain("'chip'")
    expect(component).toContain("'answer'")
    expect(component).toContain("'cta'")
    expect(component).toContain("'retry'")
    expect(component).not.toContain('motionPressableOverlay')
    expect(component).not.toContain('onHoverIn')
    expect(component).not.toContain('tapOverlayScale')
    expect(component).not.toContain('motionAccentBar')
  })

  it('uses one-shot state transition motion for loading and estimate reveal', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('StateReveal')
    expect(component).toContain('stateMotion')
    expect(component).toContain('Animated.parallel')
    expect(component).toContain('stateRevealAccent')
    expect(component).toContain('stateAccentScale')
    expect(component).toContain('loadingRevealStyle')
    expect(component).toContain('estimateRevealStyle')
    expect(component).toContain("'loading'")
    expect(component).toContain("'estimate'")
    expect(component).toContain("'fallback'")
  })

  it('has responsive guards for compact iOS and Android store builds', () => {
    const component = read(productionComponentPath)
    expect(component).toContain('const { width, height } = useWindowDimensions()')
    expect(component).toContain('isShortScreen')
    expect(component).toContain('hubFirstViewport')
    expect(component).toContain('compactHeroHeight')
    expect(component).toContain('compactServiceCardHeight')
    expect(component).toContain('minimumTouchTarget')
    expect(component).toContain('hubShellCompact')
    expect(component).toContain('hubServiceCardCompact')
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

  it('does not build booking broadcast, matching, payment, or scope-change flows in this slice', () => {
    const component = read(productionComponentPath)
    expect(component).not.toContain('broadcasting')
    expect(component).not.toContain('worker_matched')
    expect(component).not.toContain('payment_pending')
    expect(component).not.toContain('scope_change_pending')
    expect(component).not.toContain('customer_confirmed_booking_search')
  })
})
