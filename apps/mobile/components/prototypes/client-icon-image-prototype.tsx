import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { localizedServiceLabel, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  type CustomerThemeTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'

const workerReferenceImageIcons = {
  address: require('../../assets/worker-image-icons/utility-map.png'),
  activity: require('../../assets/worker-image-icons/utility-calendar.png'),
  booking: require('../../assets/worker-image-icons/nav-jobs.png'),
  evidence: require('../../assets/worker-image-icons/utility-camera.png'),
  home: require('../../assets/worker-image-icons/nav-home.png'),
  kael: require('../../assets/worker-image-icons/utility-chat.png'),
  payment: require('../../assets/worker-image-icons/utility-wallet.png'),
  privacy: require('../../assets/worker-image-icons/utility-shield.png'),
  profile: require('../../assets/worker-image-icons/nav-profile.png'),
  serviceCleaning: require('../../assets/worker-image-icons/service-cleaning.png'),
  serviceElectrical: require('../../assets/worker-image-icons/service-electrical.png'),
  servicePlumbing: require('../../assets/worker-image-icons/service-plumbing.png'),
} as const

const clientImageIcons = {
  address: require('../../assets/client-image-icons/client-address.png'),
  activity: require('../../assets/client-image-icons/client-activity.png'),
  booking: require('../../assets/client-image-icons/client-booking.png'),
  evidence: require('../../assets/client-image-icons/client-evidence.png'),
  home: require('../../assets/client-image-icons/client-home.png'),
  identity: require('../../assets/client-image-icons/client-identity.png'),
  kael: require('../../assets/client-image-icons/client-kael.png'),
  language: require('../../assets/client-image-icons/client-language.png'),
  logout: require('../../assets/client-image-icons/client-logout-v2.png'),
  payment: require('../../assets/client-image-icons/client-payment.png'),
  phone: require('../../assets/client-image-icons/client-phone-v2.png'),
  privacy: require('../../assets/client-image-icons/client-privacy.png'),
  profile: require('../../assets/client-image-icons/client-profile.png'),
  request: require('../../assets/client-image-icons/client-request.png'),
  serviceCleaning: require('../../assets/client-image-icons/client-service-cleaning.png'),
  serviceElectrical: require('../../assets/client-image-icons/client-service-electrical.png'),
  servicePlumbing: require('../../assets/client-image-icons/client-service-plumbing.png'),
  theme: require('../../assets/client-image-icons/client-theme.png'),
} as const

const commonImageIcons = {
  roleHome: require('../../assets/common-image-icons/common-role-home.png'),
  roleRepair: require('../../assets/common-image-icons/common-role-repair.png'),
} as const

type ClientPrototypeIconName = keyof typeof clientImageIcons
type ClientPrototypeTone = 'mint' | 'neutral' | 'water' | 'warm'
type ClientPrototypeItem = {
  icon: ClientPrototypeIconName
  meta: string
  source?: 'client' | 'worker'
  title: string
  tone: ClientPrototypeTone
}

const prototypeCopy: Record<AppLanguage, {
  activityMeta: string
  activityTitle: string
  addressMeta: string
  addressTitle: string
  bookingMeta: string
  bookingTitle: string
  evidenceMeta: string
  evidenceTitle: string
  flowMeta: string
  flowTitle: string
  heroMeta: string
  heroPill: string
  heroTitle: string
  homeMeta: string
  homeTitle: string
  identityMeta: string
  identityTitle: string
  kaelMeta: string
  kaelTitle: string
  languageMeta: string
  languageTitle: string
  logoutMeta: string
  logoutTitle: string
  missingMeta: string
  missingTitle: string
  paymentMeta: string
  paymentTitle: string
  phoneMeta: string
  phoneTitle: string
  privacyMeta: string
  privacyTitle: string
  profileMeta: string
  profileTitle: string
  referencePairHomeMeta: string
  referencePairHomeTitle: string
  referencePairMeta: string
  referencePairRepairMeta: string
  referencePairRepairTitle: string
  referencePairTitle: string
  referenceMeta: string
  referenceTitle: string
  requestMeta: string
  requestTitle: string
  servicesMeta: string
  servicesTitle: string
  themeTitle: string
  utilityMeta: string
  utilityTitle: string
  viewMeta: string
}> = {
  vi: {
    activityMeta: 'Theo dõi tiến trình',
    activityTitle: 'Hoạt động',
    addressMeta: 'Căn hộ và khu vực',
    addressTitle: 'Địa chỉ',
    bookingMeta: 'Yêu cầu mới',
    bookingTitle: 'Đặt dịch vụ',
    evidenceMeta: 'Ảnh mô tả vấn đề',
    evidenceTitle: 'Hình ảnh',
    flowMeta: 'Nhóm biểu tượng cho các bước khách thấy nhiều nhất.',
    flowTitle: 'Luồng yêu cầu',
    heroMeta: 'Một bộ huy hiệu hình riêng cho khách: mềm hơn worker, rõ ngữ cảnh căn hộ, vẫn giữ chất glass-liquid.',
    heroPill: 'Prototype riêng, không nằm trong production',
    heroTitle: 'Bộ biểu tượng hình cho khách',
    homeMeta: 'Điểm vào chính',
    homeTitle: 'Trang nhà',
    identityMeta: 'Chưa có',
    identityTitle: 'Tên hiển thị',
    kaelMeta: 'Nhận yêu cầu và điều phối',
    kaelTitle: 'Kael',
    languageMeta: 'Tiếng Việt',
    languageTitle: 'Ngôn ngữ',
    logoutMeta: 'Đổi tài khoản',
    logoutTitle: 'Đăng xuất',
    missingMeta: 'Các vị trí trong ảnh Tu gửi, dựng riêng để duyệt trước khi thay production.',
    missingTitle: 'Bổ sung icon còn thiếu',
    paymentMeta: 'Minh bạch sau xác nhận',
    paymentTitle: 'Thanh toán',
    phoneMeta: 'Chưa xác minh',
    phoneTitle: 'Số điện thoại',
    privacyMeta: 'Riêng tư tài khoản',
    privacyTitle: 'Bảo mật',
    profileMeta: 'Thông tin tài khoản',
    profileTitle: 'Hồ sơ',
    referencePairHomeMeta: 'Nền kính xanh mint, biểu tượng nhà rõ',
    referencePairHomeTitle: 'Nhà',
    referencePairMeta: 'Dựng lại đúng tinh thần crop: nền trong, glyph nhỏ, một điểm cam rất tiết chế.',
    referencePairRepairMeta: 'Nền kính kem, cảm giác thao tác sửa chữa',
    referencePairRepairTitle: 'Sửa chữa',
    referencePairTitle: 'Hai mẫu Tu gửi',
    referenceMeta: 'Lấy ngôn ngữ 3D mềm và bóng đổ từ bộ worker hiện có.',
    referenceTitle: 'Nguồn tham khảo worker',
    requestMeta: 'Chưa có yêu cầu',
    requestTitle: 'Yêu cầu',
    servicesMeta: 'Ba dịch vụ đang được hỗ trợ, không thêm danh mục tương lai.',
    servicesTitle: 'Dịch vụ chính',
    themeTitle: 'Giao diện',
    utilityMeta: 'Các biểu tượng phụ trợ cho home, booking, activity và profile.',
    utilityTitle: 'Tiện ích khách',
    viewMeta: 'Xem tiến trình',
  },
  en: {
    activityMeta: 'Track progress',
    activityTitle: 'Activity',
    addressMeta: 'Apartment and area',
    addressTitle: 'Address',
    bookingMeta: 'New request',
    bookingTitle: 'Booking',
    evidenceMeta: 'Problem photos',
    evidenceTitle: 'Media',
    flowMeta: 'Image badges for the steps customers see most often.',
    flowTitle: 'Request flow',
    heroMeta: 'A separate customer badge direction: softer than worker, apartment-aware, still glass-liquid.',
    heroPill: 'Standalone prototype, not production',
    heroTitle: 'Customer image icon set',
    homeMeta: 'Main entry',
    homeTitle: 'Home',
    identityMeta: 'Not set',
    identityTitle: 'Display name',
    kaelMeta: 'Receives and orchestrates',
    kaelTitle: 'Kael',
    languageMeta: 'English',
    languageTitle: 'Language',
    logoutMeta: 'Switch account',
    logoutTitle: 'Sign out',
    missingMeta: 'The spots from Tu’s screenshots, shown here before production replacement.',
    missingTitle: 'Missing icon additions',
    paymentMeta: 'Clear after confirmation',
    paymentTitle: 'Payment',
    phoneMeta: 'Unverified',
    phoneTitle: 'Phone number',
    privacyMeta: 'Account privacy',
    privacyTitle: 'Security',
    profileMeta: 'Account details',
    profileTitle: 'Profile',
    referencePairHomeMeta: 'Mint glass, crisp home glyph',
    referencePairHomeTitle: 'Home',
    referencePairMeta: 'Rebuilt from Tu’s crop: translucent base, small line glyph, and one restrained warm accent.',
    referencePairRepairMeta: 'Cream glass, repair-action feel',
    referencePairRepairTitle: 'Repair',
    referencePairTitle: 'Two submitted directions',
    referenceMeta: 'Uses the existing worker family for 3D softness and shadow language.',
    referenceTitle: 'Worker reference source',
    requestMeta: 'No request yet',
    requestTitle: 'Request',
    servicesMeta: 'The three supported services, with no future category cards.',
    servicesTitle: 'Core services',
    themeTitle: 'Interface',
    utilityMeta: 'Supporting icons for home, booking, activity, and profile.',
    utilityTitle: 'Customer utilities',
    viewMeta: 'View progress',
  },
}

export function ClientIconImagePrototypeSurface() {
  const language = useAppLanguage()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const { width } = useWindowDimensions()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const copy = prototypeCopy[language]
  const contentWidth = Math.min(width - 32, 430)
  const referenceItems: ClientPrototypeItem[] = [
    { icon: 'serviceElectrical', meta: localizedServiceLabel('electrical', language), source: 'worker', title: localizedServiceLabel('electrical', language), tone: 'mint' },
    { icon: 'servicePlumbing', meta: localizedServiceLabel('plumbing', language), source: 'worker', title: localizedServiceLabel('plumbing', language), tone: 'water' },
    { icon: 'serviceCleaning', meta: localizedServiceLabel('cleaning', language), source: 'worker', title: localizedServiceLabel('cleaning', language), tone: 'warm' },
  ]
  const serviceItems: ClientPrototypeItem[] = [
    { icon: 'serviceElectrical', meta: language === 'vi' ? 'Sửa nhanh, rõ rủi ro' : 'Fast repair, clear risk', title: localizedServiceLabel('electrical', language), tone: 'mint' },
    { icon: 'servicePlumbing', meta: language === 'vi' ? 'Rò rỉ, tắc nghẽn, vòi' : 'Leaks, clogs, faucets', title: localizedServiceLabel('plumbing', language), tone: 'water' },
    { icon: 'serviceCleaning', meta: language === 'vi' ? 'Dọn căn hộ gọn sạch' : 'Apartment cleaning', title: localizedServiceLabel('cleaning', language), tone: 'warm' },
  ]
  const flowItems: ClientPrototypeItem[] = [
    { icon: 'kael', meta: copy.kaelMeta, title: copy.kaelTitle, tone: 'mint' },
    { icon: 'booking', meta: copy.bookingMeta, title: copy.bookingTitle, tone: 'neutral' },
    { icon: 'evidence', meta: copy.evidenceMeta, title: copy.evidenceTitle, tone: 'water' },
    { icon: 'payment', meta: copy.paymentMeta, title: copy.paymentTitle, tone: 'warm' },
  ]
  const missingShortcutItems: ClientPrototypeItem[] = [
    { icon: 'request', meta: copy.requestMeta, title: copy.requestTitle, tone: 'mint' },
    { icon: 'activity', meta: copy.viewMeta, title: copy.activityTitle, tone: 'water' },
  ]
  const missingProfileItems: ClientPrototypeItem[] = [
    { icon: 'identity', meta: copy.identityMeta, title: copy.identityTitle, tone: 'neutral' },
    { icon: 'phone', meta: copy.phoneMeta, title: copy.phoneTitle, tone: 'mint' },
    { icon: 'address', meta: copy.identityMeta, title: language === 'vi' ? 'Địa chỉ mặc định' : 'Default address', tone: 'neutral' },
  ]
  const missingSettingsItems: ClientPrototypeItem[] = [
    { icon: 'theme', meta: language === 'vi' ? 'Sáng' : 'Light', title: copy.themeTitle, tone: 'water' },
    { icon: 'language', meta: copy.languageMeta, title: copy.languageTitle, tone: 'neutral' },
    { icon: 'logout', meta: copy.logoutMeta, title: copy.logoutTitle, tone: 'warm' },
  ]
  const utilityItems: ClientPrototypeItem[] = [
    { icon: 'home', meta: copy.homeMeta, title: copy.homeTitle, tone: 'mint' },
    { icon: 'address', meta: copy.addressMeta, title: copy.addressTitle, tone: 'neutral' },
    { icon: 'activity', meta: copy.activityMeta, title: copy.activityTitle, tone: 'water' },
    { icon: 'profile', meta: copy.profileMeta, title: copy.profileTitle, tone: 'neutral' },
    { icon: 'privacy', meta: copy.privacyMeta, title: copy.privacyTitle, tone: 'neutral' },
  ]

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID="client-icon-image-prototype-route">
      <StatusBar style={tokens.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { width: contentWidth }]}
        showsVerticalScrollIndicator={false}
      >
        <ReduceMotionAwareEntranceView distanceY={14} style={styles.heroWrap} testID="client-icon-image-prototype-hero-motion">
          <GlassSurface material="liquid" mode={tokens.mode} style={[styles.hero, prototypeHeroSurface(tokens)]} testID="client-icon-image-prototype-hero" variant="hero">
            <View pointerEvents="none" style={[styles.heroWash, { backgroundColor: prototypeAccent(tokens, 'mint') }]} />
            <View style={styles.heroTop}>
              <PrototypeIconImage icon="kael" label={copy.kaelTitle} size={88} source="client" tone="mint" tokens={tokens} />
              <View style={styles.heroCopy}>
                <Text style={[styles.heroPill, prototypePillSurface(tokens)]} numberOfLines={1}>
                  {copy.heroPill}
                </Text>
                <Text style={[styles.heroTitle, { color: tokens.text }]} numberOfLines={2}>
                  {copy.heroTitle}
                </Text>
                <Text style={[styles.heroMeta, { color: tokens.muted }]} numberOfLines={3}>
                  {copy.heroMeta}
                </Text>
              </View>
            </View>
          </GlassSurface>
        </ReduceMotionAwareEntranceView>

        <PrototypeReferencePairSection
          delayMs={70}
          homeMeta={copy.referencePairHomeMeta}
          homeTitle={copy.referencePairHomeTitle}
          meta={copy.referencePairMeta}
          repairMeta={copy.referencePairRepairMeta}
          repairTitle={copy.referencePairRepairTitle}
          title={copy.referencePairTitle}
          tokens={tokens}
        />
        <PrototypeSection
          compact
          delayMs={90}
          items={referenceItems}
          meta={copy.referenceMeta}
          testID="client-icon-image-worker-reference"
          title={copy.referenceTitle}
          tokens={tokens}
        />
        <PrototypeMissingSection
          delayMs={130}
          meta={copy.missingMeta}
          profileItems={missingProfileItems}
          settingsItems={missingSettingsItems}
          shortcutItems={missingShortcutItems}
          title={copy.missingTitle}
          tokens={tokens}
        />
        <PrototypeSection
          delayMs={170}
          items={serviceItems}
          meta={copy.servicesMeta}
          testID="client-icon-image-services"
          title={copy.servicesTitle}
          tokens={tokens}
        />
        <PrototypeSection
          delayMs={210}
          items={flowItems}
          meta={copy.flowMeta}
          testID="client-icon-image-flow"
          title={copy.flowTitle}
          tokens={tokens}
        />
        <PrototypeSection
          delayMs={250}
          items={utilityItems}
          meta={copy.utilityMeta}
          testID="client-icon-image-utilities"
          title={copy.utilityTitle}
          tokens={tokens}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function PrototypeReferencePairSection({
  delayMs,
  homeMeta,
  homeTitle,
  meta,
  repairMeta,
  repairTitle,
  title,
  tokens,
}: {
  delayMs: number
  homeMeta: string
  homeTitle: string
  meta: string
  repairMeta: string
  repairTitle: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <ReduceMotionAwareEntranceView delayMs={delayMs} distanceY={10} style={styles.section} testID="client-icon-image-reference-pair-motion">
      <View style={styles.sectionHeader} testID="client-icon-image-reference-pair-heading">
        <Text style={[styles.sectionTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <View style={styles.referencePairGrid} testID="client-icon-image-reference-pair">
        <PrototypeReferenceGlyphCard
          meta={homeMeta}
          title={homeTitle}
          tone="mint"
          tokens={tokens}
          variant="home"
        />
        <PrototypeReferenceGlyphCard
          meta={repairMeta}
          title={repairTitle}
          tone="warm"
          tokens={tokens}
          variant="repair"
        />
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function PrototypeReferenceGlyphCard({
  meta,
  title,
  tone,
  tokens,
  variant,
}: {
  meta: string
  title: string
  tone: 'mint' | 'warm'
  tokens: CustomerThemeTokens
  variant: 'home' | 'repair'
}) {
  return (
    <View style={[styles.referencePairCard, prototypeReferencePairSurface(tokens, tone)]} testID={`client-icon-image-reference-${variant}`}>
      <View
        accessibilityLabel={title}
        accessibilityRole="image"
        pointerEvents="none"
        style={styles.referenceAssetSlot}
      >
        <Image
          contentFit="contain"
          source={variant === 'home' ? commonImageIcons.roleHome : commonImageIcons.roleRepair}
          style={styles.referenceAssetImage}
        />
      </View>
      <View style={styles.referencePairCopy}>
        <Text style={[styles.referencePairTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.referencePairMeta, { color: tokens.muted }]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
    </View>
  )
}

function PrototypeSection({
  compact = false,
  delayMs,
  items,
  meta,
  testID,
  title,
  tokens,
}: {
  compact?: boolean
  delayMs: number
  items: ClientPrototypeItem[]
  meta: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <ReduceMotionAwareEntranceView delayMs={delayMs} distanceY={10} style={styles.section} testID={`${testID}-motion`}>
      <View style={styles.sectionHeader} testID={`${testID}-heading`}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <View style={compact ? styles.referenceGrid : styles.iconGrid} testID={testID}>
        {items.map((item) => (
          <PrototypeIconCard compact={compact} item={item} key={item.icon} tokens={tokens} />
        ))}
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function PrototypeMissingSection({
  delayMs,
  meta,
  profileItems,
  settingsItems,
  shortcutItems,
  title,
  tokens,
}: {
  delayMs: number
  meta: string
  profileItems: ClientPrototypeItem[]
  settingsItems: ClientPrototypeItem[]
  shortcutItems: ClientPrototypeItem[]
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <ReduceMotionAwareEntranceView delayMs={delayMs} distanceY={10} style={styles.section} testID="client-icon-image-missing-motion">
      <View style={styles.sectionHeader} testID="client-icon-image-missing-heading">
        <Text style={[styles.sectionTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <View style={styles.missingShortcutGrid} testID="client-icon-image-missing-shortcuts">
        {shortcutItems.map((item) => (
          <View style={[styles.missingShortcutCard, prototypeCardSurface(tokens, item.tone)]} key={item.icon} testID={`client-icon-image-missing-${item.icon}`}>
            <PrototypeIconImage icon={item.icon} label={item.title} size={48} source="client" tone={item.tone} tokens={tokens} />
            <View style={styles.missingShortcutCopy}>
              <Text style={[styles.missingShortcutTitle, { color: tokens.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.missingShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                {item.meta}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <PrototypeMissingList items={profileItems} testID="client-icon-image-missing-profile" tokens={tokens} />
      <PrototypeMissingList items={settingsItems} testID="client-icon-image-missing-settings" tokens={tokens} />
    </ReduceMotionAwareEntranceView>
  )
}

function PrototypeMissingList({
  items,
  testID,
  tokens,
}: {
  items: ClientPrototypeItem[]
  testID: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.missingListCard, prototypeListSurface(tokens)]} testID={testID}>
      {items.map((item, index) => (
        <View
          key={item.icon}
          style={[
            styles.missingListRow,
            index > 0 ? { borderTopColor: tokens.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
          ]}
          testID={`${testID}-${item.icon}`}
        >
          <PrototypeIconImage icon={item.icon} label={item.title} size={32} source="client" tone={item.tone} tokens={tokens} />
          <Text style={[styles.missingRowTitle, { color: tokens.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.missingRowMeta, { color: tokens.muted }]} numberOfLines={1}>
            {item.meta}
          </Text>
        </View>
      ))}
    </View>
  )
}

function PrototypeIconCard({
  compact = false,
  item,
  tokens,
}: {
  compact?: boolean
  item: ClientPrototypeItem
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.iconCard, compact ? styles.iconCardCompact : null, prototypeCardSurface(tokens, item.tone)]} testID={`client-icon-image-${item.icon}`}>
      <PrototypeIconImage icon={item.icon} label={item.title} size={compact ? 58 : 62} source={item.source ?? 'client'} tone={item.tone} tokens={tokens} />
      <View style={styles.cardCopy}>
        <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.cardMeta, { color: tokens.muted }]} numberOfLines={2}>
          {item.meta}
        </Text>
      </View>
    </View>
  )
}

function PrototypeIconImage({
  icon,
  label,
  size,
  source,
  tone,
  tokens,
}: {
  icon: ClientPrototypeIconName
  label: string
  size: number
  source: 'client' | 'worker'
  tone: ClientPrototypeTone
  tokens: CustomerThemeTokens
}) {
  const frameSize = Math.round(size * 1.04)
  const imageSource = source === 'worker' && icon in workerReferenceImageIcons
    ? workerReferenceImageIcons[icon as keyof typeof workerReferenceImageIcons]
    : clientImageIcons[icon]

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      pointerEvents="none"
      style={[
        styles.iconStage,
        prototypeIconStageSurface(tokens, tone),
        {
          borderRadius: Math.round(frameSize * 0.3),
          height: frameSize,
          width: frameSize,
        },
      ]}
    >
      <View style={[styles.iconAura, { backgroundColor: prototypeAccent(tokens, tone) }]} />
      <Image contentFit="contain" source={imageSource} style={{ height: size, width: size }} />
    </View>
  )
}

function prototypeHeroSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.glass,
    borderColor: tokens.glassBorder,
    shadowColor: tokens.mode === 'dark' ? '#000000' : '#15584F',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.28 : 0.08,
    shadowRadius: 30,
  }
}

function prototypeCardSurface(tokens: CustomerThemeTokens, tone: ClientPrototypeTone) {
  const accent = prototypeAccent(tokens, tone)
  const borderColor = tone === 'warm'
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.18)' : 'rgba(187,116,61,0.14)'
    : tone === 'water'
      ? tokens.mode === 'dark' ? 'rgba(130,221,226,0.16)' : 'rgba(81,187,192,0.14)'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(20,73,66,0.10)'

  return {
    backgroundColor: tokens.raised,
    borderColor,
    shadowColor: tokens.mode === 'dark' ? '#000000' : '#134C45',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.18 : 0.06,
    shadowRadius: 18,
    ...(customerReduceTransparency(tokens)
      ? null
      : {
          backgroundImage: tokens.mode === 'dark'
            ? `radial-gradient(circle at 86% 12%, ${accent}, transparent 34%), linear-gradient(180deg, rgba(23,29,27,0.96), rgba(17,22,21,0.92))`
            : `radial-gradient(circle at 86% 12%, ${accent}, transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.97), rgba(247,248,248,0.91))`,
        }),
  } as any
}

function prototypeListSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.raised,
    borderColor: tokens.border,
    shadowColor: tokens.mode === 'dark' ? '#000000' : '#134C45',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.14 : 0.05,
    shadowRadius: 16,
  }
}

function prototypeIconStageSurface(tokens: CustomerThemeTokens, tone: ClientPrototypeTone) {
  const accent = prototypeAccent(tokens, tone)
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(31,42,40,0.74)' : 'rgba(255,255,255,0.80)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.74)',
    shadowColor: tokens.mode === 'dark' ? '#000000' : '#315C52',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.2 : 0.07,
    shadowRadius: 18,
    ...(customerReduceTransparency(tokens)
      ? null
      : {
          backgroundImage: tokens.mode === 'dark'
            ? `radial-gradient(circle at 26% 20%, rgba(255,255,255,0.10), transparent 28%), radial-gradient(circle at 70% 72%, ${accent}, transparent 44%), linear-gradient(145deg, rgba(31,42,40,0.74), rgba(22,29,27,0.60))`
            : `radial-gradient(circle at 24% 18%, rgba(255,255,255,0.82), transparent 28%), radial-gradient(circle at 72% 76%, ${accent}, transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.84), rgba(239,245,243,0.64))`,
        }),
  } as any
}

function prototypeReferencePairSurface(tokens: CustomerThemeTokens, tone: 'mint' | 'warm') {
  const accent = prototypeAccent(tokens, tone)
  const warmBorder = tokens.mode === 'dark' ? 'rgba(224,160,107,0.18)' : 'rgba(226,197,150,0.46)'
  const mintBorder = tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(167,234,221,0.58)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.90)' : tone === 'warm' ? 'rgba(255,253,248,0.96)' : 'rgba(246,255,252,0.94)',
    borderColor: tone === 'warm' ? warmBorder : mintBorder,
    shadowColor: tokens.mode === 'dark' ? '#000000' : tone === 'warm' ? '#835B2B' : '#15584F',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.2 : 0.08,
    shadowRadius: 22,
    ...(customerReduceTransparency(tokens)
      ? null
      : {
          backgroundImage: tokens.mode === 'dark'
            ? `radial-gradient(circle at 74% 18%, ${accent}, transparent 38%), linear-gradient(160deg, rgba(24,32,30,0.96), rgba(14,20,19,0.90))`
            : tone === 'warm'
              ? `radial-gradient(circle at 78% 20%, ${accent}, transparent 36%), linear-gradient(160deg, rgba(255,255,255,0.98), rgba(255,249,238,0.92))`
              : `radial-gradient(circle at 78% 20%, ${accent}, transparent 36%), linear-gradient(160deg, rgba(255,255,255,0.98), rgba(238,255,251,0.90))`,
        }),
  } as any
}

function prototypePillSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(220,251,243,0.88)',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(23,169,149,0.16)',
    color: tokens.primary,
  }
}

