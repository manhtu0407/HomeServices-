import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { dirname, resolve } from 'path'

const MOBILE_ROOT = resolve(__dirname, '../../../../apps/mobile')
const REPOSITORY_ROOT = resolve(MOBILE_ROOT, '../..')
const readSource = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
const read = (rel: string) => readSource(resolve(MOBILE_ROOT, rel))
const readRepository = (rel: string) => readSource(resolve(REPOSITORY_ROOT, rel))
const exists = (rel: string) => existsSync(resolve(MOBILE_ROOT, rel))
const countOccurrences = (source: string, value: string) => source.split(value).length - 1

// The Edge use-case layer is the domains.ts factory plus the per-domain modules under
// domains/, so source-string assertions read the whole concatenated layer — otherwise a grep
// silently misses code that moved into a module.
const EDGE_MOBILE_API_SHARED = resolve(MOBILE_ROOT, '../../supabase/functions/mobile-api/_shared')
const listEdgeServiceFiles = (absDir: string): string[] =>
  readdirSync(absDir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listEdgeServiceFiles(resolve(absDir, entry.name)) : [resolve(absDir, entry.name)],
  )
const readEdgeServiceLayer = () =>
  [
    readSource(resolve(EDGE_MOBILE_API_SHARED, 'domains.ts')),
    ...listEdgeServiceFiles(resolve(EDGE_MOBILE_API_SHARED, 'domains'))
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(readSource),
  ].join('\n')

const readEdgeRouterLayer = () =>
  [
    readSource(resolve(EDGE_MOBILE_API_SHARED, 'http.ts')),
    ...listEdgeServiceFiles(resolve(EDGE_MOBILE_API_SHARED, 'http'))
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(readSource),
  ].join('\n')

const readApiTypesLayer = () =>
  [
    read('lib/api-types.ts'),
    ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'lib/api-types'))
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(readSource),
  ].join('\n')

// The customer surface tree is the restored V5/PR72 implementation, split from
// the flat v21/ folder into per-domain buckets. Prototype detection allows these
// directories; anything else customer-side still has to stay out of route graphs.
const RESTORED_CUSTOMER_SURFACE_DIRS = [
  'components/customer/v21/',
  'components/customer/dock/',
  'components/customer/ui/',
  'components/customer/home/',
  'components/customer/booking/',
  'components/customer/history/',
  'components/customer/profile/',
  'components/customer/kael-chat/',
]

// v21/ was split into per-domain buckets, so a customer surface is addressed by
// file name and located across those buckets. A moved file keeps its assertions
// instead of silently reading a stale path.
const customerSurfacePath = (fileName: string) => {
  const match = RESTORED_CUSTOMER_SURFACE_DIRS.find((dir) => exists(`${dir}${fileName}`))
  if (!match) throw new Error(`customer surface not found in any bucket: ${fileName}`)
  return `${match}${fileName}`
}
const readCustomerSurface = (fileName: string) => read(customerSurfacePath(fileName))

// The specifier v21/surfaces.tsx (the composition root) uses to import a bucketed module.
const customerSurfaceSpecifier = (fileName: string) => {
  const bucket = customerSurfacePath(fileName).split('/')[2]
  const moduleName = fileName.replace(/\.tsx?$/, '')
  return bucket === 'v21' ? `from './${moduleName}'` : `from '../${bucket}/${moduleName}'`
}

const readFrontendWorkflowLayer = () =>
  [
    read('lib/frontend-workflow-provider.tsx'),
    ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'lib/frontend-workflow'))
      .filter((p) => /\.tsx?$/.test(p))
      .sort()
      .map(readSource),
  ].join('\n')

const readMobileWorkflowLayer = () =>
  [
    readSource(resolve(__dirname, '../mobile-workflow.ts')),
    ...listEdgeServiceFiles(resolve(__dirname, '../mobile-workflow'))
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(readSource),
  ].join('\n')

// The worker surface layer is the public worker barrel plus the active Worker V5 modules.
// The deleted split surface directory is intentionally excluded so static tests cannot
// keep old design entrypoints reachable.
const readWorkerSurfaceLayer = () =>
  listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/worker'))
    .filter((p) => {
      const normalized = p.replace(/\\/g, '/')
      return /\.tsx?$/.test(p)
        && !normalized.includes('/__tests__/')
        && !normalized.includes('/components/worker/surfaces/')
        && !normalized.endsWith('/components/worker/chat/orb-styles.ts')
        && !normalized.endsWith('/components/worker/chat/body-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/body-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/ledger-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/overview-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/payout-method-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/payout-request-styles.ts')
        && !normalized.endsWith('/components/worker/earnings/payout-styles.ts')
        && !normalized.endsWith('/components/worker/home/action-styles.ts')
        && !normalized.endsWith('/components/worker/home/opportunity-styles.ts')
        && !normalized.endsWith('/components/worker/profile/body-styles.ts')
        && !normalized.endsWith('/components/worker/profile/header-styles.ts')
        && !normalized.endsWith('/components/worker/profile/memory-styles.ts')
        && !normalized.endsWith('/components/worker/profile/overview-styles.ts')
        && !normalized.endsWith('/components/worker/profile/ranking-styles.ts')
        && !normalized.endsWith('/components/worker/profile/reliability-styles.ts')
        && !normalized.endsWith('/components/worker/profile/reviews-styles.ts')
        && !normalized.endsWith('/components/worker/profile/services-styles.ts')
        && !normalized.endsWith('/components/worker/profile/settings-styles.ts')
        && !normalized.endsWith('/components/worker/profile/verification-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/active-body-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/advisory-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/approval-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/case-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/completion-body-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/acceptance-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/completion-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/map-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/offer-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/progress-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/shared-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/source-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/scope-styles.ts')
        && !normalized.endsWith('/components/worker/jobs/timeline-styles.ts')
        && !normalized.endsWith('/components/worker/ui/aura-styles.ts')
        && !normalized.endsWith('/components/worker/ui/format.ts')
        && !normalized.endsWith('/components/worker/ui/labels.ts')
        && !normalized.endsWith('/components/worker/ui/metrics-styles.ts')
        && !normalized.endsWith('/components/worker/ui/performance.ts')
        && !normalized.endsWith('/components/worker/ui/primitives-styles.ts')
        && !normalized.endsWith('/components/worker/ui/route.ts')
    })
    .sort()
    .map(readSource)
    .join('\n')

// Extract a single top-level worker declaration's source, robust to which split module now
// holds it: slices `function NAME`/`const NAME` to the next top-level declaration in that same
// module file, so re-grouped functions never bleed across modules in the concatenated layer.
const sliceWorkerDecl = (name: string) => {
  const files = listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/worker'))
    .filter((p) => /\.tsx?$/.test(p) && !p.replace(/\\/g, '/').includes('/__tests__/'))
  for (const path of files) {
    const file = readSource(path)
    const head = new RegExp(`(?:export )?(?:function|const) ${name}\\b`).exec(file)
    if (!head) continue
    const rest = file.slice(head.index + head[0].length)
    const next = rest.search(/\n(?:export )?(?:function|const|type|interface) /)
    return next >= 0 ? file.slice(head.index, head.index + head[0].length + next) : file.slice(head.index)
  }
  return ''
}

// The customer surface layer is customer-surfaces.tsx plus the active PR72/V21 modules
// (not unrelated customer siblings like booking-wizard).
// The customer surface layer is the shim plus every per-domain bucket, so
// source-string assertions still see code that moved out of the flat v21/ folder.
const readCustomerSurfaceLayer = () =>
  [
    read('components/customer/customer-surfaces.tsx'),
    ...RESTORED_CUSTOMER_SURFACE_DIRS
      .map((dir) => resolve(MOBILE_ROOT, dir))
      .filter((absDir) => existsSync(absDir))
      .flatMap((absDir) => listEdgeServiceFiles(absDir))
      .filter((p) => /\.tsx?$/.test(p))
      .sort()
      .map(readSource),
  ].join('\n')

const readAuthSurfaceLayer = () =>
  listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/auth'))
    .filter((p) => /\.tsx?$/.test(p) && !p.replace(/\\/g, '/').includes('/__tests__/'))
    .sort()
    .map(readSource)
    .join('\n')

const mobileSourceExtensions = ['.ts', '.tsx', '.js', '.jsx'] as const

function resolveMobileSourceModule(basePath: string) {
  for (const extension of mobileSourceExtensions) {
    const path = `${basePath}${extension}`
    if (existsSync(path)) return path
  }

  for (const extension of mobileSourceExtensions) {
    const path = resolve(basePath, `index${extension}`)
    if (existsSync(path)) return path
  }

  return null
}

function resolveMobileImport(fromPath: string, specifier: string) {
  if (specifier.startsWith('@/')) return resolveMobileSourceModule(resolve(MOBILE_ROOT, specifier.slice(2)))
  if (specifier.startsWith('.')) return resolveMobileSourceModule(resolve(dirname(fromPath), specifier))
  return null
}

function readMobileSourceGraph(entryRelativePaths: string[]) {
  const stack = entryRelativePaths.map((entry) => resolve(MOBILE_ROOT, entry))
  const seen = new Set<string>()

  while (stack.length > 0) {
    const path = stack.pop()
    if (!path || seen.has(path) || !existsSync(path)) continue

    seen.add(path)
    const src = readSource(path)
    const specifiers = [
      ...src.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g),
      ...src.matchAll(/require\(['"]([^'"]+)['"]\)/g),
    ].map((match) => match[1])

    for (const specifier of specifiers) {
      const nextPath = resolveMobileImport(path, specifier)
      if (nextPath && !seen.has(nextPath)) stack.push(nextPath)
    }
  }

  return [...seen].sort()
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

  it.each(customerScreens)('(customer)/%s exists', (file) => {
    expect(exists(`app/(customer)/${file}`)).toBe(true)
  })

  it.each(workerScreens)('(worker)/%s exists', (file) => {
    expect(exists(`app/(worker)/${file}`)).toBe(true)
  })

  it('routes every admin entry through the current Admin sections surface', () => {
    expect(exists('app/(admin)/dashboard.tsx')).toBe(false)
    expect(exists('app/(admin)/sections.tsx')).toBe(true)
    const src = read('app/(admin)/sections.tsx')
    expect(src).toContain('AdminSections')
    expect(src).not.toContain('fetch(')

    for (const route of [
      'app/index.tsx',
      'app/(customer)/_layout.tsx',
      'app/(worker)/_layout.tsx',
      'components/auth/auth-surfaces.tsx',
    ]) {
      const source = read(route)
      expect(source).toContain('/(admin)/sections')
      expect(source).not.toContain('/(admin)/dashboard')
    }
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
    'app/(admin)/sections.tsx',
  ]

  it.each(allScreens)('%s has default export', (file) => {
    const src = read(file)
    expect(src).toMatch(/export\s+default\s+function/)
  })
})

