import { styles } from './styles'
import { customerBookingServiceTileSurface, customerClientAssetBackingSurface, customerClientAssetImageTone, customerClientAssetSoftenerSurface, customerHomeServiceTileSurface, customerIconSurface, customerOpaqueSurface, customerProfileRowIconSurface, customerProfileRowSurface, customerReduceTransparency, customerSelectedServiceTileSurface, glassSurface } from './surface-styles'
import { type SurfaceTone } from './types'
import { CustomerThemeContext, type CustomerThemeTokens, type ThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { type AppLanguage, localizedStatusLabel, useAppLanguage } from '@/lib/app-language'
import { type LocalCustomerSearchState, type LocalDealStatus, type ServiceType } from '@nestscout/shared'
import { Image } from 'expo-image'
import { use, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

const CUSTOMER_V4_PRODUCTION_STANDARD = 'CUSTOMER_V4_PRODUCTION_STANDARD: accepted customer V4 production standard'

const CUSTOMER_V4_VISUAL_CONTRACT = 'CUSTOMER_V4_VISUAL_CONTRACT: production surfaces replace old customer UI'

const CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523 = 'CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523: approved client prototype parity source'

export const CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS = 'customer-no-prototype-sample-client-stats'

const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'

const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute V4 dock'

const CUSTOMER_LAYER_ECOLOGY_V4 = 'CUSTOMER_LAYER_ECOLOGY_V4: glass mint surfaces, warm material wash, compact copy'

const SEMANTIC_LAYER_SWITCH_V4 = 'SEMANTIC_LAYER_SWITCH_V4: light/dark swaps semantic V4 layers'

const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'

const KAEL_CHAT_ROUTE_SHIM_CONTRACT = 'KAEL_CHAT_ROUTE_SHIM_CONTRACT: legacy customer Kael tab redirects to full-screen KaelChatSurface'

const CUSTOMER_APPLE_DARK_ASSET_APPEARANCE = 'CUSTOMER_APPLE_DARK_ASSET_APPEARANCE: client PNG assets use base/elevated dark backing, neutral rim, softened white values, no hard inversion'

const CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS = 'CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS: Home Request Activity use Apple Foundation hierarchy, standard content materials, and Liquid Glass only for controls/navigation'

const CUSTOMER_WORKER_TYPOGRAPHY_PARITY = 'CUSTOMER_WORKER_TYPOGRAPHY_PARITY: customer surfaces use the worker app system-font rhythm, 600/700 weights, and zero letter spacing'

const CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE = 'CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE: Activity uses Apple-style hero material, edge highlight, status lens, and standard-material timeline rail'

void CUSTOMER_APPLE_DARK_ASSET_APPEARANCE

void CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS

void CUSTOMER_WORKER_TYPOGRAPHY_PARITY

void CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE

export const openBookingPath = '/(customer)/booking'

export const openKaelChatPath = '/(customer)/kael-chat'

export const openHistoryPath = '/(customer)/history'

export const customerHistoryTabKeys: CustomerHistoryTab[] = ['repair', 'price', 'chat', 'done']

const clientImageIcons = {
  activity: require('../../../assets/client-image-icons/client-activity.png'),
  address: require('../../../assets/client-image-icons/client-address.png'),
  booking: require('../../../assets/client-image-icons/client-booking.png'),
  evidence: require('../../../assets/client-image-icons/client-evidence.png'),
  external: require('../../../assets/client-image-icons/client-external.png'),
  feedback: require('../../../assets/client-image-icons/client-feedback.png'),
  home: require('../../../assets/client-image-icons/client-home.png'),
  identity: require('../../../assets/client-image-icons/client-identity.png'),
  kael: require('../../../assets/navigation/customer/kael.png'),
  language: require('../../../assets/client-image-icons/client-language.png'),
  logout: require('../../../assets/client-image-icons/client-logout-v2.png'),
  password: require('../../../assets/client-image-icons/client-password.png'),
  payment: require('../../../assets/client-image-icons/client-payment.png'),
  phone: require('../../../assets/client-image-icons/client-phone-v2.png'),
  privacy: require('../../../assets/client-image-icons/client-privacy.png'),
  profile: require('../../../assets/client-image-icons/client-profile.png'),
  request: require('../../../assets/client-image-icons/client-request.png'),
  serviceCleaning: require('../../../assets/client-image-icons/client-service-cleaning.png'),
  serviceElectrical: require('../../../assets/client-image-icons/client-service-electrical.png'),
  servicePlumbing: require('../../../assets/client-image-icons/client-service-plumbing.png'),
  theme: require('../../../assets/client-image-icons/client-theme.png'),
} as const

const vndFormatter = new Intl.NumberFormat('vi-VN')

export type CustomerHistoryTab = 'chat' | 'done' | 'price' | 'repair'

type ClientImageIconName = keyof typeof clientImageIcons

export type IconName =
  | 'apartment'
  | 'boltPanel'
  | 'broom'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'cleaning'
  | 'document'
  | 'estimate'
  | 'external'
  | 'faucet'
  | 'filter'
  | 'feedback'
  | 'history'
  | 'identity'
  | 'kael'
  | 'language'
  | 'logout'
  | 'menu'
  | 'map'
  | 'moon'
  | 'password'
  | 'notification'
  | 'payment'
  | 'person'
  | 'privacy'
  | 'phone'
  | 'plug'
  | 'review'
  | 'request'
  | 'send'
  | 'support'
  | 'ticket'
  | 'theme'
  | 'waterPipe'

const clientImageIconByGlyph: Partial<Record<IconName, ClientImageIconName>> = {
  apartment: 'home',
  boltPanel: 'serviceElectrical',
  broom: 'serviceCleaning',
  calendar: 'activity',
  chat: 'kael',
  cleaning: 'serviceCleaning',
  clock: 'activity',
  document: 'booking',
  external: 'external',
  feedback: 'feedback',
  faucet: 'servicePlumbing',
  history: 'activity',
  identity: 'identity',
  kael: 'kael',
  language: 'language',
  logout: 'logout',
  map: 'address',
  password: 'password',
  payment: 'payment',
  person: 'profile',
  phone: 'phone',
  plug: 'serviceElectrical',
  privacy: 'privacy',
  request: 'request',
  support: 'kael',
  ticket: 'booking',
  theme: 'theme',
  waterPipe: 'servicePlumbing',
}

export function kaelChatPath(serviceType?: ServiceType | null) {
  return serviceType ? `${openKaelChatPath}?serviceType=${serviceType}` : openKaelChatPath
}

export function localizedProfileName(rawName: string, languageMode: AppLanguage) {
  const trimmed = rawName.trim()
  if (!trimmed) return ''
  return languageMode === 'vi' && /^customer(\s+qa)?$/i.test(trimmed) ? '' : trimmed
}

export function readCustomerMetadataString(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function canReplaceCustomerDeal(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

export function customerVisibleStatusLabel(status: LocalDealStatus | null, searchState: LocalCustomerSearchState, language: AppLanguage = 'vi'): string {
  if (searchState === 'no_worker') return language === 'en' ? 'Kael is still matching' : 'Kael đang tìm thợ phù hợp'
  if (searchState === 'searching') return language === 'en' ? 'Kael is finding a worker' : 'Kael đang tìm thợ'
  return localizedStatusLabel(status, language)
}

export function localizedCustomerAreaLabel(area: string | null | undefined, language: AppLanguage, fallback: string) {
  if (!area) return fallback
  if (language === 'vi') return area
  const mapped = area
    .replace(/^Khu vực:\s*/i, '')
    .replace(/Khu vực TP\.?HCM/gi, 'Ho Chi Minh City area')
    .replace(/Khu vực chung/gi, 'General area')
    .replace(/Quận\s*(\d+)/gi, 'District $1')
    .replace(/TP\.?\s*HCM|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return mapped.trim() || fallback
}

const customerVietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

export function localizedCustomerGeneratedText(value: string | null | undefined, language: AppLanguage, fallback: string) {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  if (language === 'en' && customerVietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

export function localizedCustomerComplexityLabel(complexity: string | null | undefined, language: AppLanguage, fallback: string) {
  if (complexity === 'small') return language === 'en' ? 'Small' : 'Nhỏ'
  if (complexity === 'medium') return language === 'en' ? 'Medium' : 'Vừa'
  if (complexity === 'large') return language === 'en' ? 'Large' : 'Lớn'
  return fallback
}

export function formatVnd(value: number) {
  return `${vndFormatter.format(value)}đ`
}

export function isTerminalCustomerDeal(status: LocalDealStatus): boolean {
  return status === 'cancelled' || status === 'reviewed'
}

export function MotionSweep({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const sweep = useSharedValue(0)
  useEffect(() => {
    sweep.value = 0
    sweep.value = withDelay(60, withTiming(1, { duration: 300 }))
  }, [sweep])
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.1 * (1 - sweep.value),
    transform: [{ translateX: -120 + sweep.value * (frameWidth + 240) }, { rotate: '-8deg' }],
  }), [frameWidth])
  if (tokens.glassHighlight === 'transparent') return null
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return <Animated.View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.glassHighlight, left }, sweepStyle]} />
}

export function V4ServiceCard({ compact = false, homeTile = false, icon, meta, onPress, selected = false, showMeta = true, testID, title, tone, water }: { compact?: boolean; homeTile?: boolean; icon: IconName; meta?: string; onPress: () => void; selected?: boolean; showMeta?: boolean; testID: string; title: string; tone?: SurfaceTone; water?: boolean }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  const { reduceMotion } = useGlassAccessibility()
  const iconTone = tone ?? (water ? 'water' : icon === 'cleaning' || icon === 'broom' ? 'warm' : 'service')
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? `Select service ${title}` : `Chọn dịch vụ ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        homeTile ? styles.serviceCardHome : null,
        compact ? styles.serviceCardCompact : null,
        homeTile ? customerHomeServiceTileSurface(tokens, iconTone) : compact ? customerBookingServiceTileSurface(tokens, iconTone) : customerOpaqueSurface(tokens),
        selected ? customerSelectedServiceTileSurface(tokens, iconTone) : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.glassRing, { borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(8,120,110,0.10)' }]} />
      <View style={homeTile ? styles.homeTileIconStage : undefined} testID={homeTile ? `${testID}-icon-stage` : undefined}>
        <IconShell icon={icon} tone={iconTone} size={homeTile ? 42 : compact ? 34 : 38} />
      </View>
      <Text style={[styles.serviceTitle, homeTile ? styles.serviceTitleHome : null, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
      {meta && showMeta ? (
        <Text style={[styles.serviceMeta, { color: tokens.muted }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  )
}

type V4TicketCellVariant = 'default' | 'activity' | 'report'

export function V4TicketCell({
  label,
  testID,
  value,
  valueLines = 2,
  variant = 'default',
}: {
  label: string
  testID?: string
  value: string
  valueLines?: number
  variant?: V4TicketCellVariant
}) {
  const tokens = useCustomerTokens()
  const activityVariant = variant === 'activity'
  const reportVariant = variant === 'report'
  return (
    <View style={[styles.ticketCell, reportVariant ? styles.reportTicketCell : null, customerOpaqueSurface(tokens)]} testID={testID}>
      <Text
        style={[
          styles.ticketLabel,
          activityVariant ? styles.activityTicketLabel : null,
          reportVariant ? styles.reportTicketLabel : null,
          { color: tokens.muted },
        ]}
        numberOfLines={1}
        testID={testID ? `${testID}-label` : undefined}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.ticketValue,
          activityVariant ? styles.activityTicketValue : null,
          reportVariant ? styles.reportTicketValue : null,
          { color: tokens.text },
        ]}
        numberOfLines={valueLines}
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Text>
    </View>
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
    <View style={[styles.quickCard, customerOpaqueSurface(tokens)]} testID={testID}>
      <MappedIcon name={icon} color={tokens.primary} accent={tokens.copper} size={29} />
      <Text style={[styles.quickTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function ListRow({ compact = false, icon, meta, testID, title }: { compact?: boolean; icon: IconName; meta: string; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  const compactRowSurface = compact ? customerProfileRowSurface(tokens) : null
  return (
    <View style={[styles.listRow, compact ? styles.profileListRow : null, compactRowSurface]} testID={testID}>
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
    </View>
  )
}

function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? 'Toggle light and dark mode' : 'Đổi giao diện sáng tối'}
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
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="image" style={[styles.iconButton, glassSurface(tokens, 'strong')]} testID={markerTestID}>
      <SubtleGlassHighlight />
      <MappedIcon name={icon} color={tokens.primary} accent={tokens.copper} size={30} />
    </View>
  )
}

function ClientImageIcon({ chrome = 'inline', name, size }: { chrome?: 'inline' | 'shell'; name: ClientImageIconName; size: number }) {
  const tokens = useCustomerTokens()
  const reduceTransparency = customerReduceTransparency(tokens)
  const imageSize = Math.round(size * 1.28)
  const showInlineBacking = chrome === 'inline'
  return (
    <View
      pointerEvents="none"
      style={[styles.clientImageIconStage, { height: size, width: size }]}
      testID="customer-client-asset-appearance-adaptive"
    >
      {showInlineBacking ? (
        <View
          pointerEvents="none"
          style={[styles.clientImageAssetBacking, customerClientAssetBackingSurface(tokens, 'inline')]}
          testID={tokens.mode === 'dark' ? 'customer-client-asset-dark-elevated-base' : undefined}
        />
      ) : null}
      <Image
        contentFit="contain"
        source={clientImageIcons[name]}
        style={[styles.clientImageIcon, customerClientAssetImageTone(tokens), { height: imageSize, width: imageSize }]}
      />
      {tokens.mode === 'dark' && !reduceTransparency ? (
        <View pointerEvents="none" style={[styles.clientImageAssetSoftener, customerClientAssetSoftenerSurface(tokens)]} testID="customer-client-asset-dark-softener" />
      ) : null}
    </View>
  )
}

export function MappedIcon({ accent, color, name, size = 25 }: { accent: string; color: string; name: IconName; size?: number }) {
  const imageName = clientImageIconByGlyph[name]
  if (imageName) return <ClientImageIcon name={imageName} size={size} />
  return <IconGlyph name={name} color={color} accent={accent} />
}

export function IconShell({ icon, tone = 'service', size = 46 }: { icon: IconName; tone?: SurfaceTone; size?: number }) {
  const tokens = useCustomerTokens()
  const accent = tone === 'water' ? tokens.aqua : tone === 'warm' ? tokens.copper : tokens.copper
  const imageName = clientImageIconByGlyph[icon]

  if (imageName) {
    return (
      <View
        style={[
          styles.iconShell,
          styles.clientImageIconShell,
          customerClientAssetBackingSurface(tokens, 'shell'),
          {
            borderRadius: Math.max(14, Math.round(size * 0.36)),
            height: size,
            width: size,
          },
        ]}
        testID="customer-client-asset-elevated-shell"
      >
        <ClientImageIcon chrome="shell" name={imageName} size={Math.round(size * 0.98)} />
      </View>
    )
  }

  return (
    <View
      style={[
        styles.iconShell,
        {
          ...customerIconSurface(tokens, tone),
          borderRadius: Math.max(14, Math.round(size * 0.36)),
          height: size,
          width: size,
        },
      ]}
    >
      <MappedIcon name={icon} color={tokens.primary} accent={accent} size={Math.round(size * 0.96)} />
    </View>
  )
}

export function PrimaryButton({ compact, label, onPress, testID }: { compact?: boolean; label: string; onPress: () => void; testID?: string }) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact ? styles.primaryButtonCompact : null,
        {
          backgroundColor: tokens.primary,
          boxShadow: tokens.mode === 'dark' ? '0 14px 24px rgba(0,0,0,0.22)' : '0 14px 24px rgba(41,173,151,0.22)',
          experimental_backgroundImage: tokens.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(105,222,198,0.94), rgba(14,156,136,0.88))'
            : 'linear-gradient(135deg, #0B5C50, #0E9C88)',
        } as any,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.primaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export function SecondaryButton({ compact, label, onPress, testID, tone = 'danger' }: { compact?: boolean; label: string; onPress: () => void; testID?: string; tone?: 'danger' | 'primary' }) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, compact ? styles.primaryButtonCompact : null, { borderColor: tokens.borderStrong, backgroundColor: tokens.ghost }, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.secondaryButtonText, { color: tone === 'primary' ? tokens.primary : tokens.danger }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export function useCustomerTokens(): CustomerThemeTokens {
  return use(CustomerThemeContext)
}

export function SubtleGlassHighlight() {
  const tokens = useCustomerTokens()
  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
}

export function SubtleLiquidLight({ testID, variant = 'soft' }: { testID?: string; variant?: 'profile' | 'rim' | 'soft' | 'tab' }) {
  const tokens = useCustomerTokens()
  const style = variant === 'rim'
    ? styles.liquidCardRim
    : variant === 'tab'
      ? styles.liquidTabLight
      : styles.liquidCardLight
  return <View pointerEvents="none" style={[style, { backgroundColor: tokens.aqua }]} testID={testID} />
}

export function IconGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
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

  if (name === 'plug') {
    return (
      <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Path d="M10.2 6.2v5.6M17.8 6.2v5.6" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M8.8 11.6h10.4v3.5a5.2 5.2 0 0 1-10.4 0v-3.5Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M14 20.3v2.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'faucet') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M6.4 9.4h7.4c2.6 0 4.5 1.8 4.5 4.4v1.1" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8.4 6.6h5.5M11.2 6.6v2.8M6.2 12.8h5" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M18.3 16c1.3 1.3 2 2.3 2 3.2a2 2 0 0 1-4 0c0-.9.7-1.9 2-3.2Z" stroke={accent} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'broom') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M18.5 6.2 11 15" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="m10 14.6 4.8 4" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M8.4 16 14 20.7l-1.4 1.6c-1.6.7-3.4.5-5.4-.5l-1.5-1.2L8.4 16Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="m7.2 20 2.6 2.1" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'cleaning') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M17.5 5.5 8 23" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M15.5 9.5h5.2c1.2 0 2 .8 2 2v1.2c0 1.2-.8 2-2 2h-8.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M9.2 20.5c2.2 1.8 5.5 1.8 8.1 0M7 23.2c3.2 2 8.6 2 12 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={21.5} cy={6.5} r={2.2} fill={accent} opacity={0.2} />
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

  if (name === 'phone') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M18.8 20.2c-4.9-.3-9.6-4.9-10-9.8-.1-1.1.7-2 1.8-2h2.1c.8 0 1.5.5 1.7 1.3l.4 1.6c.2.7 0 1.4-.5 1.9l-.8.8c.8 1.5 2 2.7 3.5 3.5l.8-.8c.5-.5 1.2-.7 1.9-.5l1.6.4c.8.2 1.3.9 1.3 1.7v2c0 1.1-.8 1.9-1.9 1.9h-1.9Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8.8 5.8h4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
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

  if (name === 'clock') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M12.5 7.7v5l3 1.8" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M20.5 12.5a8 8 0 1 1-8-8" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M16.8 5.3c1 .6 1.9 1.5 2.5 2.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'chevron') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="m9.5 6.5 6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'external') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M7.5 17.5 17.5 7.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path d="M8 7.5h9.5V17" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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

  if (name === 'moon') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M14.6 4.7a7.4 7.4 0 1 0 5.7 9.8 6.4 6.4 0 0 1-7.8-7.8 7 7 0 0 1 2.1-2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M17.8 5.8h.1" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'menu') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.8 7.4h13.4M5.8 12.5h9.2M5.8 17.6h13.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M17.4 12.5h1.8" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
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