function prototypeAccent(tokens: CustomerThemeTokens, tone: ClientPrototypeTone) {
  if (tone === 'warm') return tokens.mode === 'dark' ? 'rgba(224,160,107,0.16)' : 'rgba(187,116,61,0.11)'
  if (tone === 'water') return tokens.mode === 'dark' ? 'rgba(130,221,226,0.15)' : 'rgba(81,187,192,0.11)'
  if (tone === 'neutral') return tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.50)'
  return tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(23,169,149,0.11)'
}

function customerReduceTransparency(tokens: CustomerThemeTokens) {
  return tokens.glassShadow === 'none'
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    gap: 18,
    paddingBottom: 36,
    paddingTop: 18,
  },
  heroWrap: {
    width: '100%',
  },
  hero: {
    borderCurve: 'continuous',
    borderRadius: 32,
    borderWidth: 1,
    minHeight: 206,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
  },
  heroWash: {
    borderRadius: 999,
    height: 188,
    opacity: 0.16,
    position: 'absolute',
    right: -58,
    top: -72,
    width: 188,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 168,
    position: 'relative',
    zIndex: 2,
  },
  heroCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  heroPill: {
    alignSelf: 'flex-start',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 29,
  },
  heroMeta: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 19,
  },
  section: {
    gap: 11,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 22,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
  },
  referenceGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  referencePairGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  referencePairCard: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
    gap: 11,
    minHeight: 176,
    overflow: 'hidden',
    padding: 14,
  },
  referenceAssetSlot: {
    alignItems: 'center',
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  referenceAssetImage: {
    height: 104,
    width: 104,
  },
  referencePairCopy: {
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  referencePairTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 19,
    textAlign: 'center',
  },
  referencePairMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15,
    textAlign: 'center',
  },
  iconCard: {
    borderCurve: 'continuous',
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 10,
    minHeight: 128,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  iconCardCompact: {
    flexBasis: 0,
    minHeight: 122,
  },
  missingShortcutGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  missingShortcutCard: {
    alignItems: 'flex-start',
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: 9,
    minHeight: 124,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  missingShortcutCopy: {
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  missingShortcutTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  missingShortcutMeta: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
  },
  missingListCard: {
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  missingListRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 61,
    paddingVertical: 10,
  },
  missingRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
    minWidth: 0,
  },
  missingRowMeta: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
    maxWidth: 128,
    textAlign: 'right',
  },
  cardCopy: {
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
  },
  cardMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15,
  },
  iconStage: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    zIndex: 2,
  },
  iconAura: {
    borderRadius: 999,
    bottom: -9,
    left: -9,
    opacity: 0.74,
    position: 'absolute',
    right: -9,
    top: -9,
    zIndex: 0,
  },
})