// ===================================================================
// Customer tabs - STRUCTURES.md A1: Trang chủ | Yêu cầu | Kael | Hoạt động | Hồ sơ
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

  it('tab route: booking keeps the current service-entry role', () => {
    expect(src).toContain('name="booking"')
    expect(src).not.toContain('tabBarLabel')
  })

  it('tab route: history uses the current activity role', () => {
    expect(src).toContain('name="history"')
    expect(src).not.toContain('tabBarLabel')
  })

  it('keeps route titles localized while the native tab bar stays removed', () => {
    expect(src).toContain('CUSTOMER_TAB_COPY')
    expect(src).toContain('useAppLanguage')
    expect(src).toContain("home: 'Trang chủ'")
    expect(src).toContain("booking: 'Yêu cầu'")
    expect(src).toContain("history: 'Hoạt động'")
    expect(src).toContain("booking: 'Request'")
    expect(src).toContain("history: 'Activity'")
    expect(src).not.toContain('CustomerTabIcon')
    expect(src).not.toContain('react-native-svg')
    expect(src).not.toContain('accessibilityLabel={accessibilityMarker}')
    expect(src).not.toContain('accessibilityLabel={CUSTOMER_DOCK')
  })

  it('exposes a hidden customer runtime marker for TestFlight provenance checks', () => {
    expect(src).toContain('mobileRuntimeConfig.runtimeBuildInfo')
    expect(src).toContain('CustomerRuntimeBuildMarker')
    expect(src).toContain('customer-runtime-marker-hotspot')
    expect(src).toContain('customer-runtime-marker')
    expect(src).toContain('NestScout customer runtime marker:')
  })
})

// ===================================================================
// Customer frontend shell - production static/local surfaces around Price Check
// ===================================================================

describe('customer frontend shell surfaces', () => {
  const shellPath = 'components/customer/customer-surfaces.tsx'
  const shell = () => (exists(shellPath) ? readCustomerSurfaceLayer() : '')
  const customerLayout = () => read('app/(customer)/_layout.tsx')
  const customerTheme = () => [
    read('components/customer/customer-theme.ts'),
    read('design/theme.ts'),
  ].join('\n')
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

  it('routes active customer entries through the restored PR72 V21 implementation', () => {
    const bridge = read(shellPath)
    const customerLayoutSrc = customerLayout()
    const routeGraphFiles = readMobileSourceGraph([
      'app/(customer)/_layout.tsx',
      'app/(customer)/home.tsx',
      'app/(customer)/booking.tsx',
      'app/(customer)/kael.tsx',
      'app/(customer)/kael-chat.tsx',
      'app/(customer)/history.tsx',
      'app/(customer)/profile.tsx',
    ])
    const rel = (path: string) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
    const graph = routeGraphFiles.map(rel)
    const v21 = read('components/customer/v21/surfaces.tsx')
    const storytellingCard = readCustomerSurface('home-storytelling-card.tsx')

    expect(bridge).toContain("from './v21/surfaces'")
    expect(bridge).not.toContain("from './surfaces/home'")
    expect(bridge).not.toContain("from './surfaces/booking'")
    expect(bridge).not.toContain("from './surfaces/profile'")
    expect(customerLayoutSrc).toContain("if (pathname.includes('booking')) return 'services'")
    expect(customerLayoutSrc).toContain("if (pathname.includes('kael')) return 'chat'")
    expect(graph).toContain('components/customer/v21/surfaces.tsx')
    expect(graph).toContain(customerSurfacePath('chat-stateful-surfaces.tsx'))
    expect(graph).toContain(customerSurfacePath('home-storytelling-card.tsx'))
    expect(graph).not.toContain('components/customer/kael-chat/kael-chat-surface.tsx')
    expect(v21).toContain('testID="customer-v21-home"')
    expect(v21).toContain('testID="customer-v21-services"')
    expect(v21).toContain(customerSurfaceSpecifier('home-storytelling-card.tsx'))
    expect(v21).toContain('<HomeStorytellingCard')
    expect(storytellingCard).toContain('testID="customer-v21-home-hero"')
    expect(storytellingCard).toContain('testID="customer-v21-home-storytelling"')
    expect(v21).toContain('export const CustomerDockOverlay = CustomerV21DockOverlay')
  })

  it('keeps customer route entrypoints wired to the restored PR72 V21 surfaces', () => {
    const routeGraphFiles = readMobileSourceGraph([
      'app/(customer)/_layout.tsx',
      'app/(customer)/home.tsx',
      'app/(customer)/booking.tsx',
      'app/(customer)/kael.tsx',
      'app/(customer)/kael-chat.tsx',
      'app/(customer)/history.tsx',
      'app/(customer)/profile.tsx',
    ])
    const rel = (path: string) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
    const offenders = routeGraphFiles
      .filter((path) => {
        const normalized = path.replace(/\\/g, '/')
        if (normalized.includes('/components/customer/v21/')) return true
        const src = readSource(path)
        return /CustomerV21|customer-v21-|customer-kael-chat-liquid-wash|customer-section-glass-field|customer-motion-field/.test(src)
      })
      .map(rel)

    expect(routeGraphFiles.map(rel)).toContain('components/customer/v21/surfaces.tsx')
    expect(routeGraphFiles.map(rel)).toContain(customerSurfacePath('chat-stateful-surfaces.tsx'))
    expect(routeGraphFiles.map(rel)).not.toContain('components/customer/kael-chat/kael-chat-surface.tsx')
    expect(offenders).toContain('components/customer/v21/surfaces.tsx')
  })

  it('keeps production entry graphs pointed at the restored customer home implementation', () => {
    const entryGraphFiles = readMobileSourceGraph([
      'app/index.tsx',
      'app/(auth)/login.tsx',
      'app/(customer)/_layout.tsx',
      'app/(customer)/home.tsx',
      'app/(worker)/_layout.tsx',
      'app/(worker)/home.tsx',
    ])
    const rel = (path: string) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
    const oldHomeNeedles = [
      'CustomerV21',
      'customer-v21-home',
      'customer-v21-home-hero',
      'customer-v21-home-card-skin',
      'Kael sẵn sàng hỗ trợ, công việc vẫn do bạn kiểm soát.',
      'Bạn cần gì hôm nay?',
      'Công việc đang xử lý',
    ]
    const offenders = entryGraphFiles
      .filter((path) => {
        const normalized = path.replace(/\\/g, '/')
        if (normalized.includes('/components/customer/v21/')) return true
        const src = readSource(path)
        return oldHomeNeedles.some((needle) => src.includes(needle))
      })
      .map(rel)

    expect(entryGraphFiles.map(rel)).toContain('components/customer/v21/surfaces.tsx')
    expect(offenders).toContain('components/customer/v21/surfaces.tsx')
  })

  it.each(customerRoutes)('wires (customer)/%s to %s', (route, exportName) => {
    const src = read(`app/(customer)/${route}.tsx`)
    expect(src).toContain(exportName)
    expect(src).toContain('@/components/customer/customer-surfaces')
    expect(src).not.toContain('ClientPriceCheckPrototype')
    expect(src).not.toContain('client-price-check-prototype')
  })

  it('wires (customer)/kael to the restored V21 Kael chat surface', () => {
    const src = read('app/(customer)/kael.tsx')
    expect(src).toContain('CustomerKaelSurface')
    expect(src).toContain('@/components/customer/customer-surfaces')
    expect(src).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
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

  it('keeps design-lab artifacts out of production customer source references', () => {
    expect(exists('../../.tmp/design-lab/customer-app-v1')).toBe(false)
    expect(exists('../../.tmp/design-lab/customer-app-v2')).toBe(false)
    expect(shell()).not.toContain('.tmp/design-lab')
  })

  it('removes the legacy native customer tab bar so only the custom dock renders', () => {
    const src = customerLayout()
    expect(src).toContain('CUSTOMER_DOCK_MAIN_A')
    expect(src).toContain('CUSTOMER_DARK_DOCK_LAYER_MATCH')
    expect(src).toContain('tabBar={() => null}')
    expect(src).toContain('useCustomerThemeMode')
    expect(src).toContain('getCustomerThemeTokens')
    expect(src).not.toContain('tabBarStyle')
    expect(src).not.toContain('tabBarIcon')
    expect(src).not.toContain('CustomerTabIcon')
    expect(src).not.toContain('customer-tab-icon-home')
    expect(src).not.toContain('customer-tab-kael-mascot-8a')
    expect(src).not.toContain('react-native-svg')
  })

})

describe('customer Kael workflow view model wiring', () => {
  const v21Surface = () => read('components/customer/v21/surfaces.tsx')
  const v21ChatView = () => readCustomerSurface('chat-stateful-surfaces.tsx')
  const v21ChatAura = () => readCustomerSurface('chat-surfaces.tsx')
  const v21KaelSurface = () => readCustomerSurface('kael-chat-surface.tsx')
  const v21KaelContent = () => readCustomerSurface('customer-kael-chat-content.tsx')
  const v21KaelEstimateNode = () => readCustomerSurface('customer-agentic-estimate-node.tsx')
  const v21KaelPresentation = () => readCustomerSurface('customer-kael-presentation.ts')
  const v21KaelOrchestration = () => [
    readCustomerSurface('use-customer-kael-surface-controller.ts'),
    readCustomerSurface('use-customer-kael-session-hydration.ts'),
    readCustomerSurface('use-customer-kael-evidence-actions.ts'),
    readCustomerSurface('use-customer-kael-message-actions.ts'),
    readCustomerSurface('use-customer-kael-decision-actions.ts'),
  ].join('\n')
  const v21KaelProcess = () => [
    readCustomerSurface('kael-process-lines.ts'),
    readCustomerSurface('use-kael-process-line-controller.ts'),
    readCustomerSurface('kael-process-line-view.tsx'),
  ].join('\n')
  const pendingIntakeFacade = () => read('components/customer/kael-chat/pending-intake.ts')
  const pendingIntake = () => read('lib/pending-kael-chat-draft.ts')

  it('keeps active Customer Kael on the V21 route graph', () => {
    const src = v21Surface()
    const surface = v21KaelSurface()
    const content = v21KaelContent()
    const view = v21ChatView()

    expect(exists('components/customer/kael-chat/kael-chat-surface.tsx')).toBe(false)
    expect(exists('components/customer/kael-chat/thread.tsx')).toBe(false)
    expect(exists('components/customer/kael-chat/agentic-parts.tsx')).toBe(false)
    expect(src).toContain('export function CustomerKaelSurface')
    expect(surface).toContain('export function KaelChatSurface')
    expect(src).toContain('accountId: session?.user.id ?? null')
    expect(src).toContain('<KaelChatSurface key={stateScopeKey} stateScopeKey={stateScopeKey} />')
    expect(content).toContain('KaelChatSurfaceView')
    expect(view).toContain('testID="customer-v21-kael-chat"')
    expect(view).toContain('customer-v21-screen-2.4-chat-normal')
    expect(view).toContain('customer-v21-screen-2.5-chat-case')
    expect(view).not.toContain('customer-kael-chat-stack-screen')
  })

  it('keeps V21 Kael workflow state wired through the shared mobile boundary', () => {
    const src = v21KaelOrchestration()

    expect(src).toContain('readPendingKaelChatDraft')
    expect(src).toContain('clearPendingKaelChatDraft')
    expect(src).toContain('kaelChatService')
    expect(src).toContain('jobService.sendMessage')
    expect(src).toContain('useFrontendWorkflow')
    expect(src).toContain('workflow.actions.confirmRemoteSearch')
    expect(src).toContain('workflow.actions.hydrateRemoteJobById')
    expect(pendingIntakeFacade()).toContain("export * from '@/lib/pending-kael-chat-draft'")
    expect(pendingIntake()).toContain('export async function setPendingKaelChatDraft(ownerId: string')
    expect(pendingIntake()).toContain('export async function readPendingKaelChatDraft')
    expect(pendingIntake()).toContain('PENDING_KAEL_CHAT_DRAFT_TTL_MS = 30 * 60 * 1000')
  })

  it('renders Kael process steps progressively from the ticket artifact mode', () => {
    const src = v21KaelProcess()
    expect(src).toContain('buildKaelProcessSequence')
    expect(src).toContain('startProcessLines')
    expect(src).toContain('KaelProcessLines')
  })

  it('renders estimate-ready orchestration as Kael status instead of a customer gate', () => {
    const src = [
      v21KaelPresentation(),
      v21KaelContent(),
      v21KaelEstimateNode(),
      readCustomerSurface('use-customer-kael-decision-actions.ts'),
    ].join('\n')
    expect(src).toContain("chat?.session.next_action === 'estimate_ready'")
    expect(src).toContain('confirmAgenticEstimate')
    expect(src).toContain('AgenticChatEstimateResponse')
    expect(src).not.toContain('AgenticChatEstimateCard')
    expect(src).not.toContain('orchestrating || (canStartOrchestration && !orchestrationStarted)')
  })

  it('keeps active V21 chat canvas from restoring full-screen mint flood values', () => {
    const src = v21ChatAura()
    expect(src).toContain('customer-v21-chat-canvas-aura')
    expect(src).toContain('FormulaMintCanvasAura')
    expect(src).toContain('scope="CustomerChat"')
    expect(src).not.toContain('rgba(136,235,221,0.34)')
    expect(src).not.toContain('rgba(13,174,154,0.22)')
  })

  it('keeps solid deep mint out of Customer and Worker screen backgrounds', () => {
    const surfaceFiles = [
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/customer/v21')),
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/worker')),
    ].filter((path) => /\.tsx?$/.test(path) && !path.includes('__tests__'))
    const solidMintBackground = /backgroundColor:\s*['"](?:#0DAE9A|#08AF9C|#087D72|#055B54)['"]/
    const solidMintVariableBackground = /backgroundColor:\s*(?:tokens\.primary|color\.brand\.primary(?:Dark|Deep)?|color\.primary(?:Dark)?)/
    const screenBackgroundContext = /(?:safeArea|surfaceGlass|surfaceSolid|canvas|screen|chatFrame|kaelOrbCustomerSafeArea):\s*\{/
    const offenders = surfaceFiles.flatMap((path) => {
      const lines = readSource(path).split('\n')
      return lines.flatMap((line, index) => {
        if (!solidMintBackground.test(line) && !solidMintVariableBackground.test(line)) return []
        const context = lines.slice(Math.max(0, index - 20), index + 1).join('\n')
        if (!screenBackgroundContext.test(context)) return []
        const rel = path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
        return [`${rel}:${index + 1}`]
      })
    })

    expect(offenders).toEqual([])
  })

  it('keeps Customer and Worker runtime on the final formula mint tokens, not the pre-final dark mint set', () => {
    const runtimeFiles = [
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/customer/v21')),
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/worker')),
      resolve(MOBILE_ROOT, 'design/theme.ts'),
      resolve(MOBILE_ROOT, 'design/tokens.json'),
    ].filter((path) => /\.tsx?$|\.json$/.test(path) && !path.includes('__tests__'))
    const staleMintTokens = [
      '#49CFC0',
      '#24B3A1',
      '#088779',
      '#055F57',
      '#0DAE9A',
      '#0B9B8A',
      '#087F73',
      '#2DD4BF',
      '#20CDB9',
      '#12BCAA',
      '#069889',
      '#008579',
    ]
    const offenders = runtimeFiles.flatMap((path) => {
      const src = readSource(path)
      const rel = path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
      return staleMintTokens.filter((token) => src.includes(token)).map((token) => `${rel}:${token}`)
    })
    const workerPrimitives = read('components/worker/ui/primitives-surfaces.tsx')

    expect(offenders).toEqual([])
    expect(workerPrimitives).toContain("['#31D7C2', '#09B29E', '#077C72']")
    expect(workerPrimitives).toContain('[0, 0.48, 1] as const')
  })

  it('keeps rgba SVG stops routed through the native-safe alpha helper', () => {
    const componentFiles = listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components'))
      .filter((path) => /\.tsx?$/.test(path))
    const productionMobileSurfaceFiles = [
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/customer/v21')),
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/worker')),
      ...listEdgeServiceFiles(resolve(MOBILE_ROOT, 'components/ui')),
    ].filter((path) => /\.tsx?$/.test(path) && !path.includes('__tests__') && !path.endsWith('svg-alpha-stop.tsx'))
    const offenders = componentFiles
      .filter((path) => {
        const src = readSource(path)
        return /<Stop[^>]*stopColor=.*rgba/.test(src) && !src.includes('AlphaStop as Stop')
      })
      .map((path) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, ''))
    const directStopImports = productionMobileSurfaceFiles
      .filter((path) => {
        const src = readSource(path)
        return /import Svg, \{[^\n}]*\bStop\b[^\n}]*\} from 'react-native-svg'/.test(src)
          || /import \{[^\n}]*\bStop\b[^\n}]*\} from 'react-native-svg'/.test(src)
      })
      .map((path) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, ''))

    const alphaStop = read('components/ui/svg-alpha-stop.tsx')
    expect(offenders).toEqual([])
    expect(directStopImports).toEqual([])
    expect(alphaStop).toContain('toHexChannel')
    expect(alphaStop).toContain('Math.min(255, Math.max(0, Math.round(Number(value))))')
    expect(alphaStop).toContain('toStopOpacity')
    expect(alphaStop).toContain('Math.min(1, Math.max(0, Number(value)))')
    expect(alphaStop).toContain('stopOpacity: stopOpacity ?? toStopOpacity(alpha)')
    expect(alphaStop).not.toContain('stopColor: `rgb(')
  })
})

describe('customer history phase-gated workflow wiring', () => {
  const shell = () => readCustomerSurfaceLayer()

  it('keeps CustomerHistorySurface on the restored V21 activity graph', () => {
    const src = shell()

    expect(src).toContain('export function CustomerHistorySurface')
    expect(src).toContain('testID="customer-v21-activity"')
    expect(src).toContain('ScopeChangeHardStopModal')
    expect(src).toContain('workflow.actions.decideScopeChange(scopeChange.id, { decision })')
    expect(src).not.toContain('customer-history-phase-context')
    expect(src).not.toContain('customer-history-repair-hero-panel')
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
    const src = readFrontendWorkflowLayer()
    expect(src).toContain('useReducer(localWorkflowReducer')
    expect(src).toContain('createInitialLocalWorkflowState')
    expect(src).not.toContain('AsyncStorage')
    expect(src).not.toContain('createClient')
    expect(src).not.toContain('supabase.')
    expect(src).not.toContain('fetch(')
  })

  it('wires the realtime seam into the workflow provider with cleanup and a reduced-poll fallback', () => {
    // Realtime is now the fast path for active timeline, broadcast, and chat;
    // polling stays as a dropped-socket fallback.
    const provider = readFrontendWorkflowLayer()
    const realtime = read('lib/realtime.ts')
    const chatThread = read('lib/use-job-chat-thread.ts')

    // The seam still owns the raw channel; the provider must go through the
    // helpers, never touch postgres_changes directly.
    expect(realtime).toContain('subscribeToJobStatus')
    expect(realtime).toContain('subscribeToJobMessages')
    expect(realtime).toContain('subscribeToWorkerBroadcasts')
    expect(provider).not.toContain('postgres_changes')

    // Provider wires the active customer timeline and worker broadcast surfacing,
    // then tears the channel down on cleanup.
    expect(provider).toContain('subscribeToJobStatus(remoteJobId')
    expect(provider).toContain('subscribeToWorkerBroadcasts(remoteSessionUserId')
    expect(provider).toContain('handle?.unsubscribe()')

    // Poll retained as a dropped-socket fallback (reduced 15s -> 30s), not removed.
    expect(provider).toContain('30_000')
    // A local countdown is advisory. The backend may accept a worker at the
    // deadline, so an expired local snapshot must never disable reconciliation.
    expect(provider).not.toContain("customerBroadcast?.status === 'expired'")

    // The job chat thread gets live counterparty messages with cleanup.
    expect(chatThread).toContain('subscribeToJobMessages')
    expect(chatThread).toContain('handle?.unsubscribe()')

    // ACTIVE_TIMELINE_STATUSES gates BOTH the realtime subscription and the
    // fallback poll. Pin the named constant + its members (sliced to the const
    // block so a member dropped from the array fails even though the status
    // string appears elsewhere in the file).
    expect(provider).toContain('const ACTIVE_TIMELINE_STATUSES')
    const activeStart = provider.indexOf('const ACTIVE_TIMELINE_STATUSES')
    const activeBlock = provider.slice(activeStart, activeStart + 400)
    for (const status of [
      'broadcasting',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
    ]) {
      expect(activeBlock).toContain(`'${status}'`)
    }
  })

  it('resets local workflow when the authenticated user changes', () => {
    const src = readFrontendWorkflowLayer()
    expect(src).toContain('useAuth')
    expect(src).toContain('session?.user.id')
    expect(src).toContain("dispatch({ type: 'reset_workflow' })")
  })

  it('ticks local broadcasts in memory so waiting requests can expire without backend', () => {
    const src = readFrontendWorkflowLayer()
    expect(src).toContain("state.deal?.status !== 'broadcasting'")
    expect(src).toContain("broadcast?.status !== 'sent'")
    expect(src).toContain('setTimeout')
    expect(src).toContain("dispatch({ type: 'tick_broadcast' })")
    expect(src).toContain('clearTimeout')
  })

  it('only decrements notification unread count for items that were unread before local mark-read', () => {
    const src = readFrontendWorkflowLayer()
    expect(src).toContain('locallyReadNotificationIdsRef')
    expect(src).toContain("currentNotification.status !== 'read'")
    expect(src).toContain('!locallyReadNotificationIdsRef.current!.has(notificationId)')
    expect(src).toContain("type: 'mark_read'")
    expect(src).toContain('shouldDecrementUnread,')
    expect(src).not.toContain('setNotificationUnreadCount')
  })

  it('hydrates worker earnings from the mobile API without blocking worker job refresh', () => {
    const src = readFrontendWorkflowLayer()
    expect(src).toContain('workerEarnings: EarningsResponse | null')
    expect(src).toContain('type WorkerRemoteState')
    expect(src).toContain('const [workerRemoteState, setWorkerRemoteState]')
    expect(src).toContain('const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null')
    expect(src).toContain('workerService.getEarnings(currentWorkerYearRange())')
    expect(src).toContain('function currentWorkerYearRange')
    expect(src).toContain('const nextEarnings = earnings.success ? earnings.data : null')
    expect(src).toContain('sameWorkerEarnings')
  })

  it('clears released worker address locally after Kael approves worker cancellation', () => {
    const src = readFrontendWorkflowLayer()
    expect(src).toContain("if (result.data.status === 'approved')")
    expect(src).toContain("status: 'cancelled'")
    expect(src).toContain('fullAddressVisible: false')
    expect(src).toContain('fullAddressLabel: null')
    expect(src).toContain('await workerRefresh()')
  })

  it('normalizes backend price estimates to the required customer disclaimer before UI render', () => {
    const src = readFrontendWorkflowLayer()
    const requiredDisclaimer = 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'
    expect(src).toContain(`const REQUIRED_PRICE_DISCLAIMER = '${requiredDisclaimer}'`)
    expect(src).toContain('disclaimer: REQUIRED_PRICE_DISCLAIMER')
    expect(src).not.toContain('Giá thực tế do thợ xác nhận trước khi bắt đầu.')
    expect(src).not.toContain('Đây là ước tính cần thợ xác nhận')
    expect(src).not.toContain('disclaimer: data.estimate.disclaimer')
  })

  it('does not crash when worker profile array fields are absent from a runtime response', () => {
    const src = readFrontendWorkflowLayer()
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
    expect(mobilePackage.dependencies['expo-notifications']).toBe('~57.0.8')
    expect(appConfig).toContain('withoutIosPushEntitlement')
    expect(appConfig).toContain("delete config.modResults['aps-environment']")
    expect(appConfig).toContain("delete attributes.SystemCapabilities?.['com.apple.Push']")
    expect(appConfig).not.toContain("'expo-notifications'")
    expect(appJson).not.toContain('"expo-notifications"')
  })

  it('registers and unregisters Expo push tokens through the authenticated mobile API wrapper', () => {
    const authProvider = read('lib/auth-provider.tsx')
    const api = read('lib/api.ts')
    const push = read('lib/push-notifications.ts')
    const pushSession = read('lib/use-session-push-registration.ts')
    const services = read('lib/services.ts')
    expect(exists('lib/push-notifications.ts')).toBe(true)
    expect(authProvider).toContain("import { useRouter } from 'expo-router'")
    expect(authProvider).toContain('addPushNotificationResponseListener')
    expect(authProvider).toContain('useSessionPushRegistration')
    expect(authProvider).toContain("profileReady: profileStatus === 'ready'")
    expect(pushSession).toContain("const registrationKey = `${userId}:${input.role}`")
    expect(pushSession).toContain('registrationKeyRef')
    expect(pushSession).toContain('accessToken: desiredRegistration.accessToken')
    expect(pushSession).toContain('role: desiredRegistration.role')
    expect(pushSession).toContain('unregisterPushNotifications')
    expect(push).toContain("require('expo-notifications')")
    expect(push).toContain('getPermissionsAsync')
    expect(push).toContain('requestPermissionsAsync')
    expect(push).toContain('getExpoPushTokenAsync')
    expect(push).toContain('notificationService.registerDeviceToken(payload, input.accessToken)')
    expect(push).toContain('notificationService.unregisterDeviceToken')
    expect(services).toContain("api.postAuthenticated<DevicePushTokenResponse>(")
    expect(services).toContain("api.deleteAuthenticated<DevicePushTokenUnregisterResponse>(")
    expect(api).toContain("request<T>('POST', path, body, accessToken)")
    expect(api).toContain("request<T>('DELETE', path, body, accessToken)")
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
    expect(push).toContain("parsed.pathname === '/(customer)/history'")
    expect(push).toContain("parsed.pathname === '/(worker)/jobs'")
    expect(push).toContain('if (!allowedKeys) return null')
    expect(push).not.toContain('Linking.openURL')
  })
})

// ===================================================================
// Prototype runtime cleanup - store-build guard
// ===================================================================

const removedPrototypeRuntimePaths = [
  'app/client-icons-prototype.tsx',
  'app/design-gallery.tsx',
  'app/prototype',
  'app/prototype/_layout.tsx',
  'app/prototype/client-price-check.tsx',
  'app/prototype/client-frontier.tsx',
  'app/prototype/fleets.tsx',
  'app/(auth)/onboard.tsx',
  'components/auth/auth-surfaces-v2.tsx',
  'components/worker/worker-surfaces-v3.tsx',
  'components/client-price-check/client-price-check-prototype.tsx',
  'components/prototypes/client-icon-image-prototype.tsx',
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

  it('keeps production app route graphs free of prototypes while mounting restored PR72/V5 implementations', () => {
    const routeEntries = listEdgeServiceFiles(resolve(MOBILE_ROOT, 'app'))
      .filter((path) => /\.tsx?$/.test(path))
      .map((path) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, ''))
    const routeGraphFiles = readMobileSourceGraph(routeEntries)
    const rel = (path: string) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
    const blockedNeedles = [
      'CustomerV21',
      'customer-v21-home',
      'customer-v21-home-hero',
      'Kael sẵn sàng hỗ trợ, công việc vẫn do bạn kiểm soát.',
      'Bạn cần gì hôm nay?',
      'Công việc đang xử lý',
    ]
    const offenders = routeGraphFiles
      .filter((path) => {
        const normalized = path.replace(/\\/g, '/')
        if (normalized.includes('/components/customer/v21/')) return true
        if (normalized.includes('/components/prototypes/')) return true
        if (normalized.endsWith('/app/client-icons-prototype.tsx')) return true
        if (normalized.endsWith('/app/design-gallery.tsx')) return true
        const src = readSource(path)
        return blockedNeedles.some((needle) => src.includes(needle))
      })
      .map(rel)

    const allowedRestoredOffenders = offenders.filter((offender) =>
      !RESTORED_CUSTOMER_SURFACE_DIRS.some((dir) => offender.startsWith(dir))
      && offender !== 'components/customer/customer-surfaces.tsx'
    )

    expect(routeGraphFiles.map(rel)).toContain('components/customer/v21/surfaces.tsx')
    expect(routeGraphFiles.map(rel)).toContain('components/worker/worker-v5-flow.tsx')
    expect(routeGraphFiles.map(rel)).not.toContain('components/rebuild/rebuild-surfaces.tsx')
    expect(allowedRestoredOffenders).toEqual([])
  })

  it('keeps restored design entrypoints as active full implementations, not compatibility shims', () => {
    const restoredCustomer = read('components/customer/v21/surfaces.tsx')
    const restoredStorytellingCard = readCustomerSurface('home-storytelling-card.tsx')
    const restoredWorker = read('components/worker/worker-v5-flow.tsx')
    const restoredWorkerDock = read('components/worker/dock/worker-v5-dock-overlay.tsx')
    const restoredSources = [restoredCustomer, restoredStorytellingCard, restoredWorker, restoredWorkerDock].join('\n')

    expect(restoredCustomer).toContain(customerSurfaceSpecifier('shared-surfaces.tsx'))
    expect(restoredCustomer).toContain('export function CustomerHomeSurface')
    expect(restoredCustomer).toContain(customerSurfaceSpecifier('home-storytelling-card.tsx'))
    expect(restoredCustomer).toContain('<HomeStorytellingCard')
    expect(restoredStorytellingCard).toContain('customer-v21-home-hero')
    expect(restoredStorytellingCard).toContain('customer-v21-home-storytelling')
    expect(restoredCustomer).not.toContain('customer-v21-home-card-skin')
    expect(restoredWorker).toContain('export function WorkerHomeSurface')
    expect(restoredWorkerDock).toContain('export function WorkerRebuildDockOverlay')
    expect(restoredWorkerDock).toContain('export function WorkerDockLayoutProvider')
    expect(read('components/worker/home/screen-surfaces.tsx')).toContain('worker-v5-screen-1.1-worker-home')
    expect(restoredWorkerDock).toContain('worker-v5-dock-overlay')
    expect(exists('components/rebuild/rebuild-surfaces.tsx')).toBe(false)
    expect(restoredSources).not.toContain("from '../customer-surfaces'")
    expect(restoredSources).not.toContain("from '../customer/customer-surfaces'")
    expect(restoredSources).not.toContain("from '../worker/worker-surfaces'")
    expect(restoredSources).not.toContain("from './worker-surfaces'")
    expect(restoredSources).not.toContain('@/components/rebuild/rebuild-surfaces')
  })

  it('removes the deleted old split surface directories from the active mobile design graph', () => {
    const customerBridge = read('components/customer/customer-surfaces.tsx')
    const workerBridge = read('components/worker/worker-surfaces.tsx')

    expect(exists('components/customer/surfaces/home.tsx')).toBe(false)
    expect(exists('components/customer/surfaces/history.tsx')).toBe(false)
    expect(exists('components/worker/surfaces/home.tsx')).toBe(false)
    expect(exists('components/worker/surfaces/jobs.tsx')).toBe(false)
    expect(customerBridge).toContain("from './v21/surfaces'")
    expect(workerBridge).toContain("from './worker-v5-flow'")
    expect(workerBridge).toContain("from './dock/worker-v5-dock-overlay'")
    expect(customerBridge).not.toContain("from './surfaces/")
    expect(workerBridge).not.toContain("from './surfaces/")
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

describe('worker V5/XanhSM aligned shell surfaces', () => {
  const shellPath = 'components/worker/worker-surfaces.tsx'
  const shell = () => (exists(shellPath) ? readWorkerSurfaceLayer() : '')
  const workerRoutes = [
    ['home', 'WorkerHomeSurface'],
    ['jobs', 'WorkerJobsSurface'],
    ['chat', 'WorkerChatSurface'],
    ['earnings', 'WorkerEarningsSurface'],
    ['profile', 'WorkerProfileSurface'],
  ] as const

  it('defines the five worker shell surface exports', () => {
    const src = shell()
    const bridge = read(shellPath)
    const workerV5 = read('components/worker/worker-v5-flow.tsx')
    const workerDock = read('components/worker/dock/worker-v5-dock-overlay.tsx')
    expect(exists(shellPath)).toBe(true)
    expect(bridge).toContain("from './worker-v5-flow'")
    expect(bridge).toContain("from './dock/worker-v5-dock-overlay'")
    expect(bridge).not.toContain("from './surfaces/home'")
    expect(bridge).not.toContain("from './surfaces/jobs'")
    expect(bridge).not.toContain("from './surfaces/chat'")
    expect(bridge).not.toContain("from './surfaces/earnings'")
    expect(bridge).not.toContain("from './surfaces/profile'")
    expect(bridge).not.toContain('components/rebuild')
    expect(src).toContain('export function WorkerHomeSurface')
    expect(src).toContain('export function WorkerJobsSurface')
    expect(src).toContain('export function WorkerChatSurface')
    expect(src).toContain('export function WorkerEarningsSurface')
    expect(src).toContain('export function WorkerProfileSurface')
    expect(read('components/worker/home/screen-surfaces.tsx')).toContain('testID="worker-v5-screen-1.1-worker-home"')
    expect(workerV5).toContain('testID={`worker-v5-screen-${screen.id}`}')
    expect(workerDock).toContain('export function WorkerRebuildDockOverlay')
  })

  it('mounts the restored Worker V5 dock overlay from the worker layout route graph', () => {
    const layout = read('app/(worker)/_layout.tsx')
    const routeGraphFiles = readMobileSourceGraph([
      'app/(worker)/_layout.tsx',
      'app/(worker)/home.tsx',
      'app/(worker)/jobs.tsx',
      'app/(worker)/chat.tsx',
      'app/(worker)/earnings.tsx',
      'app/(worker)/profile.tsx',
    ])
    const rel = (path: string) => path.replace(/\\/g, '/').replace(MOBILE_ROOT.replace(/\\/g, '/'), '').replace(/^\//, '')
    const graph = routeGraphFiles.map(rel)
    const workerDock = read('components/worker/dock/worker-v5-dock-overlay.tsx')

    expect(layout).toContain('WorkerDockLayoutProvider')
    expect(layout).toContain('WorkerRebuildDockOverlay')
    expect(layout).toContain('<WorkerRebuildDockOverlay active={activeDock} />')
    expect(layout).toContain('backgroundColor: workerThemeTokens.canvas')
    expect(graph).toContain('components/worker/worker-v5-flow.tsx')
    expect(graph).toContain('components/worker/dock/worker-v5-dock-overlay.tsx')
    expect(graph).not.toContain('components/rebuild/rebuild-surfaces.tsx')
    expect(workerDock).toContain('export function WorkerRebuildDockOverlay')
    expect(workerDock).toContain('export function WorkerDockLayoutProvider')
    expect(workerDock).toContain('testID="worker-v5-dock-overlay"')
    expect(workerDock).toContain('WORKER_V5_DOCK_ROUTE_ITEMS')
    expect(workerDock).toContain('WORKER_V5_DOCK_KAEL_ITEM')
    expect(workerDock).toContain('testID="worker-v5-liquid-navigation"')
    expect(workerDock).toContain('testID="worker-v5-primary-dock"')
    expect(workerDock).toContain('testID="worker-v5-kael-accessory"')
    expect(workerDock).toContain('testID="worker-v5-kael-core-v9"')
    expect(workerDock).toContain('<KaelCoreV9')
    expect(workerDock).toContain('WorkerV5DockTabButton')
    expect(workerDock).toContain('customerV21DockStyles as dockStyles')
    expect(workerDock).toContain('GlassSurface')
    expect(workerDock).toContain('motionTokens.liquid')
    expect(workerDock).not.toContain("@/assets/navigation/customer/kael.png")
    expect(workerDock).not.toContain('@/assets/kael-emotions/kael-emotion-focused.png')
    expect(workerDock).not.toContain('WorkerV5CustomerZipMintAura')
    expect(workerDock).not.toContain("  { icon: 'chat', id: 'kael'")
  })

  it('keeps active home canvases on formula mint aura instead of flat or component-only page washes', () => {
    const theme = read('design/theme.ts')
    const designTokens = read('design/tokens.json')
    const formulaCanvas = read('components/ui/formula-mint-canvas.tsx')
    const customerAura = readCustomerSurface('aura-surfaces.tsx')
    const customerShared = readCustomerSurface('shared-surfaces.tsx')
    const customerHistoryView = readCustomerSurface('service-history-surface.tsx')
    const customerChatAura = readCustomerSurface('chat-surfaces.tsx')
    const workerAura = read('components/worker/ui/aura-surfaces.tsx')
    // Must stay the composition root PLUS the surfaces extracted out of it: the
    // negative assertions below would silently stop covering extracted code otherwise.
    const workerFlow = [
      read('components/worker/worker-v5-flow.tsx'),
      read('components/worker/home/screen-surfaces.tsx'),
      read('components/worker/chat/orb-screen-surfaces.tsx'),
      read('components/worker/chat/kael-body-surfaces.tsx'),
    ].join('\n')

    expect(theme).toContain("bg: '#F1FAF8'")
    expect(theme).toContain("canvas: '#F1FAF8'")
    expect(theme).toContain("background: '#F1FAF8'")
    expect(theme).not.toContain("canvas: '#F4FAF9'")
    expect(theme).not.toContain("background: '#F4FAF9'")
    expect(theme).not.toContain("bg: '#F6F7F7'")
    expect(designTokens).toContain('"canvas": "#F1FAF8"')
    expect(designTokens).not.toContain('"canvas": "#F4FAF9"')
    expect(formulaCanvas).toContain('export function FormulaMintCanvasAura')
    expect(formulaCanvas).toContain('#F9FFFD')
    expect(formulaCanvas).toContain('#F3FBF9')
    expect(formulaCanvas).toContain('#EDF9F6')
    expect(formulaCanvas).not.toContain("variant?: 'customer' | 'worker'")
    expect(formulaCanvas).not.toContain("variant === 'worker'")
    expect(formulaCanvas).not.toContain("return <View pointerEvents=\"none\" style={formulaCanvasFallback")
    expect(formulaCanvas).toContain('gradientUnits="userSpaceOnUse"')
    expect(formulaCanvas).toContain('cx={397.8}')
    expect(formulaCanvas).toContain('cy={-33.76}')
    expect(formulaCanvas).toContain('FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS')
    expect(formulaCanvas).toContain('r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}')
    expect(formulaCanvas).not.toContain('rx={280}')
    expect(formulaCanvas).not.toContain('ry={230}')
    expect(formulaCanvas).toContain('standard radius keeps web and native aligned')
    expect(formulaCanvas).toContain('formulaMintCanvasTopRight')
    expect(formulaCanvas).toContain('rgba(80,232,210,0.34)')
    expect(formulaCanvas).toContain('cx={-70.2}')
    expect(formulaCanvas).toContain('cy={320.72}')
    expect(formulaCanvas).toContain('rgba(136,241,223,0.22)')
    expect(formulaCanvas).toContain('cx={405.6}')
    expect(formulaCanvas).toContain('cy={624.56}')
    expect(formulaCanvas).toContain('rgba(83,220,206,0.24)')
    expect(formulaCanvas).toContain('cx={54.6}')
    expect(formulaCanvas).toContain('cy={877.76}')
    expect(formulaCanvas).toContain('rgba(145,232,222,0.23)')
    expect(formulaCanvas).toContain('formulaMintCanvasAmbientTopLeft')
    expect(formulaCanvas).toContain('cx={8}')
    expect(formulaCanvas).toContain('cy={60.56}')
    expect(formulaCanvas).toContain('rgba(89,232,207,0.20)')
    expect(formulaCanvas).toContain('formulaMintCanvasAmbientMidRight')
    expect(formulaCanvas).toContain('cx={371}')
    expect(formulaCanvas).toContain('cy={411.96}')
    expect(formulaCanvas).toContain('rgba(122,243,223,0.18)')
    expect(formulaCanvas).toContain('formulaMintCanvasAmbientBottomLeft')
    expect(formulaCanvas).toContain('cx={57.5}')
    expect(formulaCanvas).toContain('cy={743.28}')
    expect(formulaCanvas).toContain('rgba(81,216,203,0.15)')
    expect(customerAura).toContain('FormulaMintCanvasAura')
    expect(customerAura).toContain('export function CustomerScreenCanvasAura')
    expect(customerAura).toContain('scope="CustomerHome"')
    expect(customerAura).toContain('scope={`CustomerV21${screenId}`}')
    expect(customerAura).toContain('testID={`customer-v21-screen-canvas-aura-${screenId}`}')
    expect(customerAura).toContain('scope={`CustomerProfile${screenId}`}')
    expect(customerAura).toContain('scope="CustomerLocationEta"')
    expect(customerAura).toContain('scope={`CustomerFulfillment${screenId}`}')
    expect(customerAura).toContain('testID="customer-v21-home-canvas-aura"')
    expect(customerAura).not.toContain('return <CalmCanvas testID="customer-v21-home-canvas-aura" />')
    expect(customerAura).not.toContain('#F6F7F7')
    expect(customerShared).toContain('<CustomerScreenCanvasAura mode={mode} reduceTransparency={reduceTransparency} screenId={screenId} />')
    expect(customerShared).not.toContain('usesHomeMintCanvas')
    expect(customerShared).not.toContain('usesLocationMintCanvas')
    expect(customerShared).not.toContain('usesFulfillmentMintCanvas')
    expect(customerShared).not.toContain('usesAgenticMintCanvas')
    expect(customerShared).not.toContain('usesProfileMintCanvas')
    expect(customerHistoryView).toContain('<V21Screen screenId="2.6-case-overview" testID="customer-v21-activity">')
    expect(customerChatAura).toContain('FormulaMintCanvasAura')
    expect(customerChatAura).toContain('scope="CustomerChat"')
    expect(workerAura).toContain('FormulaMintCanvasAura')
    expect(workerAura).toContain('reduceTransparency?: boolean')
    expect(workerAura).toContain('reduceTransparency={reduceTransparency}')
    expect(workerAura).toContain('scope="WorkerV5Home"')
    expect(workerAura).toContain('testID="worker-v5-page-mint-aura"')
    expect(workerAura).toContain('export function WorkerV5KaelChatScreenAura')
    expect(workerAura).toContain('if (reduceTransparency) return null')
    expect(workerAura).toContain('cx={351}')
    expect(workerAura).toContain('cy={84.4}')
    expect(workerAura).toContain('FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS')
    expect(workerAura).toContain('r={FORMULA_MINT_CANVAS_STANDARD_RADIAL_RADIUS}')
    expect(workerAura).not.toContain('rx={300}')
    expect(workerAura).not.toContain('ry={260}')
    expect(workerAura).toContain('rgba(121,229,211,0.23)')
    expect(workerAura).not.toContain('variant="worker"')
    expect(workerAura).not.toContain('function CalmCanvas')
    expect(workerAura).not.toContain('WorkerV5EarningsHomeAuraBackground')
    expect(workerFlow).toContain('formulaPageAuraTarget')
    expect(workerFlow).toContain("testID: 'worker-v5-earnings-page-customer-mint-aura'")
    expect(workerFlow).toContain("testID: 'worker-v5-profile-page-customer-mint-aura'")
    expect(workerFlow).toContain("screen.id === '5.7-verification-documents'")
    expect(workerFlow).not.toContain("screen.id === '5.8-bank-tax-center'")
    expect(workerFlow).not.toContain('WorkerV5BankTaxBody')
    expect(workerFlow).toContain("screen.id === '5.9-reviews-feedback'")
    expect(exists('components/worker/profile/bank-tax-model.ts')).toBe(false)
    expect(exists('components/worker/profile/bank-tax-styles.ts')).toBe(false)
    expect(exists('components/worker/profile/bank-tax-surfaces.tsx')).toBe(false)
    expect(workerFlow).toContain("scope: 'WorkerDefaultPage'")
    expect(workerFlow).toContain('reduceTransparency={glass.reduceTransparency}')
    expect(workerFlow).toContain('scope={formulaPageAuraTarget.scope}')
    expect(workerFlow).toContain('testID={formulaPageAuraTarget.testID}')
    expect(read('components/worker/home/screen-surfaces.tsx')).toContain('<WorkerV5HomeAuraBackground reduceTransparency={glass.reduceTransparency} />')
    expect(workerFlow).toContain('scope="KaelOrbCustomerPage"')
    expect(workerFlow).toContain('reduceTransparency={reduceTransparency}')
    expect(workerFlow).toContain('testID="worker-v5-kael-orb-background-mint-aura"')
    expect(workerFlow).toContain('<WorkerV5KaelChatScreenAura')
    expect(workerFlow).toContain('reduceTransparency={reduceTransparency}')
    expect(workerFlow).toContain("testID={mode === 'intake' ? 'worker-v5-kael-job-intake-screen-mint-aura' : 'worker-v5-kael-chat-screen-mint-aura'}")
    expect(workerFlow).not.toContain('MintAura intensity="page"')
    expect(workerFlow).not.toContain('pageMintAura')
    expect(workerFlow).not.toContain('!usesCustomerFormulaAura')
    expect(workerFlow).not.toContain('usesCustomerFormulaAura && !glass.reduceTransparency')
    expect(workerFlow).not.toContain('!glass.reduceTransparency ? <WorkerV5HomeAuraBackground /> : null')
    for (const stalePageAuraStyle of [
      'shiftBriefPageAura',
      'demandMapPageAura',
      'opportunityInboxPageAura',
      'offerDetailPageAura',
      'acceptReviewPageAura',
      'routeEtaPageAura',
      'arrivalCheckinPageAura',
      'smartSchedulePageAura',
    ]) {
      expect(workerFlow).not.toContain(stalePageAuraStyle)
    }
  })

  it.each(workerRoutes)('wires (worker)/%s to %s', (route, exportName) => {
    const src = read(`app/(worker)/${route}.tsx`)
    expect(src).toContain(exportName)
    expect(src).toContain('@/components/worker/worker-surfaces')
    expect(src).not.toContain('@/components/worker/worker-surfaces-v3')
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

  it('does not register the removed onboard screen', () => {
    expect(src).not.toContain('"onboard"')
  })

  it('redirects the legacy OTP route instead of exposing a stale standalone screen', () => {
    const verifyOtp = read('app/(auth)/verify-otp.tsx')
    expect(verifyOtp).toContain('Redirect')
    expect(verifyOtp).toContain('/(auth)/login')
    expect(verifyOtp).not.toContain('Xác minh OTP')
    expect(verifyOtp).not.toContain('Nhập mã OTP')
  })
})

describe('auth production login surface', () => {
  const route = read('app/(auth)/login.tsx')
  const surfacePath = 'components/auth/auth-surfaces.tsx'
  const surface = readAuthSurfaceLayer()

  it('wires login to the production auth surface', () => {
    expect(exists(surfacePath)).toBe(true)
    expect(route).toContain('@/components/auth/auth-surfaces')
    expect(route).not.toContain('auth-surfaces-v2')
    expect(surface).toContain('export function LoginRoleSurface')
  })

  it('keeps the six-step role gate and does not restore the removed onboarding route', () => {
    expect(surface).toContain('EntryBrandAccessFlow')
    expect(surface).toContain('auth-entry-six-step-native-lottie')
    expect(surface).toContain('auth-entry-1-3-login-gate')
    expect(surface).toContain('auth-role-gate-content')
    expect(surface).toContain('auth-entry-role-customer')
    expect(surface).toContain('auth-entry-role-worker')
    expect(surface).toContain('auth-role-continue')
    expect(surface).not.toContain('/(auth)/onboard')
    expect(exists('app/(auth)/onboard.tsx')).toBe(false)
  })

  it('requires role-first selection before routing and keeps password auth behind the selected role', () => {
    expect(surface).toContain('useReducer(entryAccessStateReducer')
    expect(surface).toContain('role: initialRole')
    expect(surface).toContain('useEntryAccessState(initialRole, initialStep)')
    expect(surface).toContain('const chooseRole')
    expect(surface).toContain("onRoleChange('customer')")
    expect(surface).toContain("onRoleChange('worker')")
    expect(surface).toContain('TextInput')
    expect(surface).toContain('secureTextEntry')
    expect(surface).toContain('signInWithPassword')
    expect(surface).toContain('auth-login-email-input')
    expect(surface).toContain('auth-login-password-input')
    expect(surface).toContain('auth-login-submit')
    expect(surface).toContain("props.role === 'customer' ? props.features.customerRegistration : props.features.workerRegistration")
    expect(surface).toContain("props.role === 'customer' &&")
    expect(surface).toContain('auth-client-google-primary')
    expect(surface).not.toContain("onPress={() => router.replace('/(customer)/home')}")
    expect(surface).not.toContain("onPress={() => router.replace('/(worker)/home')}")
  })

  it('keeps the approved native auth entry flow without faking worker provider login', () => {
    expect(surface).toContain('AURORA_NEST_SPLASH_DURATION_MS')
    expect(surface).toContain('auth-splash-1-1')
    expect(surface).not.toContain('auth-welcome-1-2')
    expect(surface).toContain('auth-login-1-4')
    expect(surface).toContain('auth-register-1-5')
    expect(surface).toContain('auth-onboarding-1-6')
    expect(surface).toContain('LottieLogoMark')
    expect(surface).toContain('KaelCoreHero')
    expect(surface).not.toContain('function WelcomeScreen')
    expect(surface).not.toContain('KaelCoreMark')
    expect(surface).toContain('GlassPanel')
    expect(surface).toContain('NativeSafeGlassPanel')
    expect(surface).toContain('ProviderButton')
    expect(surface).toContain('auth-client-google-primary')
    expect(surface).not.toContain('auth-client-gmail-secondary')
    expect(surface).not.toContain('auth-client-facebook-secondary')
    expect(surface).toContain("showProviders = props.role === 'customer' && (props.features.customerApple || props.features.customerGoogle)")
    expect(surface).toContain('identifierFieldProps(props.identifier, props.role, props.language)')
    expect(surface).toContain('auth-login-email-input')
    expect(surface).toContain('auth-recovery-submit')
    expect(surface).toContain('workerRegistration')
    expect(surface).toContain('submitWorkerApplication')
    expect(surface).not.toContain('auth-worker-google')
  })

})

// ===================================================================
// Root layout - AuthProvider wrapping
// ===================================================================

describe('root layout', () => {
  const src = read('app/_layout.tsx')

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

  it('redirects to (auth)/login when no session', () => {
    expect(src).toContain('/(auth)/login')
    expect(src).not.toContain('/(auth)/onboard')
  })

  it('uses Redirect from expo-router (not router.push)', () => {
    expect(src).toContain('Redirect')
    expect(src).toMatch(/import\s+\{.*Redirect.*\}\s+from\s+['"]expo-router['"]/)
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

  it('only detects auth sessions in URL for real web OAuth redirects', () => {
    expect(src).toContain("import { Platform } from 'react-native'")
    expect(src).toContain("detectSessionInUrl: !localVisualAudit && Platform.OS === 'web'")
  })

  it('keeps tokens only for real sessions', () => {
    expect(src).toContain('autoRefreshToken: !localVisualAudit')
    expect(src).toContain('persistSession: !localVisualAudit')
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
  const src = [read('lib/auth-provider.tsx'), read('lib/auth-oauth-runtime.ts')].join('\n')

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
    const oauthRuntime = read('lib/auth-oauth-runtime.ts')
    expect(src).toContain('signInWithPassword')
    expect(src).toContain('signInWithGoogle')
    expect(src).toContain('supabase.auth.signInWithOAuth')
    expect(src).toContain('inspectOAuthCallbackUrl')
    expect(src).toContain('exchangeOAuthCodeForSession')
    expect(oauthRuntime).toContain('supabase.auth.exchangeCodeForSession(code)')
    expect(src).toContain('signOut')
    expect(src).toContain('refreshProfile')
    expect(src).toContain('profileStatus')
    expect(src).toContain('profile_missing')
    expect(src).toContain('profile_error')
    expect(src).toContain('authError')
  })

  it('handles Supabase auth/profile failures without leaving loading stuck', () => {
    expect(src).toContain('try {')
    expect(src).toContain('} catch {')
    expect(src).toContain('Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.')
    expect(src).toContain('Không thể tải hồ sơ đăng nhập')
    expect(src).toContain('Vai trò tài khoản không hợp lệ')
  })

  it('calls parseAuthIdentifier before signInWithPassword', () => {
    expect(src).toContain('parseAuthIdentifier')
    expect(src).toContain('validateAuthIdentifier')
    expect(src.indexOf('const identifier = parseAuthIdentifier(identifierInput)')).toBeLessThan(src.indexOf('supabase.auth.signInWithPassword(credentials)'))
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
  const src = readAuthSurfaceLayer()

  it('shows recovery actions for profile errors without rendering raw profile status values', () => {
    expect(src).toContain("profileStatus === 'profile_missing'")
    expect(src).toContain('profileRecoveryStep')
    expect(src).toContain('onCompleteOnboarding')
    expect(src).toContain('refreshProfile')
    expect(src).not.toContain('{profileStatus}</Text>')
    expect(src).not.toContain('<Text style={styles.errorText}>{profileStatus}</Text>')
  })

  it('keeps login background structural instead of decorative orb blobs', () => {
    expect(src).toContain('function PageAura')
    expect(src).toContain("if (Platform.OS !== 'web') return null")
    expect(src).toContain("if (reduceTransparency || Platform.OS !== 'web') return null")
    expect(src).toContain('PathWithFallback')
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

  // A missing name, scheme, bundle identifier, or package fails `eas build` on
  // the first step. Reading app.json to assert the field is present is the
  // manifest-field pattern this suite dropped elsewhere; what stays below are
  // the fields with a value the build does not check for us.
  it('has iOS store build metadata and review permission copy', () => {
    expect(expo.ios?.buildNumber).toBeDefined()
    expect(expo.ios?.config?.usesNonExemptEncryption).toBe(false)
    expect(expo.ios?.infoPlist?.NSCameraUsageDescription).toContain('camera')
    expect(expo.ios?.infoPlist?.NSPhotoLibraryUsageDescription).toContain('ảnh')
  })

  it('has an Android version code that can replace the prior preview build', () => {
    expect(expo.android?.versionCode).toBeGreaterThan(1)
  })

  it('excludes the generated Android project from the EAS upload', () => {
    expect(readRepository('.easignore')).toMatch(/^\/apps\/mobile\/android\/?$/m)
  })

  it('enables microphone only through the on-device speech recognition plugin', () => {
    expect(expo.android?.versionCode).toBeGreaterThanOrEqual(1)
    expect(expo.android?.permissions).toEqual([])
    expect(expo.android?.blockedPermissions ?? []).not.toContain('android.permission.RECORD_AUDIO')
    const plugins = expo.plugins ?? []
    const speechPlugin = plugins.find((plugin: string | string[]) =>
      Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition'
    ) as string[] | undefined
    expect(speechPlugin?.[1]).toMatchObject({
      microphonePermission: expect.stringContaining('trên thiết bị'),
      speechRecognitionPermission: expect.stringContaining('trên thiết bị'),
    })
  })

  it('has expo-router plugin', () => {
    const plugins = expo.plugins ?? []
    const hasRouter = plugins.some((p: string | string[]) =>
      typeof p === 'string' ? p === 'expo-router' : p[0] === 'expo-router'
    )
    expect(hasRouter).toBe(true)
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

  it('supports an explicit local env file for clean-worktree previews without hardcoding staging values', () => {
    expect(src).toContain('NESTSCOUT_MOBILE_ENV_FILE')
    expect(src).toContain('explicitEnvFiles')
    expect(src).toContain('isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath)')
    expect(src).not.toContain("'.env.staging'")
    expect(src).not.toContain('xyylanuyflrjzbjzhqfl')
  })
})

describe('web preview dependencies', () => {
  const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))
  const rootPackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, '../../package.json'), 'utf-8'))
  const stagingPreviewScript = readSource(resolve(MOBILE_ROOT, '../../scripts/run-mobile-web-staging-preview.ps1'))
  const productionPreviewScript = readSource(resolve(MOBILE_ROOT, '../../scripts/run-mobile-web-production-preview.ps1'))
  const sharedPreviewScript = readSource(resolve(MOBILE_ROOT, '../../scripts/run-mobile-web-preview.ps1'))

  it('declares react-dom for Expo web rendering', () => {
    expect(mobilePackage.dependencies['react-dom']).toBe('19.2.3')
  })

  it('declares react-native-web for Expo web rendering', () => {
    expect(mobilePackage.dependencies['react-native-web']).toBe('~0.21.0')
  })

  it('declares react-native-svg for mobile icon rendering', () => {
    expect(mobilePackage.dependencies['react-native-svg']).toBe('15.15.4')
  })

  it('keeps the existing Reanimated dependency available without forcing it into glass surfaces', () => {
    expect(mobilePackage.dependencies['react-native-reanimated']).toBe('4.5.1')
  })

  it('provides isolated staging and Production web preview runners that load public env without printing values', () => {
    expect(rootPackage.scripts['preview:mobile:web:staging']).toBe(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-mobile-web-staging-preview.ps1',
    )
    expect(rootPackage.scripts['preview:mobile:web:production']).toBe(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-mobile-web-production-preview.ps1',
    )
    expect(stagingPreviewScript).toContain('apps/mobile/.env.staging')
    expect(stagingPreviewScript).toContain('-Environment staging')
    expect(productionPreviewScript).toContain('apps/mobile/.env.local')
    expect(productionPreviewScript).toContain('-Environment production')
    expect(sharedPreviewScript).toContain('NESTSCOUT_MOBILE_ENV_FILE')
    expect(sharedPreviewScript).toContain('EXPO_NO_DOTENV')
    expect(sharedPreviewScript).toContain('lib\\staging-target-safety.ps1')
    expect(sharedPreviewScript).toContain(
      'Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase',
    )
    expect(sharedPreviewScript).toContain(
      'Assert-ProductionSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase',
    )
    expect(sharedPreviewScript).toContain("Require-Env 'EXPO_PUBLIC_SUPABASE_URL'")
    expect(sharedPreviewScript).toContain("Require-Env 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'")
    expect(sharedPreviewScript).toContain('$allowedEnvNames')
    expect(sharedPreviewScript).toContain('if ($AllowedNames -notcontains $name)')
    expect(sharedPreviewScript).toContain('Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames')
    expect(sharedPreviewScript).toContain('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED')
    expect(sharedPreviewScript).not.toMatch(/Write-(Host|Output).*publishableKey/)
    expect(sharedPreviewScript).not.toMatch(/Write-(Host|Output).*\$value/)
  })
})

describe('mobile glassmorphism design system', () => {
  const uiFiles = [
    'components/ui/tokens.ts',
    'components/ui/motion-tokens.ts',
    'components/ui/accessibility-motion.ts',
    'components/ui/glass-surface.tsx',
    'components/ui/kael-core-v9.tsx',
    'components/ui/reduce-motion-aware-animation.ts',
  ] as const

  it.each(uiFiles)('%s exists', (file) => {
    expect(exists(file)).toBe(true)
  })

  it('centralizes glass variants and motion tokens with verified Expo native glass dependencies', () => {
    const tokens = [
      read('components/ui/tokens.ts'),
      read('design/theme.ts'),
    ].join('\n')
    const motion = read('components/ui/motion-tokens.ts')
    const surface = read('components/ui/glass-surface.tsx')
    const mobilePackage = JSON.parse(readFileSync(resolve(MOBILE_ROOT, 'package.json'), 'utf-8'))
    expect(tokens).toContain("export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet'")
    expect(tokens).toContain("export type GlassMaterial = 'liquid' | 'standard'")
    expect(tokens).toContain("material = 'standard'")
    expect(tokens).toContain("const isLiquid = material === 'liquid'")
    expect(tokens).toContain('reduceTransparency ? fallbackBackground')
    expect(tokens).toContain("dark: '#161D1B'")
    expect(tokens).toContain("light: '#FFFFFF'")
    expect(tokens).toContain("dark: '#112522'")
    expect(tokens).toContain("light: '#FFFDF8'")
    expect(tokens).toContain('liquidShadowByVariant')
    expect(tokens).toContain("boxShadow: reduceTransparency ? 'none'")
    expect(motion).not.toContain('440')
    expect(motion).toContain('route: {')
    expect(motion).toContain('reducedMotionCapMs')
    expect(motion).toContain('liquid: {')
    expect(motion).toContain('stiffness: 200')
    expect(mobilePackage.dependencies['expo-glass-effect']).toBe('~57.0.1')
    expect(mobilePackage.dependencies['expo-blur']).toBe('~57.0.2')
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
    expect(surface).toContain('blurMethod="none"')
    expect(surface).toContain("import { Platform, StyleSheet, View")
    expect(surface).toContain("const webNavBackingStyle = Platform.OS === 'web' && variant === 'nav'")
    expect(surface).toContain('styles.webNavBackingLight')
    expect(surface).toContain('styles.webNavBackingDark')
    expect(surface).toContain("const shouldUseBlurFallback = variant !== 'nav' || Platform.OS !== 'web'")
    expect(surface).toContain('!reduceTransparency && shouldUseBlurFallback')
  })

  it('keeps Kael inline in the customer hero and both 4 + 1 docks without reviving raster orb layers', () => {
    const core = read('components/ui/kael-core-v9.tsx')
    const coreContract = read('components/ui/kael-core-v9-contract.ts')
    const customerHome = read('components/customer/v21/surfaces.tsx')
    const customerStorytellingCard = readCustomerSurface('home-storytelling-card.tsx')
    const customerProfile = readCustomerSurface('profile-stateful-surfaces.tsx')
    const customerDock = readCustomerSurface('dock-stateful-surfaces.tsx')
    const workerDock = read('components/worker/dock/worker-v5-dock-overlay.tsx')
    const dockStyles = readCustomerSurface('dock-styles.ts')

    expect(coreContract).toContain("renderer: 'inline-svg'")
    expect(coreContract).toContain("motionVocabulary: ['autoplay-clip', 'formal-bow']")
    expect(coreContract).toContain('KAEL_CORE_V9_SIZE = 72')
    expect(coreContract).toContain('KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS = 3800')
    expect(core).not.toContain('styles.shadow')
    expect(core).not.toContain('shadowOpacity')
    expect(core).not.toContain('shadowScaleX')
    expect(core).not.toContain('groundShadow')
    expect(customerHome).toContain('<HomeStorytellingCard')
    expect(customerStorytellingCard).toContain("from 'react-native-svg'")
    expect(customerStorytellingCard).toContain('testID="customer-v21-home-onboarding-steps"')
    expect(customerStorytellingCard).toContain('testID="customer-v21-home-onboarding-wash"')
    expect(customerStorytellingCard).not.toContain('customerV21Assets.kael')
    expect(customerStorytellingCard).not.toContain('<Image')
    expect(customerProfile).not.toContain('<AssetTile image={customerV21Assets.kael} label={agenticCenterLabel}')
    expect(customerDock).toContain('<KaelCoreV9')
    expect(workerDock).toContain('<KaelCoreV9')
    expect(customerDock).toContain("kaelRef.current?.bow('pointer-press')")
    expect(workerDock).toContain("kaelRef.current?.bow('pointer-press')")
    expect(customerDock).not.toContain('customerV21Assets.kaelNavigation')
    expect(workerDock).not.toContain('assets/navigation/customer/kael.png')
    expect(dockStyles).not.toContain('kaelAccessoryAura')
    expect(dockStyles).not.toContain('kaelAccessoryOrbit')
    expect(dockStyles).not.toContain('kaelAccessoryStatus')
  })

  it('wires scroll direction into both dock overlays without changing their tab navigation contract', () => {
    const customerLayout = read('app/(customer)/_layout.tsx')
    const customerDockController = read('components/customer/v21/surfaces.tsx')
    const customerDockOverlay = readCustomerSurface('dock-stateful-surfaces.tsx')
    const customerOverlay = read('components/customer/v21/surfaces.tsx')
    const customerScroll = readCustomerSurface('shared-surfaces.tsx')
    const workerDock = read('components/worker/dock/worker-v5-dock-overlay.tsx')
    const workerScroll = read('components/worker/worker-v5-flow.tsx')

    expect(customerLayout).toContain('<DockScrollStateProvider>')
    expect(workerDock).toContain('<DockScrollStateProvider>')
    expect(customerScroll).toContain('useDockScrollHandler')
    expect(workerScroll).toContain('useDockScrollHandler')
    expect(customerScroll).toContain('onScroll={onDockScroll}')
    expect(workerScroll).toContain('onScroll={actions.onDockScroll}')
    expect(customerDockController).toContain('const animatedDockScrollStyle = useDockScrollTransform(collapsed, reduceMotion)')
    expect(customerDockController).toContain('animatedDockScrollStyle={animatedDockScrollStyle}')
    expect(customerDockOverlay).toContain('animatedDockScrollStyle')
    expect(workerDock).toContain('animatedDockScrollStyle')
    expect(customerOverlay).toContain('onTabPress={(route) => router.replace(route as never)}')
    expect(workerDock).toContain('router.replace(workerV5Routes[item.id] as never)')
  })

})

// ===================================================================
// Client intake production UI - customer Yêu cầu A2-A5 slice
// ===================================================================

describe('removed legacy price-check production UI', () => {
  const bookingRoute = read('app/(customer)/booking.tsx')
  const productionComponentPath = 'components/client-price-check/client-price-check-flow.tsx'

  it('keeps the removed legacy price-check flow off the primary booking route', () => {
    expect(exists(productionComponentPath)).toBe(false)
    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(bookingRoute).toContain('@/components/customer/customer-surfaces')
    expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
    expect(bookingRoute).not.toContain('@/components/client-price-check/client-price-check-flow')
    expect(bookingRoute).not.toContain('ClientPriceCheckPrototype')
    expect(bookingRoute).not.toContain('client-price-check-prototype')
  })
})

describe('frontend-only workflow safety audit', () => {
  const customerShell = readCustomerSurfaceLayer()
  const workerShell = readWorkerSurfaceLayer()
  const appLanguageStore = read('lib/app-language.ts')
  const apiTypes = readApiTypesLayer()
  const frontendWorkflowProvider = readFrontendWorkflowLayer()
  const edgeRouter = readEdgeRouterLayer()
  const edgeServices = readEdgeServiceLayer()
  const sharedApiTypes = readSource(resolve(__dirname, '../types/api-responses.ts'))

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
    const provider = readFrontendWorkflowLayer()
    expect(provider).toContain("import { useAppLanguage } from './app-language'")
    expect(provider).toContain('workflowErrorCopy')
    expect(provider).toContain('localizeWorkflowError(error, language, code, context)')
    expect(provider).toContain('hydrateRemoteJobById')
    expect(provider).toContain('dispatch({ type: \'hydrate_remote_job\', job: jobDetailToSnapshot(result.data, role ===')
    expect(provider).toContain('Could not update the request. Try again.')
    expect(provider).toContain('return workflowErrorCopy[language].fallback')
    expect(provider).toContain('const mediaError = localizeMediaUploadFailure(uploaded, language)')
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
    // The worker response contract now lives in the domains contract module, not the http layer,
    // and its empty-profile default sits in the platform helper.
    expect(edgeServices).toContain('service_radius_km: number | null')
    expect(readSource(resolve(EDGE_MOBILE_API_SHARED, 'platform/domain-utils.ts')))
      .toContain('service_radius_km: null')
    expect(apiTypes).toContain('export type DeclineBroadcastResponse')
    expect(apiTypes).toContain('export type WorkerRoutePreviewResponse')
    const workerJobListResponse = apiTypes.slice(apiTypes.indexOf('export type WorkerJobListResponse'), apiTypes.indexOf('export type EarningsResponse'))
    expect(workerJobListResponse).toContain('photo_urls: string[]')
    expect(workerJobListResponse).toContain('customer_evidence_photo_urls: string[]')
    expect(workerJobListResponse).toContain('field_evidence_photo_urls: string[]')
    expect(workerJobListResponse).toContain('completion_notes: string | null')
    expect(workerJobListResponse).toContain('completion_photo_urls: string[]')
    expect(workerJobListResponse).toContain('worker_brief_guidance?: Record<string, unknown> | null')
    expect(workerJobListResponse).not.toContain('address_lat: number | null')
    expect(workerJobListResponse).not.toContain('address_lng: number | null')
    expect(workerJobListResponse).not.toContain("geo_source: 'vietmap' | 'google_maps' | 'fallback' | null")
    const sharedWorkerJobListResponse = sharedApiTypes.slice(sharedApiTypes.indexOf('export type WorkerJobListResponse'), sharedApiTypes.indexOf('export type EarningsResponse'))
    expect(sharedWorkerJobListResponse).toContain('photo_urls: string[]')
    expect(sharedWorkerJobListResponse).toContain('customer_evidence_photo_urls: string[]')
    expect(sharedWorkerJobListResponse).toContain('field_evidence_photo_urls: string[]')
    expect(sharedWorkerJobListResponse).toContain('completion_notes: string | null')
    expect(sharedWorkerJobListResponse).toContain('completion_photo_urls: string[]')
  })

  it('keeps provider snapshots aligned to Edge artifacts without giving UI workflow authority', () => {
    expect(frontendWorkflowProvider).toContain('jobDetailToSnapshot(result.data, role ===')
    expect(frontendWorkflowProvider).toContain('workerBriefLinesFromRecord(broadcast.worker_brief_core)')
    expect(frontendWorkflowProvider).toContain('workerBriefLinesFromRecord(job.worker_brief_guidance)')
    expect(frontendWorkflowProvider).toContain('completionPhotoUrls: job.completion_photo_urls')
    expect(frontendWorkflowProvider).toContain('customerEvidencePhotoUrls: job.customer_evidence_photo_urls')
    expect(frontendWorkflowProvider).toContain('fieldEvidencePhotoUrls: job.field_evidence_photo_urls')
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
    expect(workerStatusUpdateSchema).toContain('result.access_check_in = parseWorkerAccessCheckIn(record.access_check_in, jobId)')
    expect(workerStatusUpdateSchema).toContain('if (status === "completed_by_worker")')
    expect(workerStatusUpdateSchema).toContain('Cần ghi chú hoàn tất trước khi báo hoàn tất')
    const createJobReturn = edgeServices.slice(edgeServices.indexOf('return {\n    job_id: jobId'), edgeServices.indexOf('async function cancelAnalyzingJob'))
    expect(createJobReturn).toContain('final_price: null')
    // listWorkerJobs is the last function in the last service module, so slice to end of the layer.
    const listWorkerJobs = edgeServices.slice(edgeServices.indexOf('async function listWorkerJobs'))
    expect(edgeServices).toContain('const WORKER_JOB_LIST_COLUMNS =')
    expect(edgeServices).toContain('photo_urls, completion_notes, completion_photo_urls')
    expect(listWorkerJobs).toContain('.select(WORKER_JOB_LIST_COLUMNS)')
    expect(listWorkerJobs).toContain('.select(`job_id, jobs!inner(${WORKER_JOB_LIST_COLUMNS})`)')
    expect(listWorkerJobs).toContain('projectAddressAccess(row, "worker")')
    expect(listWorkerJobs).not.toContain('address_lat, address_lng, geo_source')
    expect(listWorkerJobs).not.toContain('address_lat: routeLatitude')
    expect(listWorkerJobs).not.toContain('address_lng: routeLongitude')
    expect(listWorkerJobs).toContain('address_access: addressProjection.addressAccess')
    expect(listWorkerJobs).toContain('completion_notes: nullableString(row.completion_notes)')
    expect(listWorkerJobs).toContain('const evidenceReleased = canReleaseJobEvidenceToWorker(')
    expect(listWorkerJobs).toContain('row.matched_at,')
    expect(listWorkerJobs).toContain('const customerEvidenceByJob = new Map(await Promise.all(')
    expect(listWorkerJobs).toContain('await createSignedCaseWorkEvidenceUrls(')
    expect(listWorkerJobs).toContain('asStringArray(row.photo_urls),')
    expect(listWorkerJobs).toContain('const customerEvidencePhotoUrls = evidenceReleased')
    expect(listWorkerJobs).toContain('? customerEvidenceByJob.get(jobId) ?? []')
    expect(listWorkerJobs).toContain('photo_urls: customerEvidencePhotoUrls')
    expect(listWorkerJobs).toContain('customer_evidence_photo_urls: customerEvidencePhotoUrls')
    expect(listWorkerJobs).toContain('field_evidence_photo_urls: evidenceReleased')
    expect(listWorkerJobs).toContain('? fieldEvidenceByJob.get(jobId) ?? []')
    expect(listWorkerJobs).toContain('listJobEvidenceRefsByStage(client')
    expect(listWorkerJobs).toContain('completion_photo_urls: evidenceReleased')
    expect(listWorkerJobs).toContain('? asStringArray(row.completion_photo_urls)')
    expect(edgeRouter).toContain('kind: "workers.routePreview"')
    expect(edgeRouter).toContain('kind: "workers.routeMap"')
    expect(edgeRouter).toContain('getWorkerRoutePreview')
    expect(edgeRouter).toContain('getWorkerRouteMap')
    expect(edgeServices).toContain('if (access.release_stage === "area_only")')
  })
})
